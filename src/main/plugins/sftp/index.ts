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
import { makeDirectoryEntry, makeFileEntry, getExtension } from '../base-plugin'

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
      const id = `${connId}::${dirPath === '/' ? '' : dirPath}/${item.name}`
      const hidden = item.name.startsWith('.')
      const symlink = item.type === 'l'
      if (isDir) {
        return makeDirectoryEntry(id, item.name, { hidden, symlink, meta: { connId } })
      }
      return makeFileEntry(id, item.name, item.size, item.modifyTime, {
        ext: getExtension(item.name),
        iconHint: 'file',
        hidden,
        symlink,
        meta: { connId }
      })
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
    return ['delete', 'rename', 'createDirectory', 'copy', 'move']
  }

  async enumerateFiles(
    entryIds: string[],
    destDir: string
  ): Promise<Array<{ sourcePath: string; destPath: string; size: number; isDirectory: boolean; relativePath: string }>> {
    const result: Array<{ sourcePath: string; destPath: string; size: number; isDirectory: boolean; relativePath: string }> = []

    const walk = async (conn: SftpConnection, remotePath: string, destBase: string, relBase: string): Promise<void> => {
      try {
        const listing = await conn.client.list(remotePath || '/')
        for (const item of listing) {
          if (item.name === '.' || item.name === '..') continue
          const childRemote = remotePath ? `${remotePath}/${item.name}`.replace(/\/+/, '/') : `/${item.name}`
          const childDest = `${destBase}/${item.name}`
          const childRel = relBase ? `${relBase}/${item.name}` : item.name
          const isDir = item.type === 'd'
          const childEntryId = `${conn.id}::${childRemote}`
          if (isDir) {
            result.push({ sourcePath: childEntryId, destPath: childDest, size: 0, isDirectory: true, relativePath: childRel })
            await walk(conn, childRemote, childDest, childRel)
          } else {
            result.push({ sourcePath: childEntryId, destPath: childDest, size: item.size || 0, isDirectory: false, relativePath: childRel })
          }
        }
      } catch {
        // skip unreadable
      }
    }

    for (const entryId of entryIds) {
      const [connId, remotePath] = this.parseLocation(entryId)
      const conn = this.connections.get(connId)
      if (!conn) continue
      const baseName = remotePath ? remotePath.split('/').pop() || '' : ''
      const destBase = destDir ? `${destDir}/${baseName}`.replace(/\/+/, '/') : baseName
      const isDir = await this.isDirectory(conn, remotePath)
      if (isDir || remotePath === '' || remotePath === '/') {
        const relBase = baseName
        result.push({ sourcePath: entryId, destPath: destBase, size: 0, isDirectory: true, relativePath: relBase })
        await walk(conn, remotePath || '/', destBase, relBase)
      } else {
        const stat = await conn.client.stat(remotePath).catch(() => ({ size: 0 }))
        result.push({ sourcePath: entryId, destPath: `${destDir}/${baseName}`.replace(/\/+/, '/'), size: (stat as any).size || 0, isDirectory: false, relativePath: baseName })
      }
    }
    return result
  }

  private async isDirectory(conn: SftpConnection, remotePath: string): Promise<boolean> {
    try {
      const stat = await conn.client.stat(remotePath)
      return stat.isDirectory
    } catch {
      return true // assume dir for root
    }
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

  async statEntry(entryId: string): Promise<{ size: number; modifiedAt: number; isDirectory?: boolean } | null> {
    try {
      const [connId, remotePath] = this.parseLocation(entryId)
      const conn = this.connections.get(connId)
      if (!conn) return null
      const stat = await conn.client.stat(remotePath)
      return { size: stat.size || 0, modifiedAt: (stat as any).mtime || 0, isDirectory: (stat as any).isDirectory }
    } catch {
      return null
    }
  }

  async exists(entryId: string): Promise<boolean> {
    try {
      const s = await this.statEntry(entryId)
      return !!s
    } catch { return false }
  }

  private parseLocation(locationId: string): [string, string] {
    const sepIdx = locationId.indexOf('::')
    if (sepIdx < 0) return [locationId, '/']
    return [locationId.slice(0, sepIdx), locationId.slice(sepIdx + 2) || '/']
  }
}
