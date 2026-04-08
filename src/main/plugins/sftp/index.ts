import SftpClient from 'ssh2-sftp-client'
import * as path from 'path'
import type {
  BrowsePlugin,
  PluginManifest,
  ReadDirectoryResult,
  Entry,
  PluginOperation,
  OperationRequest,
  OperationResult
} from '@shared/types'

interface SftpConnection {
  id: string
  client: SftpClient
  host: string
  port: number
  username: string
}

export class SftpPlugin implements BrowsePlugin {
  readonly manifest: PluginManifest = {
    id: 'sftp',
    displayName: 'SFTP',
    version: '1.0.0',
    iconHint: 'network',
    schemes: ['sftp']
  }

  private connections: Map<string, SftpConnection> = new Map()

  async initialize(): Promise<boolean> {
    return true
  }

  async dispose(): Promise<void> {
    for (const conn of this.connections.values()) {
      try {
        await conn.client.end()
      } catch { /* ignore */ }
    }
    this.connections.clear()
  }

  /**
   * locationId format: "connId::/remote/path"
   * connId is "user@host:port"
   */
  async readDirectory(locationId: string | null): Promise<ReadDirectoryResult> {
    if (!locationId) {
      // Show list of saved connections
      return {
        entries: [],
        location: 'SFTP Connections',
        parentId: null
      }
    }

    const [connId, remotePath] = this.parseLocation(locationId)
    const conn = this.connections.get(connId)
    if (!conn) {
      throw new Error(`Not connected to ${connId}. Use Connect first.`)
    }

    const dirPath = remotePath || '/'
    const listing = await conn.client.list(dirPath)

    const entries: Entry[] = listing.map((item) => {
      const isDir = item.type === 'd'
      const ext = isDir ? '' : path.extname(item.name).slice(1).toLowerCase()
      return {
        id: `${connId}::${dirPath === '/' ? '' : dirPath}/${item.name}`,
        name: item.name,
        isContainer: isDir,
        size: isDir ? -1 : item.size,
        modifiedAt: item.modifyTime,
        mimeType: isDir ? 'inode/directory' : '',
        iconHint: isDir ? 'folder' : 'file',
        meta: { extension: ext, connId },
        attributes: {
          readonly: false,
          hidden: item.name.startsWith('.'),
          symlink: item.type === 'l'
        }
      }
    })

    const parentPath = dirPath === '/' ? null : path.posix.dirname(dirPath)
    const parentId = parentPath !== null ? `${connId}::${parentPath}` : null

    return {
      entries,
      location: `sftp://${connId}${dirPath}`,
      parentId
    }
  }

  async resolveLocation(input: string): Promise<string | null> {
    // Accept sftp://user@host:port/path format
    const match = input.match(/^sftp:\/\/([^/]+)(\/.*)?$/)
    if (!match) return null
    const connId = match[1]
    const remotePath = match[2] || '/'
    return `${connId}::${remotePath}`
  }

  getSupportedOperations(): PluginOperation[] {
    return ['delete', 'rename', 'createDirectory']
  }

  async executeOperation(op: OperationRequest): Promise<OperationResult> {
    try {
      switch (op.op) {
        case 'delete': {
          for (const entry of op.entries) {
            const [connId, remotePath] = this.parseLocation(entry.id)
            const conn = this.connections.get(connId)
            if (!conn) throw new Error('Not connected')
            if (entry.isContainer) {
              await conn.client.rmdir(remotePath, true)
            } else {
              await conn.client.delete(remotePath)
            }
          }
          return { success: true }
        }
        case 'rename': {
          const [connId, remotePath] = this.parseLocation(op.entry.id)
          const conn = this.connections.get(connId)
          if (!conn) throw new Error('Not connected')
          const dir = path.posix.dirname(remotePath)
          await conn.client.rename(remotePath, path.posix.join(dir, op.newName))
          return { success: true }
        }
        case 'createDirectory': {
          const [connId, parentPath] = this.parseLocation(op.parentLocationId)
          const conn = this.connections.get(connId)
          if (!conn) throw new Error('Not connected')
          await conn.client.mkdir(path.posix.join(parentPath, op.name), true)
          return { success: true }
        }
        default:
          return { success: false, errors: [{ entryId: '', message: 'Unsupported operation' }] }
      }
    } catch (err) {
      return { success: false, errors: [{ entryId: '', message: String(err) }] }
    }
  }

  async readAt(entryId: string, offset: number, length: number): Promise<Buffer> {
    const [connId, remotePath] = this.parseLocation(entryId)
    const conn = this.connections.get(connId)
    if (!conn) throw new Error('Not connected')
    // ssh2-sftp-client exposes the underlying sftp session for low-level operations
    const sftp = (conn.client as unknown as { sftp: { open: Function; read: Function; close: Function } }).sftp
    if (!sftp?.open) {
      // Fallback: read via stream with range option
      const stream = conn.client.createReadStream(remotePath, {
        start: offset,
        end: offset + length - 1
      }) as unknown as NodeJS.ReadableStream
      return new Promise((resolve, reject) => {
        const chunks: Buffer[] = []
        stream.on('data', (chunk: Buffer) => chunks.push(chunk))
        stream.on('end', () => resolve(Buffer.concat(chunks)))
        stream.on('error', reject)
      })
    }
    return new Promise((resolve, reject) => {
      sftp.open(remotePath, 'r', (err: Error | null, handle: Buffer) => {
        if (err) return reject(err)
        const buf = Buffer.alloc(length)
        sftp.read(handle, buf, 0, length, offset, (readErr: Error | null, bytesRead: number) => {
          sftp.close(handle, () => {})
          if (readErr) return reject(readErr)
          resolve(bytesRead < length ? buf.subarray(0, bytesRead) : buf)
        })
      })
    })
  }

  async getSize(entryId: string): Promise<number> {
    const [connId, remotePath] = this.parseLocation(entryId)
    const conn = this.connections.get(connId)
    if (!conn) throw new Error('Not connected')
    const stat = await conn.client.stat(remotePath)
    return stat.size
  }

  async createReadStream(entryId: string): Promise<NodeJS.ReadableStream | null> {
    const [connId, remotePath] = this.parseLocation(entryId)
    const conn = this.connections.get(connId)
    if (!conn) return null
    try {
      return conn.client.createReadStream(remotePath) as unknown as NodeJS.ReadableStream
    } catch {
      return null
    }
  }

  async writeFromStream(
    destLocationId: string,
    fileName: string,
    stream: NodeJS.ReadableStream
  ): Promise<{ success: boolean; bytesWritten: number; error?: string }> {
    const [connId, destPath] = this.parseLocation(destLocationId)
    const conn = this.connections.get(connId)
    if (!conn) return { success: false, bytesWritten: 0, error: 'Not connected' }
    try {
      const remotePath = path.posix.join(destPath, fileName)
      const writeStream = conn.client.createWriteStream(remotePath) as unknown as NodeJS.WritableStream
      return new Promise((resolve) => {
        let bytesWritten = 0
        stream.on('data', (chunk: Buffer) => { bytesWritten += chunk.length })
        stream.pipe(writeStream)
        writeStream.on('finish', () => resolve({ success: true, bytesWritten }))
        writeStream.on('error', (err: Error) => resolve({ success: false, bytesWritten, error: String(err) }))
      })
    } catch (err) {
      return { success: false, bytesWritten: 0, error: String(err) }
    }
  }

  async deleteSingle(entryId: string): Promise<{ success: boolean; error?: string }> {
    const [connId, remotePath] = this.parseLocation(entryId)
    const conn = this.connections.get(connId)
    if (!conn) return { success: false, error: 'Not connected' }
    try {
      await conn.client.delete(remotePath)
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  }

  // Public method to connect
  async connect(host: string, port: number, username: string, password?: string, privateKey?: string): Promise<string> {
    const connId = `${username}@${host}:${port}`
    const client = new SftpClient()

    const connectConfig: Record<string, unknown> = {
      host,
      port,
      username
    }
    if (password) connectConfig.password = password
    if (privateKey) connectConfig.privateKey = privateKey

    await client.connect(connectConfig as Parameters<SftpClient['connect']>[0])

    this.connections.set(connId, { id: connId, client, host, port, username })
    return connId
  }

  async disconnect(connId: string): Promise<void> {
    const conn = this.connections.get(connId)
    if (conn) {
      await conn.client.end()
      this.connections.delete(connId)
    }
  }

  getConnections(): string[] {
    return Array.from(this.connections.keys())
  }

  private parseLocation(locationId: string): [string, string] {
    const sepIdx = locationId.indexOf('::')
    if (sepIdx < 0) return [locationId, '/']
    return [locationId.slice(0, sepIdx), locationId.slice(sepIdx + 2) || '/']
  }
}
