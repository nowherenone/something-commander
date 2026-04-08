import SMB2 from 'node-smb2'
import type { Readable } from 'stream'
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

interface SmbConnection {
  id: string
  client: InstanceType<typeof SMB2.Client>
  session: Awaited<ReturnType<InstanceType<typeof SMB2.Client>['authenticate']>>
  tree: Awaited<ReturnType<Awaited<ReturnType<InstanceType<typeof SMB2.Client>['authenticate']>>['connectTree']>>
  host: string
  share: string
  username: string
  domain: string
  label: string
}

// node-smb2 throws raw Response objects instead of Errors for protocol failures.
// Convert them to proper Error instances with human-readable messages.
const NTSTATUS_MESSAGES: Record<number, string> = {
  0xC000006D: 'Login failed: bad username or password',
  0xC0000022: 'Access denied',
  0xC00000CC: 'Share not found (bad network name)',
  0xC000006E: 'Account restriction (locked, disabled, or expired)',
  0xC0000064: 'User does not exist',
  0xC000015B: 'Logon type not allowed',
  0xC0000034: 'Path not found',
  0xC000000F: 'File/folder not found',
  0xC0000035: 'Already exists',
  0xC0000043: 'Sharing violation'
}

function smbError(err: unknown): Error {
  if (err instanceof Error) return err
  if (typeof err === 'object' && err !== null) {
    const resp = err as Record<string, unknown>
    const header = resp.header as Record<string, unknown> | undefined
    if (header?.status) {
      const status = Number(header.status) >>> 0 // unsigned
      const known = NTSTATUS_MESSAGES[status]
      if (known) return new Error(known)
      return new Error(`SMB error 0x${status.toString(16).toUpperCase().padStart(8, '0')}`)
    }
  }
  return new Error(typeof err === 'string' ? err : 'Unknown SMB error')
}

export class SmbPlugin implements BrowsePlugin {
  readonly manifest: PluginManifest = {
    id: 'smb',
    displayName: 'Samba / SMB',
    version: '1.0.0',
    iconHint: 'network',
    schemes: ['smb']
  }

  private connections: Map<string, SmbConnection> = new Map()

  async initialize(): Promise<boolean> {
    return true
  }

  async dispose(): Promise<void> {
    for (const conn of this.connections.values()) {
      try {
        await conn.tree.disconnect()
        await conn.session.logoff()
        await conn.client.close()
      } catch { /* ignore */ }
    }
    this.connections.clear()
  }

  /**
   * locationId format: "connId::\path\to\folder"
   * connId is "user@host/share"
   */
  async readDirectory(locationId: string | null): Promise<ReadDirectoryResult> {
    if (!locationId) {
      const entries: Entry[] = Array.from(this.connections.values()).map((conn) => ({
        id: `${conn.id}::`,
        name: conn.label || `\\\\${conn.host}\\${conn.share}`,
        isContainer: true,
        size: -1,
        modifiedAt: 0,
        mimeType: 'inode/directory',
        iconHint: 'drive',
        meta: { host: conn.host, share: conn.share },
        attributes: { readonly: false, hidden: false, symlink: false }
      }))
      return { entries, location: 'SMB Shares', parentId: null }
    }

    const [connId, remotePath] = this.parseLocation(locationId)
    const conn = this.connections.get(connId)
    if (!conn) throw new Error(`Not connected: ${connId}`)

    const dirPath = remotePath || ''
    const listing = await conn.tree.readDirectory(dirPath || undefined)

    const entries: Entry[] = []
    for (const item of listing) {
      // Strip leading ./ that node-smb2 prepends to filenames
      const name = item.filename.replace(/^\.\//, '').replace(/^\.\\/, '')

      // Skip . and .. entries
      if (name === '.' || name === '..' || name === '') continue

      const isDir = item.type === 'Directory'
      const ext = isDir ? '' : path.extname(name).slice(1).toLowerCase()
      const itemPath = dirPath ? `${dirPath}/${name}` : name
      const isHidden = item.fileAttributes.includes('HIDDEN')

      entries.push({
        id: `${connId}::${itemPath}`,
        name,
        isContainer: isDir,
        size: isDir ? -1 : (typeof item.fileSize === 'bigint' ? Number(item.fileSize) : Number(item.fileSize || 0)),
        modifiedAt: item.lastWriteTime.getTime(),
        mimeType: isDir ? 'inode/directory' : '',
        iconHint: isDir ? 'folder' : 'file',
        meta: { extension: ext },
        attributes: {
          readonly: item.fileAttributes.includes('READONLY'),
          hidden: isHidden,
          symlink: false
        }
      })
    }

    // Parent navigation
    let parentId: string | null = null
    if (dirPath) {
      const parentPath = dirPath.includes('/')
        ? dirPath.slice(0, dirPath.lastIndexOf('/'))
        : ''
      parentId = `${connId}::${parentPath}`
    }

    const displayPath = dirPath ? `smb://${conn.host}/${conn.share}/${dirPath}` : `smb://${conn.host}/${conn.share}`

    return {
      entries,
      location: displayPath,
      parentId
    }
  }

  async resolveLocation(input: string): Promise<string | null> {
    // Accept smb://host/share/path or \\host\share\path
    const smbMatch = input.match(/^smb:\/\/([^/]+)\/([^/]+)(\/.*)?$/)
    if (smbMatch) {
      const host = smbMatch[1]
      const share = smbMatch[2]
      const remotePath = (smbMatch[3] || '').slice(1).replace(/\//g, '\\')
      for (const conn of this.connections.values()) {
        if (conn.host === host && conn.share === share) {
          return `${conn.id}::${remotePath}`
        }
      }
    }
    const uncMatch = input.match(/^\\\\([^\\]+)\\([^\\]+)(\\.*)?$/)
    if (uncMatch) {
      const host = uncMatch[1]
      const share = uncMatch[2]
      const remotePath = (uncMatch[3] || '').slice(1)
      for (const conn of this.connections.values()) {
        if (conn.host === host && conn.share === share) {
          return `${conn.id}::${remotePath}`
        }
      }
    }
    return null
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
              await conn.tree.removeDirectory(remotePath)
            } else {
              await conn.tree.removeFile(remotePath)
            }
          }
          return { success: true }
        }
        case 'rename': {
          const [connId, remotePath] = this.parseLocation(op.entry.id)
          const conn = this.connections.get(connId)
          if (!conn) throw new Error('Not connected')
          const dir = remotePath.includes('/')
            ? remotePath.slice(0, remotePath.lastIndexOf('/'))
            : ''
          const newPath = dir ? `${dir}/${op.newName}` : op.newName
          if (op.entry.isContainer) {
            await conn.tree.renameDirectory(remotePath, newPath)
          } else {
            await conn.tree.renameFile(remotePath, newPath)
          }
          return { success: true }
        }
        case 'createDirectory': {
          const [connId, parentPath] = this.parseLocation(op.parentLocationId)
          const conn = this.connections.get(connId)
          if (!conn) throw new Error('Not connected')
          const newDirPath = parentPath ? `${parentPath}/${op.name}` : op.name
          await conn.tree.createDirectory(newDirPath)
          return { success: true }
        }
        default:
          return { success: false, errors: [{ entryId: '', message: 'Unsupported operation' }] }
      }
    } catch (err) {
      return { success: false, errors: [{ entryId: '', message: smbError(err).message }] }
    }
  }

  async enumerateFiles(
    entryIds: string[],
    destDir: string
  ): Promise<Array<{ sourcePath: string; destPath: string; size: number; isDirectory: boolean; relativePath: string }>> {
    const result: Array<{ sourcePath: string; destPath: string; size: number; isDirectory: boolean; relativePath: string }> = []

    // node-smb2 types use BigInt (object wrapper) not bigint (primitive)
    // eslint-disable-next-line @typescript-eslint/no-wrapper-builtins
    type DirEntry = { filename: string; type: string; fileSize: BigInt | bigint | number }

    const itemSize = (item: DirEntry): number =>
      typeof item.fileSize === 'bigint' ? Number(item.fileSize) : Number(item.fileSize || 0)

    const stripPrefix = (fn: string): string =>
      fn.replace(/^\.\//, '').replace(/^\.\\/, '')

    const walkDir = async (connId: string, conn: SmbConnection, remotePath: string, destBase: string, relBase: string): Promise<void> => {
      const listing = await conn.tree.readDirectory(remotePath || undefined)
      for (const item of listing) {
        const name = stripPrefix(item.filename)
        if (name === '.' || name === '..' || name === '') continue
        const childRemote = remotePath ? `${remotePath}/${name}` : name
        const childDest = `${destBase}/${name}`
        const childRel = relBase ? `${relBase}/${name}` : name
        const childEntryId = `${connId}::${childRemote}`

        if (item.type === 'Directory') {
          result.push({ sourcePath: childEntryId, destPath: childDest, size: 0, isDirectory: true, relativePath: childRel })
          await walkDir(connId, conn, childRemote, childDest, childRel)
        } else {
          result.push({ sourcePath: childEntryId, destPath: childDest, size: itemSize(item), isDirectory: false, relativePath: childRel })
        }
      }
    }

    // Group entries by parent directory so we can list each parent once
    // to determine which are files and which are directories (with sizes)
    const byConn = new Map<string, { conn: SmbConnection; paths: string[] }>()
    for (const entryId of entryIds) {
      const [connId, remotePath] = this.parseLocation(entryId)
      const conn = this.connections.get(connId)
      if (!conn || !remotePath) continue
      if (!byConn.has(connId)) byConn.set(connId, { conn, paths: [] })
      byConn.get(connId)!.paths.push(remotePath)
    }

    for (const [connId, { conn, paths }] of byConn) {
      // Group by parent directory
      const byParent = new Map<string, string[]>()
      for (const p of paths) {
        const parent = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : ''
        if (!byParent.has(parent)) byParent.set(parent, [])
        byParent.get(parent)!.push(p)
      }

      for (const [parentPath, childPaths] of byParent) {
        // List the parent directory to get metadata for all entries
        let parentListing: DirEntry[] = []
        try {
          parentListing = await conn.tree.readDirectory(parentPath || undefined) as DirEntry[]
        } catch { /* empty */ }

        const parentMap = new Map<string, DirEntry>()
        for (const item of parentListing) {
          parentMap.set(stripPrefix(item.filename), item)
        }

        for (const remotePath of childPaths) {
          const name = remotePath.includes('/') ? remotePath.slice(remotePath.lastIndexOf('/') + 1) : remotePath
          const entryId = `${connId}::${remotePath}`
          const info = parentMap.get(name)
          const isDir = info ? info.type === 'Directory' : false

          if (isDir) {
            const dirDest = `${destDir}/${name}`
            result.push({ sourcePath: entryId, destPath: dirDest, size: 0, isDirectory: true, relativePath: name })
            await walkDir(connId, conn, remotePath, dirDest, name)
          } else {
            const size = info ? itemSize(info) : 0
            result.push({ sourcePath: entryId, destPath: `${destDir}/${name}`, size, isDirectory: false, relativePath: name })
          }
        }
      }
    }

    return result
  }

  async readAt(entryId: string, offset: number, length: number): Promise<Buffer> {
    const [connId, remotePath] = this.parseLocation(entryId)
    const conn = this.connections.get(connId)
    if (!conn || !remotePath) throw new Error('Not connected')

    // Use the node-smb2 File class for positioned reads via SMB2 protocol
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const File = require('node-smb2/dist/client/File').default
    const file = new File(conn.tree) as { _id: Buffer; open(p: string): Promise<void>; close(): Promise<void> }
    await file.open(remotePath)

    try {
      const MAX_CHUNK = 0x00010000 // 64KB per SMB2 read
      const chunks: Buffer[] = []
      let remaining = length
      let currentOffset = offset

      while (remaining > 0) {
        const chunkSize = Math.min(remaining, MAX_CHUNK)
        const lenBuf = Buffer.alloc(4)
        lenBuf.writeInt32LE(chunkSize, 0)
        const offBuf = Buffer.alloc(8)
        offBuf.writeBigUInt64LE(BigInt(currentOffset))

        const response = await conn.tree.request(
          { type: 8 }, // SMB2 READ
          { fileId: file._id, length: lenBuf, offset: offBuf }
        )
        const data = (response as { body: { buffer: Buffer } }).body.buffer
        if (!data || data.length === 0) break
        chunks.push(data)
        remaining -= data.length
        currentOffset += data.length
        if (data.length < chunkSize) break
      }

      return Buffer.concat(chunks)
    } finally {
      await file.close().catch(() => {})
    }
  }

  async getSize(entryId: string): Promise<number> {
    const [connId, remotePath] = this.parseLocation(entryId)
    const conn = this.connections.get(connId)
    if (!conn || !remotePath) throw new Error('Not connected')

    const parentPath = remotePath.includes('/') ? remotePath.slice(0, remotePath.lastIndexOf('/')) : ''
    const name = remotePath.includes('/') ? remotePath.slice(remotePath.lastIndexOf('/') + 1) : remotePath
    const listing = await conn.tree.readDirectory(parentPath || undefined)
    const match = listing.find((e) => e.filename.replace(/^\.\//, '').replace(/^\.\\/, '') === name)
    if (!match) throw new Error(`File not found: ${remotePath}`)
    return typeof match.fileSize === 'bigint' ? Number(match.fileSize) : Number(match.fileSize || 0)
  }

  async createReadStream(entryId: string): Promise<NodeJS.ReadableStream | null> {
    const [connId, remotePath] = this.parseLocation(entryId)
    const conn = this.connections.get(connId)
    if (!conn || !remotePath) return null
    try {
      return await conn.tree.createFileReadStream(remotePath) as unknown as NodeJS.ReadableStream
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
      const remotePath = destPath ? `${destPath}/${fileName}` : fileName
      const writeStream = await conn.tree.createFileWriteStream(remotePath)
      return new Promise((resolve) => {
        let bytesWritten = 0
        ;(stream as Readable).on('data', (chunk: Buffer) => { bytesWritten += chunk.length })
        ;(stream as Readable).pipe(writeStream as unknown as NodeJS.WritableStream)
        ;(writeStream as unknown as NodeJS.WritableStream).on('finish', () => resolve({ success: true, bytesWritten }))
        ;(writeStream as unknown as NodeJS.WritableStream).on('error', (err: Error) => resolve({ success: false, bytesWritten, error: String(err) }))
      })
    } catch (err) {
      return { success: false, bytesWritten: 0, error: smbError(err).message }
    }
  }

  async deleteSingle(entryId: string): Promise<{ success: boolean; error?: string }> {
    const [connId, remotePath] = this.parseLocation(entryId)
    const conn = this.connections.get(connId)
    if (!conn) return { success: false, error: 'Not connected' }
    try {
      await conn.tree.removeFile(remotePath)
      return { success: true }
    } catch (err) {
      return { success: false, error: smbError(err).message }
    }
  }

  async connect(
    host: string,
    share: string,
    username: string,
    password: string,
    domain?: string,
    label?: string
  ): Promise<string> {
    const connId = `${username}@${host}/${share}`

    let client: InstanceType<typeof SMB2.Client> | null = null
    try {
      client = new SMB2.Client(host)
      await client.connect()

      const session = await client.authenticate({
        domain: domain || '',
        username,
        password,
        forceNtlmVersion: 'v2'
      })

      const tree = await session.connectTree(share)

      // Verify access by listing the root
      await tree.readDirectory()

      this.connections.set(connId, {
        id: connId,
        client,
        session,
        tree,
        host,
        share,
        username,
        domain: domain || '',
        label: label || `\\\\${host}\\${share}`
      })
      return connId
    } catch (err) {
      // Clean up on failure
      if (client) {
        try { await client.close() } catch { /* ignore */ }
      }
      throw smbError(err)
    }
  }

  async disconnect(connId: string): Promise<void> {
    const conn = this.connections.get(connId)
    if (conn) {
      try {
        await conn.tree.disconnect()
        await conn.session.logoff()
        await conn.client.close()
      } catch { /* ignore */ }
      this.connections.delete(connId)
    }
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
