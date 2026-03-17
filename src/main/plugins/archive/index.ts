import * as path from 'path'
import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import * as yauzl from 'yauzl'
import type {
  BrowsePlugin,
  PluginManifest,
  ReadDirectoryResult,
  Entry,
  PluginOperation,
  OperationRequest,
  OperationResult
} from '@shared/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ZipEntry {
  fileName: string
  uncompressedSize: number
  lastModDate: Date
  isDirectory: boolean
}

/**
 * A ZIP entry that can be written into a new archive.
 * Either carries buffered data from an existing archive, or a path to a new file on disk.
 */
interface ZipRebuildEntry extends ZipEntry {
  data: Buffer | null  // buffered content (null for directories or when newFilePath is set)
  newFilePath?: string // path to a temp file for new entries being added
}

type ZipTransformer = (entries: ZipRebuildEntry[]) => ZipRebuildEntry[]

// ─── Internal helpers ──────────────────────────────────────────────────────────

/** Returns basename of an archive-internal path (forward-slash only, may end with /). */
function archiveBasename(internalPath: string): string {
  const noTrailing = internalPath.replace(/\/$/, '')
  const lastSlash = noTrailing.lastIndexOf('/')
  return lastSlash >= 0 ? noTrailing.slice(lastSlash + 1) : noTrailing
}

/** Returns parent directory of an archive-internal path, with trailing slash. */
function archiveDirname(internalPath: string): string {
  const noTrailing = internalPath.replace(/\/$/, '')
  const lastSlash = noTrailing.lastIndexOf('/')
  return lastSlash >= 0 ? noTrailing.slice(0, lastSlash + 1) : ''
}

/**
 * Join an archive or local destDir with a relative path.
 * Uses forward slashes for archive paths, path.join for local paths.
 */
function joinDestPath(destDir: string, relativePath: string): string {
  if (destDir.includes('::')) {
    const base = destDir.endsWith('/') || destDir.endsWith('::') ? destDir : destDir + '/'
    return base + relativePath
  }
  return path.join(destDir, relativePath)
}

/** Read all ZIP entries without buffering their content (metadata only). */
async function readZipEntries(archivePath: string): Promise<ZipEntry[]> {
  return new Promise((resolve, reject) => {
    yauzl.open(archivePath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) return reject(err || new Error('Failed to open zip'))
      const entries: ZipEntry[] = []
      zipfile.readEntry()
      zipfile.on('entry', (entry) => {
        entries.push({
          fileName: entry.fileName,
          uncompressedSize: entry.uncompressedSize,
          lastModDate: entry.getLastModDate(),
          isDirectory: entry.fileName.endsWith('/')
        })
        zipfile.readEntry()
      })
      zipfile.on('end', () => resolve(entries))
      zipfile.on('error', reject)
    })
  })
}

/**
 * Read all ZIP entries AND buffer their content in memory.
 * This enables the rebuild pattern: read all → transform → write new ZIP.
 * Sequential streaming (one entry at a time) is enforced by yauzl's lazyEntries mode.
 */
async function readZipEntriesWithData(archivePath: string): Promise<ZipRebuildEntry[]> {
  return new Promise((resolve, reject) => {
    yauzl.open(archivePath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) return reject(err || new Error('Failed to open zip'))
      const result: ZipRebuildEntry[] = []

      const readNext = (): void => { zipfile.readEntry() }

      zipfile.readEntry()
      zipfile.on('entry', (entry) => {
        const meta: ZipEntry = {
          fileName: entry.fileName,
          uncompressedSize: entry.uncompressedSize,
          lastModDate: entry.getLastModDate(),
          isDirectory: entry.fileName.endsWith('/')
        }

        if (meta.isDirectory) {
          result.push({ ...meta, data: null })
          readNext()
          return
        }

        zipfile.openReadStream(entry, (streamErr, readStream) => {
          if (streamErr || !readStream) {
            result.push({ ...meta, data: Buffer.alloc(0) })
            readNext()
            return
          }
          const chunks: Buffer[] = []
          readStream.on('data', (c: Buffer) => chunks.push(c))
          readStream.on('end', () => {
            result.push({ ...meta, data: Buffer.concat(chunks) })
            readNext()
          })
          readStream.on('error', () => {
            result.push({ ...meta, data: Buffer.alloc(0) })
            readNext()
          })
        })
      })

      zipfile.on('end', () => resolve(result))
      zipfile.on('error', reject)
    })
  })
}

/**
 * Rebuild a ZIP archive by:
 * 1. Reading all existing entries (with buffered data)
 * 2. Applying a pure transformation function
 * 3. Writing the result to a temp file
 * 4. Atomically replacing the original
 *
 * Every write operation (add, delete, rename, move) uses this pattern
 * because the ZIP format does not support in-place modification.
 */
async function rebuildZip(archivePath: string, transformer: ZipTransformer): Promise<void> {
  const tempPath = archivePath + '.tmp'

  // Clean up any stale temp file from a previous failed rebuild
  await fs.unlink(tempPath).catch(() => {})

  const existing = await readZipEntriesWithData(archivePath)
  const transformed = transformer(existing)

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const yazl = require('yazl') as typeof import('yazl')
  const outZip = new yazl.ZipFile()
  const writeStream = fsSync.createWriteStream(tempPath)
  outZip.outputStream.pipe(writeStream)

  for (const entry of transformed) {
    const opts = { mtime: entry.lastModDate }
    if (entry.isDirectory) {
      outZip.addEmptyDirectory(entry.fileName.replace(/\/$/, ''), opts)
    } else if (entry.newFilePath) {
      outZip.addFile(entry.newFilePath, entry.fileName, opts)
    } else if (entry.data !== null) {
      outZip.addBuffer(entry.data, entry.fileName, opts)
    }
  }
  outZip.end()

  await new Promise<void>((resolve, reject) => {
    writeStream.on('finish', resolve)
    writeStream.on('error', reject)
    outZip.outputStream.on('error', reject)
  }).catch(async (e) => {
    await fs.unlink(tempPath).catch(() => {})
    throw e
  })

  await fs.rename(tempPath, archivePath)
}

// ─── extractFromZip (used by executeOperation copy) ───────────────────────────

/**
 * Extract a single file or directory prefix from a ZIP archive to a destination path.
 */
export async function extractFromZip(
  archivePath: string,
  internalPath: string,
  destDir: string
): Promise<{ success: boolean; error?: string; extractedCount: number }> {
  return new Promise((resolve) => {
    yauzl.open(archivePath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) {
        resolve({ success: false, error: String(err), extractedCount: 0 })
        return
      }

      let extractedCount = 0
      const prefix = internalPath || ''
      const isExactFile = prefix !== '' && !prefix.endsWith('/')

      zipfile.readEntry()
      zipfile.on('entry', async (entry) => {
        const fileName = entry.fileName
        let destPath: string

        if (isExactFile) {
          if (fileName !== prefix) { zipfile.readEntry(); return }
          destPath = path.join(destDir, path.basename(fileName))
        } else {
          if (prefix && !fileName.startsWith(prefix)) { zipfile.readEntry(); return }
          const relative = prefix ? fileName.slice(prefix.length) : fileName
          if (!relative) { zipfile.readEntry(); return }
          destPath = path.join(destDir, relative)
        }

        if (fileName.endsWith('/')) {
          try { await fs.mkdir(destPath, { recursive: true }) } catch { /* ignore */ }
          zipfile.readEntry()
        } else {
          try {
            await fs.mkdir(path.dirname(destPath), { recursive: true })
            zipfile.openReadStream(entry, (streamErr, readStream) => {
              if (streamErr || !readStream) { zipfile.readEntry(); return }
              const writeStream = fsSync.createWriteStream(destPath)
              readStream.pipe(writeStream)
              writeStream.on('finish', () => { extractedCount++; zipfile.readEntry() })
              writeStream.on('error', () => { zipfile.readEntry() })
            })
          } catch { zipfile.readEntry() }
        }
      })

      zipfile.on('end', () => resolve({ success: true, extractedCount }))
      zipfile.on('error', (e) => resolve({ success: false, error: String(e), extractedCount }))
    })
  })
}

// ─── ArchivePlugin ─────────────────────────────────────────────────────────────

export class ArchivePlugin implements BrowsePlugin {
  readonly manifest: PluginManifest = {
    id: 'archive',
    displayName: 'Archive Browser',
    version: '1.0.0',
    iconHint: 'archive',
    schemes: ['archive']
  }

  async initialize(): Promise<boolean> { return true }
  async dispose(): Promise<void> {}

  /**
   * locationId format: "archivePath::internalPath"
   * e.g. "D:\files\test.zip::" for root, "D:\files\test.zip::src/main/" for subfolder
   */
  async readDirectory(locationId: string | null): Promise<ReadDirectoryResult> {
    if (!locationId) return { entries: [], location: 'Archives', parentId: null }

    const [archivePath, internalPath] = this.parseLocation(locationId)
    const ext = path.extname(archivePath).toLowerCase()

    if (ext === '.zip' || ext === '.jar') {
      return this.readZipDirectory(archivePath, internalPath)
    }

    return { entries: [], location: archivePath, parentId: null, extraColumns: [] }
  }

  private async readZipDirectory(
    archivePath: string,
    internalPath: string
  ): Promise<ReadDirectoryResult> {
    const allEntries = await readZipEntries(archivePath)
    const prefix = internalPath || ''
    const seenDirs = new Set<string>()
    const entries: Entry[] = []

    for (const ze of allEntries) {
      if (!ze.fileName.startsWith(prefix)) continue
      const relative = ze.fileName.slice(prefix.length)
      if (!relative || relative === '/') continue

      const parts = relative.split('/').filter(Boolean)
      if (parts.length === 0) continue

      if (parts.length === 1 && !ze.isDirectory) {
        const ext = path.extname(parts[0]).slice(1).toLowerCase()
        entries.push({
          id: `${archivePath}::${prefix}${parts[0]}`,
          name: parts[0],
          isContainer: false,
          size: ze.uncompressedSize,
          modifiedAt: ze.lastModDate.getTime(),
          mimeType: '',
          iconHint: 'file',
          meta: { extension: ext, archivePath },
          attributes: { readonly: false, hidden: false, symlink: false }
        })
      } else {
        const dirName = parts[0]
        if (!seenDirs.has(dirName)) {
          seenDirs.add(dirName)
          entries.push({
            id: `${archivePath}::${prefix}${dirName}/`,
            name: dirName,
            isContainer: true,
            size: -1,
            modifiedAt: ze.lastModDate.getTime(),
            mimeType: 'inode/directory',
            iconHint: 'folder',
            meta: { archivePath },
            attributes: { readonly: false, hidden: false, symlink: false }
          })
        }
      }
    }

    const archiveName = path.basename(archivePath)
    const displayPath = internalPath ? `[${archiveName}]/${internalPath}` : `[${archiveName}]`
    const parentId = internalPath
      ? `${archivePath}::${internalPath.replace(/[^/]+\/$/, '')}`
      : null

    return { entries, location: displayPath, parentId }
  }

  async resolveLocation(input: string): Promise<string | null> {
    const ext = path.extname(input).toLowerCase()
    if (ext === '.zip' || ext === '.jar') {
      try {
        await fs.access(input)
        return `${input}::`
      } catch {
        return null
      }
    }
    return null
  }

  getSupportedOperations(): PluginOperation[] {
    return ['copy', 'delete', 'rename', 'move']
  }

  async executeOperation(op: OperationRequest): Promise<OperationResult> {
    const errors: Array<{ entryId: string; message: string }> = []

    // ── copy (extract) ──────────────────────────────────────────────────────
    if (op.op === 'copy') {
      for (const entry of op.sourceEntries) {
        const [archivePath, internalPath] = this.parseLocation(entry.id)
        try {
          const result = await extractFromZip(archivePath, internalPath, op.destinationLocationId)
          if (!result.success) errors.push({ entryId: entry.id, message: result.error || 'Extraction failed' })
        } catch (err) {
          errors.push({ entryId: entry.id, message: String(err) })
        }
      }
      return { success: errors.length === 0, errors: errors.length > 0 ? errors : undefined }
    }

    // ── delete ──────────────────────────────────────────────────────────────
    if (op.op === 'delete') {
      // Group entries by archive file
      const byArchive = new Map<string, string[]>()
      for (const entry of op.entries) {
        const [archivePath, internalPath] = this.parseLocation(entry.id)
        if (!byArchive.has(archivePath)) byArchive.set(archivePath, [])
        byArchive.get(archivePath)!.push(internalPath)
      }

      for (const [archivePath, internalPaths] of byArchive) {
        try {
          await rebuildZip(archivePath, (entries) =>
            entries.filter((e) => {
              return !internalPaths.some((ip) => {
                // Match exact file OR directory prefix (avoid matching src2/ when deleting src/)
                const dirPrefix = ip.endsWith('/') ? ip : ip + '/'
                return e.fileName === ip || e.fileName.startsWith(dirPrefix)
              })
            })
          )
        } catch (err) {
          errors.push({ entryId: archivePath, message: String(err) })
        }
      }
      return { success: errors.length === 0, errors: errors.length > 0 ? errors : undefined }
    }

    // ── rename ──────────────────────────────────────────────────────────────
    if (op.op === 'rename') {
      const [archivePath, internalPath] = this.parseLocation(op.entry.id)
      const isDir = internalPath.endsWith('/')
      const parentDir = archiveDirname(internalPath)
      const newInternalPath = parentDir + op.newName + (isDir ? '/' : '')

      try {
        await rebuildZip(archivePath, (entries) =>
          entries.map((e) => {
            if (isDir) {
              if (e.fileName === internalPath) return { ...e, fileName: newInternalPath }
              if (e.fileName.startsWith(internalPath)) {
                return { ...e, fileName: newInternalPath + e.fileName.slice(internalPath.length) }
              }
            } else {
              if (e.fileName === internalPath) return { ...e, fileName: newInternalPath }
            }
            return e
          })
        )
      } catch (err) {
        errors.push({ entryId: op.entry.id, message: String(err) })
      }
      return { success: errors.length === 0, errors: errors.length > 0 ? errors : undefined }
    }

    // ── move (within same archive) ──────────────────────────────────────────
    if (op.op === 'move') {
      if (op.destinationPluginId !== 'archive') {
        return { success: false, errors: [{ entryId: '', message: 'Cross-plugin move should use copy+delete' }] }
      }

      const [destArchivePath, destInternalDir] = this.parseLocation(op.destinationLocationId)
      const destPrefix = destInternalDir.endsWith('/') || destInternalDir === ''
        ? destInternalDir
        : destInternalDir + '/'

      try {
        await rebuildZip(destArchivePath, (entries) =>
          entries.map((e) => {
            for (const srcEntry of op.sourceEntries) {
              const [, srcPath] = this.parseLocation(srcEntry.id)
              const srcIsDir = srcPath.endsWith('/')
              const srcBase = archiveBasename(srcPath)

              if (srcIsDir) {
                if (e.fileName === srcPath) {
                  return { ...e, fileName: destPrefix + srcBase + '/' }
                }
                if (e.fileName.startsWith(srcPath)) {
                  return { ...e, fileName: destPrefix + srcBase + '/' + e.fileName.slice(srcPath.length) }
                }
              } else {
                if (e.fileName === srcPath) {
                  return { ...e, fileName: destPrefix + srcBase }
                }
              }
            }
            return e
          })
        )
      } catch (err) {
        errors.push({ entryId: '', message: String(err) })
      }
      return { success: errors.length === 0, errors: errors.length > 0 ? errors : undefined }
    }

    return {
      success: false,
      errors: [{ entryId: '', message: `Operation "${op.op}" not supported on archives` }]
    }
  }

  // ── writeFromStream ─────────────────────────────────────────────────────────

  /**
   * Copy a file into a ZIP archive (add or overwrite an entry).
   * If the archive doesn't exist, creates a new one.
   * Each call rebuilds the entire ZIP — this is correct but has O(archive size) cost.
   */
  async writeFromStream(
    destLocationId: string,
    destFileName: string,
    stream: NodeJS.ReadableStream
  ): Promise<{ success: boolean; bytesWritten: number; error?: string }> {
    const [archivePath, internalDir] = this.parseLocation(destLocationId)
    const internalPath = internalDir
      ? (internalDir.endsWith('/') ? internalDir : internalDir + '/') + destFileName
      : destFileName

    // Buffer incoming stream to a temp file first (gives us the file size and avoids memory pressure)
    const incomingTmp = `${archivePath}.${Date.now()}.in.tmp`
    let bytesWritten = 0

    try {
      await new Promise<void>((resolve, reject) => {
        const ws = fsSync.createWriteStream(incomingTmp)
        stream.on('data', (chunk: Buffer) => { bytesWritten += chunk.length })
        stream.pipe(ws)
        ws.on('finish', resolve)
        ws.on('error', reject)
        stream.on('error', reject)
      })

      const archiveExists = await fs.access(archivePath).then(() => true).catch(() => false)

      if (!archiveExists) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const yazl = require('yazl') as typeof import('yazl')
        const outZip = new yazl.ZipFile()
        const outStream = fsSync.createWriteStream(archivePath)
        outZip.outputStream.pipe(outStream)
        outZip.addFile(incomingTmp, internalPath, { mtime: new Date() })
        outZip.end()
        await new Promise<void>((resolve, reject) => {
          outStream.on('finish', resolve)
          outStream.on('error', reject)
        })
      } else {
        await rebuildZip(archivePath, (entries) => {
          const filtered = entries.filter((e) => e.fileName !== internalPath)
          filtered.push({
            fileName: internalPath,
            uncompressedSize: bytesWritten,
            lastModDate: new Date(),
            isDirectory: false,
            data: null,
            newFilePath: incomingTmp
          })
          return filtered
        })
      }
    } catch (err) {
      await fs.unlink(incomingTmp).catch(() => {})
      return { success: false, bytesWritten: 0, error: String(err) }
    }

    await fs.unlink(incomingTmp).catch(() => {})
    return { success: true, bytesWritten }
  }

  // ── enumerateFiles ──────────────────────────────────────────────────────────

  /**
   * Enumerate all files under the given entry IDs for progress tracking.
   * Groups by archive path to open each ZIP only once.
   */
  async enumerateFiles(
    entryIds: string[],
    destDir: string
  ): Promise<Array<{ sourcePath: string; destPath: string; size: number; isDirectory: boolean; relativePath: string }>> {
    const result: Array<{ sourcePath: string; destPath: string; size: number; isDirectory: boolean; relativePath: string }> = []

    // Group by archive so we only open each ZIP once
    const byArchive = new Map<string, string[]>()
    for (const id of entryIds) {
      const [archivePath, internalPath] = this.parseLocation(id)
      if (!byArchive.has(archivePath)) byArchive.set(archivePath, [])
      byArchive.get(archivePath)!.push(internalPath)
    }

    for (const [archivePath, internalPaths] of byArchive) {
      let allEntries: ZipEntry[]
      try {
        allEntries = await readZipEntries(archivePath)
      } catch {
        continue
      }

      for (const internalPath of internalPaths) {
        if (!internalPath) {
          // Entire archive
          for (const ze of allEntries) {
            const rel = ze.isDirectory ? ze.fileName.replace(/\/$/, '') : ze.fileName
            if (!rel) continue
            result.push({
              sourcePath: `${archivePath}::${ze.fileName}`,
              destPath: destDir ? joinDestPath(destDir, rel) : rel,
              size: ze.isDirectory ? 0 : ze.uncompressedSize,
              isDirectory: ze.isDirectory,
              relativePath: rel
            })
          }
        } else if (internalPath.endsWith('/')) {
          // Directory — include all descendants
          const topName = archiveBasename(internalPath)
          for (const ze of allEntries) {
            if (!ze.fileName.startsWith(internalPath) || ze.fileName === internalPath) continue
            const suffix = ze.fileName.slice(internalPath.length)
            const rel = ze.isDirectory
              ? topName + '/' + suffix.replace(/\/$/, '')
              : topName + '/' + suffix
            result.push({
              sourcePath: `${archivePath}::${ze.fileName}`,
              destPath: destDir ? joinDestPath(destDir, rel) : rel,
              size: ze.isDirectory ? 0 : ze.uncompressedSize,
              isDirectory: ze.isDirectory,
              relativePath: rel
            })
          }
        } else {
          // Single file
          const ze = allEntries.find((e) => e.fileName === internalPath)
          if (ze) {
            const rel = archiveBasename(internalPath)
            result.push({
              sourcePath: `${archivePath}::${internalPath}`,
              destPath: destDir ? joinDestPath(destDir, rel) : rel,
              size: ze.uncompressedSize,
              isDirectory: false,
              relativePath: rel
            })
          }
        }
      }
    }

    return result
  }

  // ── createReadStream ────────────────────────────────────────────────────────

  async createReadStream(entryId: string): Promise<NodeJS.ReadableStream | null> {
    const [archivePath, internalPath] = this.parseLocation(entryId)
    if (!internalPath || internalPath.endsWith('/')) return null

    return new Promise((resolve) => {
      // autoClose: false so we can close explicitly after the entry stream is consumed
      yauzl.open(archivePath, { lazyEntries: true, autoClose: false }, (err, zipfile) => {
        if (err || !zipfile) { resolve(null); return }
        const closeZip = (): void => { try { zipfile.close() } catch { /* ignore */ } }
        zipfile.readEntry()
        zipfile.on('entry', (entry) => {
          if (entry.fileName === internalPath) {
            zipfile.openReadStream(entry, (streamErr, readStream) => {
              if (streamErr || !readStream) { closeZip(); resolve(null); return }
              // Release the file handle once the consumer finishes reading
              readStream.on('end', closeZip)
              readStream.on('error', closeZip)
              resolve(readStream)
            })
          } else {
            zipfile.readEntry()
          }
        })
        zipfile.on('end', () => { closeZip(); resolve(null) })
        zipfile.on('error', () => { closeZip(); resolve(null) })
      })
    })
  }

  // ── helpers ─────────────────────────────────────────────────────────────────

  private parseLocation(locationId: string): [string, string] {
    const sepIdx = locationId.indexOf('::')
    if (sepIdx < 0) return [locationId, '']
    return [locationId.slice(0, sepIdx), locationId.slice(sepIdx + 2)]
  }

  static isArchive(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase()
    return ['.zip', '.jar'].includes(ext)
  }
}
