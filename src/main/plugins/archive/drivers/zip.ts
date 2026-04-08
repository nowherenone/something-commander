import * as path from 'path'
import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import * as yauzl from 'yauzl'
import type { ArchiveDriver, ArchiveEntry } from '../driver'
import type { SourceAccess } from '../plugin-reader'
import { PluginRandomAccessReader } from '../plugin-reader'
import { archiveBasename } from '../utils'

// ─── Internal ZIP types ────────────────────────────────────────────────────────

interface ZipEntry {
  fileName: string
  uncompressedSize: number
  lastModDate: Date
  isDirectory: boolean
}

interface ZipRebuildEntry extends ZipEntry {
  data: Buffer | null
  newFilePath?: string
}

type ZipTransformer = (entries: ZipRebuildEntry[]) => ZipRebuildEntry[]

// ─── Low-level ZIP helpers ─────────────────────────────────────────────────────

/** Read all ZIP entries via a SourceAccess (random access through any plugin). */
function readZipEntries(source: SourceAccess): Promise<ZipEntry[]> {
  return new Promise((resolve, reject) => {
    const reader = new PluginRandomAccessReader(source.readAt.bind(source))
    yauzl.fromRandomAccessReader(reader, source.totalSize, { lazyEntries: true }, (err, zipfile) => {
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

/** Read all ZIP entries AND buffer their content from a local file. Used for the rebuild pattern. */
function readZipEntriesWithData(archivePath: string): Promise<ZipRebuildEntry[]> {
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
 * Rebuild a ZIP by reading all entries (with data), applying a transform,
 * then atomically writing a new file. Every mutating operation uses this pattern
 * because the ZIP format does not support in-place modification.
 */
async function rebuildZip(archivePath: string, transformer: ZipTransformer): Promise<void> {
  const tempPath = archivePath + '.tmp'
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

// ─── ZipDriver ─────────────────────────────────────────────────────────────────

export class ZipDriver implements ArchiveDriver {
  readonly extensions = ['.zip', '.jar'] as const
  readonly supportsWrite = true

  async readEntries(source: SourceAccess): Promise<ArchiveEntry[]> {
    const zipEntries = await readZipEntries(source)
    return zipEntries.map((ze) => ({
      path: ze.fileName,
      size: ze.uncompressedSize,
      modifiedAt: ze.lastModDate,
      isDirectory: ze.isDirectory
    }))
  }

  async createReadStream(source: SourceAccess, entryPath: string): Promise<NodeJS.ReadableStream | null> {
    return new Promise((resolve) => {
      const reader = new PluginRandomAccessReader(source.readAt.bind(source))
      yauzl.fromRandomAccessReader(reader, source.totalSize, { lazyEntries: true, autoClose: false }, (err, zipfile) => {
        if (err || !zipfile) { resolve(null); return }
        const closeZip = (): void => { try { zipfile.close() } catch { /* ignore */ } }
        zipfile.readEntry()
        zipfile.on('entry', (entry) => {
          if (entry.fileName === entryPath) {
            zipfile.openReadStream(entry, (streamErr, readStream) => {
              if (streamErr || !readStream) { closeZip(); resolve(null); return }
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

  async extract(
    source: SourceAccess,
    entryPath: string,
    destDir: string
  ): Promise<{ success: boolean; error?: string; count: number }> {
    return new Promise((resolve) => {
      const reader = new PluginRandomAccessReader(source.readAt.bind(source))
      yauzl.fromRandomAccessReader(reader, source.totalSize, { lazyEntries: true }, (err, zipfile) => {
        if (err || !zipfile) {
          resolve({ success: false, error: String(err), count: 0 })
          return
        }

        let count = 0
        const prefix = entryPath || ''
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
                const ws = fsSync.createWriteStream(destPath)
                readStream.pipe(ws)
                ws.on('finish', () => { count++; zipfile.readEntry() })
                ws.on('error', () => { zipfile.readEntry() })
              })
            } catch { zipfile.readEntry() }
          }
        })

        zipfile.on('end', () => resolve({ success: true, count }))
        zipfile.on('error', (e) => resolve({ success: false, error: String(e), count }))
      })
    })
  }

  async deleteEntries(archivePath: string, paths: string[]): Promise<void> {
    await rebuildZip(archivePath, (entries) =>
      entries.filter((e) =>
        !paths.some((ip) => {
          const dirPrefix = ip.endsWith('/') ? ip : ip + '/'
          return e.fileName === ip || e.fileName.startsWith(dirPrefix)
        })
      )
    )
  }

  async renameEntry(archivePath: string, oldPath: string, newPath: string): Promise<void> {
    await rebuildZip(archivePath, (entries) =>
      entries.map((e) => {
        const isDir = oldPath.endsWith('/')
        if (isDir) {
          if (e.fileName === oldPath) return { ...e, fileName: newPath }
          if (e.fileName.startsWith(oldPath)) {
            return { ...e, fileName: newPath + e.fileName.slice(oldPath.length) }
          }
        } else {
          if (e.fileName === oldPath) return { ...e, fileName: newPath }
        }
        return e
      })
    )
  }

  async moveEntries(archivePath: string, srcPaths: string[], destInternalDir: string): Promise<void> {
    const destPrefix = destInternalDir.endsWith('/') || destInternalDir === ''
      ? destInternalDir
      : destInternalDir + '/'

    await rebuildZip(archivePath, (entries) =>
      entries.map((e) => {
        for (const srcPath of srcPaths) {
          const srcIsDir = srcPath.endsWith('/')
          const srcBase = archiveBasename(srcPath)
          if (srcIsDir) {
            if (e.fileName === srcPath) return { ...e, fileName: destPrefix + srcBase + '/' }
            if (e.fileName.startsWith(srcPath)) {
              return { ...e, fileName: destPrefix + srcBase + '/' + e.fileName.slice(srcPath.length) }
            }
          } else {
            if (e.fileName === srcPath) return { ...e, fileName: destPrefix + srcBase }
          }
        }
        return e
      })
    )
  }

  async addFromStream(
    archivePath: string,
    entryPath: string,
    stream: NodeJS.ReadableStream
  ): Promise<{ success: boolean; bytesWritten: number; error?: string }> {
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
        outZip.addFile(incomingTmp, entryPath, { mtime: new Date() })
        outZip.end()
        await new Promise<void>((resolve, reject) => {
          outStream.on('finish', resolve)
          outStream.on('error', reject)
        })
      } else {
        await rebuildZip(archivePath, (entries) => {
          const filtered = entries.filter((e) => e.fileName !== entryPath)
          filtered.push({
            fileName: entryPath,
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
}
