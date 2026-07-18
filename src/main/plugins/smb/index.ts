import SMB2 from 'node-smb2'
import type { Readable } from 'stream'
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
import { smbError } from '../shared/smb-errors'

interface SmbConnection {
  id: string // serverId: user@host
  client: InstanceType<typeof SMB2.Client>
  session: Awaited<ReturnType<InstanceType<typeof SMB2.Client>['authenticate']>>
  host: string
  username: string
  domain: string
  label: string
  // Lazy trees per share (IPC$ is used internally when no share specified)
  trees: Map<string, Awaited<ReturnType<Awaited<ReturnType<InstanceType<typeof SMB2.Client>['authenticate']>>['connectTree']>>>
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
        for (const tree of conn.trees.values()) {
          await tree.disconnect().catch(() => {})
        }
        await conn.session.logoff()
        await conn.client.close()
      } catch { /* ignore */ }
    }
    this.connections.clear()
  }

  /**
   * locationId format: "user@host/share/path/to/folder"
   * connId is "user@host/share" — the first two segments after @
   */
  async readDirectory(locationId: string | null): Promise<ReadDirectoryResult> {
    if (!locationId) {
      // List connected servers (host level). Shares appear under each server once accessed.
      const entries: Entry[] = Array.from(this.connections.values()).map((conn) =>
        makeDirectoryEntry(`${conn.id}/`, conn.label || `\\\\${conn.host}`, {
          iconHint: 'drive',
          meta: { host: conn.host }
        })
      )
      return { entries, location: 'SMB Shares', parentId: null }
    }

    const parsed = this.parseLocation(locationId)
    const conn = this.connections.get(parsed.serverId)
    if (!conn) throw new Error(`Not connected: ${parsed.serverId}`)

    if (!parsed.share) {
      // Server root: list shares that have been opened in this session (excluding internal IPC$)
      const entries: Entry[] = []
      for (const [sh, _tree] of conn.trees) {
        if (sh === 'IPC$' || !sh) continue
        entries.push(makeDirectoryEntry(
          `${parsed.serverId}/${sh}/`,
          sh,
          {
            iconHint: 'drive',
            meta: { host: conn.host, share: sh }
          }
        ))
      }
      const location = `smb://${conn.host}`
      return { entries, location, parentId: null }
    }

    const dirPath = parsed.path || ''
    const tree = await this.getOrOpenTree(parsed.serverId, parsed.share)
    const listing = await tree.readDirectory(dirPath || undefined)

    const entries: Entry[] = []
    for (const item of listing) {
      // Strip leading ./ that node-smb2 prepends to filenames
      const name = item.filename.replace(/^\.\//, '').replace(/^\.\\/, '')

      // Skip . and .. entries
      if (name === '.' || name === '..' || name === '') continue

      const isDir = item.type === 'Directory'
      const itemPath = dirPath ? `${dirPath}/${name}` : name
      const id = `${parsed.serverId}/${parsed.share}/${itemPath}`.replace(/\/+/g, '/').replace(/\/$/, '')
      const readonly = item.fileAttributes.includes('READONLY')
      const hidden = item.fileAttributes.includes('HIDDEN')

      if (isDir) {
        entries.push(makeDirectoryEntry(id, name, { readonly, hidden }))
      } else {
        const size = typeof item.fileSize === 'bigint' ? Number(item.fileSize) : Number(item.fileSize || 0)
        entries.push(makeFileEntry(id, name, size, item.lastWriteTime.getTime(), {
          ext: getExtension(name),
          iconHint: 'file',
          readonly,
          hidden
        }))
      }
    }

    // Parent navigation
    let parentId: string | null = null
    if (dirPath) {
      const parentPath = dirPath.includes('/')
        ? dirPath.slice(0, dirPath.lastIndexOf('/'))
        : ''
      parentId = `${parsed.serverId}/${parsed.share}/${parentPath}`.replace(/\/+/g, '/').replace(/\/$/, '')
    } else {
      // parent of share is the server root
      parentId = parsed.serverId
    }

    const displayPath = parsed.share
      ? (dirPath ? `smb://${conn.host}/${parsed.share}/${dirPath}` : `smb://${conn.host}/${parsed.share}`)
      : `smb://${conn.host}`

    return {
      entries,
      location: displayPath,
      parentId
    }
  }

  async resolveLocation(input: string): Promise<string | null> {
    // Accept smb://host , smb://host/share/path or \\host , \\host\share\path
    // First try with share
    let smbMatch = input.match(/^smb:\/\/([^/]+)\/([^/]+)(\/.*)?$/)
    if (smbMatch) {
      const host = smbMatch[1]
      const share = smbMatch[2]
      const remotePath = (smbMatch[3] || '').slice(1).replace(/\//g, '\\')
      for (const [serverId, conn] of this.connections) {
        if (conn.host === host) {
          // If we have the session for this host, return location with the share (tree will be opened lazily)
          return `${serverId}/${share}${remotePath ? '/' + remotePath.replace(/\\/g, '/') : ''}`
        }
      }
    }
    // Host only
    smbMatch = input.match(/^smb:\/\/([^/]+)\/?$/)
    if (smbMatch) {
      const host = smbMatch[1]
      for (const [serverId, conn] of this.connections) {
        if (conn.host === host) {
          return `${serverId}/`
        }
      }
    }
    const uncMatch = input.match(/^\\\\([^\\]+)\\?([^\\]+)?(\\.*)?$/)
    if (uncMatch) {
      const host = uncMatch[1]
      const share = uncMatch[2] || ''
      const remotePath = (uncMatch[3] || '').slice(1)
      for (const [serverId, conn] of this.connections) {
        if (conn.host === host) {
          if (share) {
            return `${serverId}/${share}${remotePath ? '/' + remotePath.replace(/\\/g, '/') : ''}`
          } else {
            return `${serverId}/`
          }
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
            const p = this.parseLocation(entry.id)
            const tree = await this.getOrOpenTree(p.serverId, p.share || '')
            if (!p.share) throw new Error('Cannot delete at server root')
            const remotePath = p.path || ''
            if (entry.isContainer) {
              await tree.removeDirectory(remotePath)
            } else {
              await tree.removeFile(remotePath)
            }
          }
          return { success: true }
        }
        case 'rename': {
          const p = this.parseLocation(op.entry.id)
          const tree = await this.getOrOpenTree(p.serverId, p.share || '')
          if (!p.share) throw new Error('Cannot rename at server root')
          const remotePath = p.path || ''
          const dir = remotePath.includes('/')
            ? remotePath.slice(0, remotePath.lastIndexOf('/'))
            : ''
          const newPath = dir ? `${dir}/${op.newName}` : op.newName
          if (op.entry.isContainer) {
            await tree.renameDirectory(remotePath, newPath)
          } else {
            await tree.renameFile(remotePath, newPath)
          }
          return { success: true }
        }
        case 'createDirectory': {
          const p = this.parseLocation(op.parentLocationId)
          const tree = await this.getOrOpenTree(p.serverId, p.share || '')
          if (!p.share) throw new Error('Cannot create directory at server root')
          const parentPath = p.path || ''
          const newDirPath = parentPath ? `${parentPath}/${op.name}` : op.name
          await tree.createDirectory(newDirPath)
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

    const walkDir = async (serverId: string, share: string, remotePath: string, destBase: string, relBase: string): Promise<void> => {
      const tree = await this.getOrOpenTree(serverId, share)
      const listing = await tree.readDirectory(remotePath || undefined)
      for (const item of listing) {
        const name = stripPrefix(item.filename)
        if (name === '.' || name === '..' || name === '') continue
        const childRemote = remotePath ? `${remotePath}/${name}` : name
        const childDest = `${destBase}/${name}`
        const childRel = relBase ? `${relBase}/${name}` : name
        const childEntryId = `${serverId}/${share}/${childRemote}`.replace(/\/+/g, '/').replace(/\/$/, '')

        if (item.type === 'Directory') {
          result.push({ sourcePath: childEntryId, destPath: childDest, size: 0, isDirectory: true, relativePath: childRel })
          await walkDir(serverId, share, childRemote, childDest, childRel)
        } else {
          result.push({ sourcePath: childEntryId, destPath: childDest, size: itemSize(item), isDirectory: false, relativePath: childRel })
        }
      }
    }

    // Group entries by parent directory so we can list each parent once
    // to determine which are files and which are directories (with sizes)
    const byServer = new Map<string, { conn: SmbConnection; items: Array<{share: string, remotePath: string}> }>()
    for (const entryId of entryIds) {
      const p = this.parseLocation(entryId)
      const conn = this.connections.get(p.serverId)
      if (!conn || !p.share) continue
      if (!byServer.has(p.serverId)) byServer.set(p.serverId, { conn, items: [] })
      byServer.get(p.serverId)!.items.push({ share: p.share, remotePath: p.path })
    }

    for (const [serverId, { items }] of byServer) {
      // Group per share
      const byShare = new Map<string, string[]>()
      for (const it of items) {
        if (!byShare.has(it.share)) byShare.set(it.share, [])
        byShare.get(it.share)!.push(it.remotePath)
      }

      for (const [sh, paths] of byShare) {
        const tree = await this.getOrOpenTree(serverId, sh)
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
            parentListing = await tree.readDirectory(parentPath || undefined) as DirEntry[]
          } catch { /* empty */ }

          const parentMap = new Map<string, DirEntry>()
          for (const item of parentListing) {
            parentMap.set(stripPrefix(item.filename), item)
          }

          for (const remotePath of childPaths) {
            const name = remotePath.includes('/') ? remotePath.slice(remotePath.lastIndexOf('/') + 1) : remotePath
            const entryId = `${serverId}/${sh}/${remotePath}`.replace(/\/+/g,'/').replace(/\/$/,'')
            const info = parentMap.get(name)
            const isDir = info ? info.type === 'Directory' : false

            if (isDir) {
              const dirDest = `${destDir}/${name}`
              result.push({ sourcePath: entryId, destPath: dirDest, size: 0, isDirectory: true, relativePath: name })
              await walkDir(serverId, sh, remotePath, dirDest, name)
            } else {
              const size = info ? itemSize(info) : 0
              result.push({ sourcePath: entryId, destPath: `${destDir}/${name}`, size, isDirectory: false, relativePath: name })
            }
          }
        }
      }
    }

    return result
  }

  async readAt(entryId: string, offset: number, length: number): Promise<Buffer> {
    const p = this.parseLocation(entryId)
    if (!p.share || !p.path) throw new Error('Not connected')
    const tree = await this.getOrOpenTree(p.serverId, p.share)

    // Use the node-smb2 File class for positioned reads via SMB2 protocol
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const File = require('node-smb2/dist/client/File').default
    const file = new File(tree) as { _id: Buffer; open(p: string): Promise<void>; close(): Promise<void> }
    await file.open(p.path)

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

        const response = await tree.request(
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
    const p = this.parseLocation(entryId)
    if (!p.share || !p.path) throw new Error('Not connected')
    const tree = await this.getOrOpenTree(p.serverId, p.share)

    const parentPath = p.path.includes('/') ? p.path.slice(0, p.path.lastIndexOf('/')) : ''
    const name = p.path.includes('/') ? p.path.slice(p.path.lastIndexOf('/') + 1) : p.path
    const listing = await tree.readDirectory(parentPath || undefined)
    const match = listing.find((e) => e.filename.replace(/^\.\//, '').replace(/^\.\\/, '') === name)
    if (!match) throw new Error(`File not found: ${p.path}`)
    return typeof match.fileSize === 'bigint' ? Number(match.fileSize) : Number(match.fileSize || 0)
  }

  private queryInfoInjected = false

  private ensureQueryInfoSupport(): void {
    if (this.queryInfoInjected) return
    try {
      // node-smb2 does not ship a QueryInfo packet definition, so inject one
      // so that tree.request({ type: 16 }, ...) works.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const packetsMod: any = require('node-smb2/dist/protocol/smb2/packets')
      if (!packetsMod.QueryInfo) {
        const queryInfoDef = {
          requestStructure: {
            structureSize: { type: Number, size: 2, defaultValue: 41 },
            infoType: { type: Number, size: 1, defaultValue: 2 },
            fileInfoClass: { type: Number, size: 1, defaultValue: 7 },
            outputBufferLength: { type: Number, size: 4, defaultValue: 64 },
            inputBufferOffset: { type: Number, size: 2, defaultValue: 96 },
            reserved: { type: Number, size: 2, defaultValue: 0 },
            inputBufferLength: { type: Number, size: 4, defaultValue: 0 },
            additionalInformation: { type: Number, size: 4, defaultValue: 0 },
            flags: { type: Number, size: 4, defaultValue: 0 },
            fileId: { type: String, encoding: 'hex', size: 16 },
            buffer: { type: Buffer, sizeFieldName: 'inputBufferLength' }
          },
          responseStructure: {
            structureSize: { type: Number, size: 2 },
            outputBufferOffset: { type: Number, size: 2 },
            outputBufferLength: { type: Number, size: 4 },
            buffer: { type: Buffer, sizeFieldName: 'outputBufferLength' }
          }
        }
        packetsMod.QueryInfo = queryInfoDef
      }
    } catch {
      // ignore, will fail later if used
    }
    this.queryInfoInjected = true
  }

  async getDiskSpace(locationId: string): Promise<{ free: number; total: number } | null> {
    const p = this.parseLocation(locationId)
    const conn = this.connections.get(p.serverId)
    if (!conn) return null

    this.ensureQueryInfoSupport()

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Directory = require('node-smb2/dist/client/Directory').default
    const treeForOpen = p.share ? await this.getOrOpenTree(p.serverId, p.share).catch(() => null) : null
    const dir = new Directory(treeForOpen || (await this.getOrOpenTree(p.serverId, 'IPC$')) )
    let fileId: string | Buffer = '00000000000000000000000000000000'

    try {
      // Opening the root gives a valid FileId which improves compatibility for FS info queries
      await dir.open('').catch(() => dir.open('/').catch(() => {}))
      if (dir._id) {
        fileId = dir._id  // can be Buffer or hex string
      }

      // If it's a Buffer, convert for the hex-expecting structure
      const fileIdForRequest = Buffer.isBuffer(fileId) ? fileId.toString('hex') : fileId

      const targetTree = treeForOpen || (await this.getOrOpenTree(p.serverId, 'IPC$'))
      const response: any = await targetTree.request(
        { type: 16 }, // QueryInfo
        {
          infoType: 2,
          fileInfoClass: 7,
          outputBufferLength: 64,
          inputBufferOffset: 96,
          reserved: 0,
          inputBufferLength: 0,
          additionalInformation: 0,
          flags: 0,
          fileId: fileIdForRequest
        }
      )

      const body = response?.body || response
      const buf: Buffer | undefined = body?.buffer

      if (!buf || buf.length < 32) {
        return null
      }

      const totalUnits = Number(buf.readBigUInt64LE(0))
      const callerAvailUnits = Number(buf.readBigUInt64LE(8))
      const sectorsPerAllocationUnit = buf.readUInt32LE(24)
      const bytesPerSector = buf.readUInt32LE(28)

      if (!sectorsPerAllocationUnit || !bytesPerSector) return null

      const total = totalUnits * sectorsPerAllocationUnit * bytesPerSector
      const free = callerAvailUnits * sectorsPerAllocationUnit * bytesPerSector

      return {
        free: Math.max(0, Math.floor(free)),
        total: Math.max(0, Math.floor(total))
      }
    } catch {
      return null
    } finally {
      if (dir && (dir as any).isOpen) {
        await dir.close().catch(() => {})
      }
    }
  }

  async createReadStream(entryId: string): Promise<NodeJS.ReadableStream | null> {
    const p = this.parseLocation(entryId)
    if (!p.share || !p.path) return null
    try {
      const tree = await this.getOrOpenTree(p.serverId, p.share)
      return await tree.createFileReadStream(p.path) as unknown as NodeJS.ReadableStream
    } catch {
      return null
    }
  }

  async writeFromStream(
    destLocationId: string,
    fileName: string,
    stream: NodeJS.ReadableStream
  ): Promise<{ success: boolean; bytesWritten: number; error?: string }> {
    const p = this.parseLocation(destLocationId)
    if (!p.share) return { success: false, bytesWritten: 0, error: 'Not connected' }
    const tree = await this.getOrOpenTree(p.serverId, p.share).catch(() => null)
    if (!tree) return { success: false, bytesWritten: 0, error: 'Not connected' }
    try {
      const remotePath = p.path ? `${p.path}/${fileName}` : fileName
      const writeStream = await tree.createFileWriteStream(remotePath)
      return new Promise((resolve) => {
        let bytesWritten = 0
        let settled = false
        const done = (result: { success: boolean; bytesWritten: number; error?: string }): void => {
          if (settled) return
          settled = true
          resolve(result)
        }
        const readable = stream as Readable
        const writable = writeStream as unknown as NodeJS.WritableStream & { destroy?: () => void }
        readable.on('data', (chunk: Buffer) => { bytesWritten += chunk.length })
        readable.on('error', (err: Error) => {
          writable.destroy?.()
          done({ success: false, bytesWritten, error: String(err) })
        })
        readable.pipe(writable)
        writable.on('finish', () => done({ success: true, bytesWritten }))
        writable.on('error', (err: Error) => done({ success: false, bytesWritten, error: String(err) }))
      })
    } catch (err) {
      return { success: false, bytesWritten: 0, error: smbError(err).message }
    }
  }

  async connect(
    host: string,
    share: string | undefined,
    username: string,
    password: string,
    domain?: string,
    label?: string
  ): Promise<string> {
    const serverId = `${username}@${host}`

    let conn = this.connections.get(serverId)
    let client: InstanceType<typeof SMB2.Client> | null = null

    try {
      if (!conn) {
        client = new SMB2.Client(host)
        await client.connect()

        const session = await client.authenticate({
          domain: domain || '',
          username,
          password,
          forceNtlmVersion: 'v2'
        })

        conn = {
          id: serverId,
          client,
          session,
          host,
          username,
          domain: domain || '',
          label: label || `\\\\${host}`,
          trees: new Map()
        }
        this.connections.set(serverId, conn)
      }

      if (share) {
        await this.getOrOpenTree(serverId, share)
      } else {
        // Ensure we have at least IPC$ open to keep an authenticated session
        await this.getOrOpenTree(serverId, 'IPC$')
      }

      return serverId
    } catch (err) {
      // Clean up on failure only if we just created the client
      if (client && !this.connections.get(serverId)) {
        try { await client.close() } catch { /* ignore */ }
      }
      throw smbError(err)
    }
  }

  private async getOrOpenTree(serverId: string, share: string) {
    const conn = this.connections.get(serverId)
    if (!conn) throw new Error(`Not connected: ${serverId}`)

    if (!conn.trees.has(share)) {
      const tree = await conn.session.connectTree(share)
      // quick verify for real shares
      if (share !== 'IPC$') {
        try { await tree.readDirectory() } catch { /* may be access denied on root, still ok */ }
      }
      conn.trees.set(share, tree)
    }
    return conn.trees.get(share)!
  }

  async disconnect(serverId: string): Promise<void> {
    const conn = this.connections.get(serverId)
    if (conn) {
      try {
        for (const tree of conn.trees.values()) {
          await tree.disconnect().catch(() => {})
        }
        await conn.session.logoff()
        await conn.client.close()
      } catch { /* ignore */ }
      this.connections.delete(serverId)
    }
  }

  getConnections(): string[] {
    return Array.from(this.connections.keys())
  }

  /**
   * Parse locationId.
   * Supports:
   *   "user@host"                 -> server root
   *   "user@host/share"           -> share root
   *   "user@host/share/path/..."  -> path inside share
   * Returns serverId always as "user@host", optional share, and the sub path.
   */
  private parseLocation(locationId: string): { serverId: string; share?: string; path: string } {
    const atIdx = locationId.indexOf('@')
    if (atIdx < 0) {
      return { serverId: locationId, path: '' }
    }
    const firstSlash = locationId.indexOf('/', atIdx)
    if (firstSlash < 0) {
      // just serverId
      return { serverId: locationId, path: '' }
    }
    const secondSlash = locationId.indexOf('/', firstSlash + 1)
    if (secondSlash < 0) {
      // server/share
      const serverId = locationId.slice(0, firstSlash)
      const share = locationId.slice(firstSlash + 1)
      return { serverId, share, path: '' }
    }
    // server/share/...
    const serverId = locationId.slice(0, firstSlash)
    const rest = locationId.slice(firstSlash + 1)
    const slashInRest = rest.indexOf('/')
    const share = rest.slice(0, slashInRest)
    const path = rest.slice(slashInRest + 1)
    return { serverId, share, path }
  }
}
