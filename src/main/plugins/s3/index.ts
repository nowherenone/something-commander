import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  DeleteObjectCommand,
  PutObjectCommand,
  HeadObjectCommand
} from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { Readable, PassThrough } from 'stream'
import type {
  BrowsePlugin,
  PluginManifest,
  ReadDirectoryResult,
  Entry,
  PluginOperation,
  OperationRequest,
  OperationResult
} from '@shared/types'

interface S3Connection {
  id: string
  client: S3Client
  bucket: string
  region: string
  label: string
}

export class S3Plugin implements BrowsePlugin {
  readonly manifest: PluginManifest = {
    id: 's3',
    displayName: 'AWS S3',
    version: '1.0.0',
    iconHint: 'network',
    schemes: ['s3']
  }

  private connections: Map<string, S3Connection> = new Map()

  async initialize(): Promise<boolean> {
    return true
  }

  async dispose(): Promise<void> {
    this.connections.clear()
  }

  /**
   * locationId format: "connId::/prefix/"
   * e.g. "my-bucket::" for root, "my-bucket::images/" for a prefix
   */
  async readDirectory(locationId: string | null): Promise<ReadDirectoryResult> {
    if (!locationId) {
      // Show list of connected buckets
      const entries: Entry[] = Array.from(this.connections.values()).map((conn) => ({
        id: `${conn.id}::`,
        name: `${conn.label} (${conn.bucket})`,
        isContainer: true,
        size: -1,
        modifiedAt: 0,
        mimeType: 'inode/directory',
        iconHint: 'drive',
        meta: { bucket: conn.bucket },
        attributes: { readonly: false, hidden: false, symlink: false }
      }))
      return { entries, location: 'S3 Buckets', parentId: null }
    }

    const [connId, prefix] = this.parseLocation(locationId)
    const conn = this.connections.get(connId)
    if (!conn) throw new Error(`Not connected: ${connId}`)

    const response = await conn.client.send(
      new ListObjectsV2Command({
        Bucket: conn.bucket,
        Prefix: prefix || undefined,
        Delimiter: '/'
      })
    )

    const entries: Entry[] = []

    // Common prefixes = "directories"
    if (response.CommonPrefixes) {
      for (const cp of response.CommonPrefixes) {
        if (!cp.Prefix) continue
        const name = cp.Prefix.slice((prefix || '').length).replace(/\/$/, '')
        if (!name) continue
        entries.push({
          id: `${connId}::${cp.Prefix}`,
          name,
          isContainer: true,
          size: -1,
          modifiedAt: 0,
          mimeType: 'inode/directory',
          iconHint: 'folder',
          meta: {},
          attributes: { readonly: false, hidden: false, symlink: false }
        })
      }
    }

    // Objects = "files"
    if (response.Contents) {
      for (const obj of response.Contents) {
        if (!obj.Key) continue
        const name = obj.Key.slice((prefix || '').length)
        if (!name || name.endsWith('/')) continue // skip the prefix itself and "directory markers"
        entries.push({
          id: `${connId}::${obj.Key}`,
          name,
          isContainer: false,
          size: obj.Size || 0,
          modifiedAt: obj.LastModified?.getTime() || 0,
          mimeType: '',
          iconHint: 'file',
          meta: { key: obj.Key },
          attributes: { readonly: false, hidden: false, symlink: false }
        })
      }
    }

    const displayPrefix = prefix || '/'
    const parentPrefix = prefix
      ? prefix.replace(/[^/]+\/$/, '')
      : null
    const parentId = parentPrefix !== null ? `${connId}::${parentPrefix}` : null

    return {
      entries,
      location: `s3://${conn.bucket}/${displayPrefix}`,
      parentId
    }
  }

  async resolveLocation(input: string): Promise<string | null> {
    const match = input.match(/^s3:\/\/([^/]+)(\/.*)?$/)
    if (!match) return null
    const bucket = match[1]
    const prefix = (match[2] || '/').slice(1)
    // Find connection by bucket name
    for (const conn of this.connections.values()) {
      if (conn.bucket === bucket) {
        return `${conn.id}::${prefix}`
      }
    }
    return null
  }

  getSupportedOperations(): PluginOperation[] {
    return ['copy', 'delete', 'rename', 'createDirectory']
  }

  async executeOperation(op: OperationRequest): Promise<OperationResult> {
    try {
      switch (op.op) {
        case 'delete': {
          for (const entry of op.entries) {
            const [connId, key] = this.parseLocation(entry.id)
            const conn = this.connections.get(connId)
            if (!conn) throw new Error('Not connected')
            await conn.client.send(new DeleteObjectCommand({ Bucket: conn.bucket, Key: key }))
          }
          return { success: true }
        }
        case 'createDirectory': {
          const [connId, parentPrefix] = this.parseLocation(op.parentLocationId)
          const conn = this.connections.get(connId)
          if (!conn) throw new Error('Not connected')
          // S3 "directories" are just prefixes; create a zero-byte marker
          const key = `${parentPrefix}${op.name}/`
          await conn.client.send(new PutObjectCommand({ Bucket: conn.bucket, Key: key, Body: '' }))
          return { success: true }
        }
        default:
          return { success: false, errors: [{ entryId: '', message: `Unsupported: ${op.op}` }] }
      }
    } catch (err) {
      return { success: false, errors: [{ entryId: '', message: String(err) }] }
    }
  }

  async createReadStream(entryId: string): Promise<NodeJS.ReadableStream | null> {
    const [connId, key] = this.parseLocation(entryId)
    const conn = this.connections.get(connId)
    if (!conn || !key) return null

    try {
      const response = await conn.client.send(
        new GetObjectCommand({ Bucket: conn.bucket, Key: key })
      )
      if (response.Body instanceof Readable) {
        return response.Body
      }
      // response.Body might be a web ReadableStream in some environments
      // Convert it
      if (response.Body) {
        const passThrough = new PassThrough()
        const webStream = response.Body as AsyncIterable<Uint8Array>
        ;(async () => {
          for await (const chunk of webStream) {
            passThrough.write(chunk)
          }
          passThrough.end()
        })()
        return passThrough
      }
      return null
    } catch {
      return null
    }
  }

  async writeFromStream(
    destLocationId: string,
    fileName: string,
    stream: NodeJS.ReadableStream
  ): Promise<{ success: boolean; bytesWritten: number; error?: string }> {
    const [connId, prefix] = this.parseLocation(destLocationId)
    const conn = this.connections.get(connId)
    if (!conn) return { success: false, bytesWritten: 0, error: 'Not connected' }

    const key = `${prefix}${fileName}`

    try {
      // Use multipart upload for large files
      const upload = new Upload({
        client: conn.client,
        params: {
          Bucket: conn.bucket,
          Key: key,
          Body: stream as Readable
        },
        queueSize: 4,
        partSize: 5 * 1024 * 1024 // 5MB parts
      })

      let bytesWritten = 0
      upload.on('httpUploadProgress', (progress) => {
        if (progress.loaded) bytesWritten = progress.loaded
      })

      await upload.done()
      return { success: true, bytesWritten }
    } catch (err) {
      return { success: false, bytesWritten: 0, error: String(err) }
    }
  }

  async deleteSingle(entryId: string): Promise<{ success: boolean; error?: string }> {
    const [connId, key] = this.parseLocation(entryId)
    const conn = this.connections.get(connId)
    if (!conn) return { success: false, error: 'Not connected' }
    try {
      await conn.client.send(new DeleteObjectCommand({ Bucket: conn.bucket, Key: key }))
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  }

  // Public API for connection management
  async connect(
    bucket: string,
    region: string,
    accessKeyId: string,
    secretAccessKey: string,
    label?: string
  ): Promise<string> {
    const connId = `s3-${bucket}`
    const client = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey }
    })

    // Verify connection by listing (will throw if invalid)
    await client.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }))

    this.connections.set(connId, {
      id: connId,
      client,
      bucket,
      region,
      label: label || bucket
    })
    return connId
  }

  disconnect(connId: string): void {
    this.connections.delete(connId)
  }

  getConnections(): string[] {
    return Array.from(this.connections.keys())
  }

  private parseLocation(locationId: string): [string, string] {
    const sepIdx = locationId.indexOf('::')
    if (sepIdx < 0) return [locationId, '']
    return [locationId.slice(0, sepIdx), locationId.slice(sepIdx + 2)]
  }
}
