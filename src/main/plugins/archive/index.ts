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

interface ZipEntry {
  fileName: string
  uncompressedSize: number
  lastModDate: Date
  isDirectory: boolean
}

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
 * Extract a single file from a ZIP archive to a destination path.
 * If internalPath is a directory prefix, extracts all files under it.
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

      // Determine if we're extracting a single file (exact match) or a directory (prefix match)
      const isExactFile = prefix !== '' && !prefix.endsWith('/')

      zipfile.readEntry()
      zipfile.on('entry', async (entry) => {
        const fileName = entry.fileName

        let destPath: string

        if (isExactFile) {
          // Single file extraction: match exactly
          if (fileName !== prefix) {
            zipfile.readEntry()
            return
          }
          destPath = path.join(destDir, path.basename(fileName))
        } else {
          // Directory extraction: match by prefix
          if (prefix && !fileName.startsWith(prefix)) {
            zipfile.readEntry()
            return
          }
          const relative = prefix ? fileName.slice(prefix.length) : fileName
          if (!relative) {
            zipfile.readEntry()
            return
          }
          destPath = path.join(destDir, relative)
        }

        if (fileName.endsWith('/')) {
          // Directory
          try {
            await fs.mkdir(destPath, { recursive: true })
          } catch { /* ignore */ }
          zipfile.readEntry()
        } else {
          // File — extract
          try {
            await fs.mkdir(path.dirname(destPath), { recursive: true })
            zipfile.openReadStream(entry, (streamErr, readStream) => {
              if (streamErr || !readStream) {
                zipfile.readEntry()
                return
              }
              const writeStream = fsSync.createWriteStream(destPath)
              readStream.pipe(writeStream)
              writeStream.on('finish', () => {
                extractedCount++
                zipfile.readEntry()
              })
              writeStream.on('error', () => {
                zipfile.readEntry()
              })
            })
          } catch {
            zipfile.readEntry()
          }
        }
      })

      zipfile.on('end', () => {
        resolve({ success: true, extractedCount })
      })
      zipfile.on('error', (e) => {
        resolve({ success: false, error: String(e), extractedCount })
      })
    })
  })
}

export class ArchivePlugin implements BrowsePlugin {
  readonly manifest: PluginManifest = {
    id: 'archive',
    displayName: 'Archive Browser',
    version: '1.0.0',
    iconHint: 'archive',
    schemes: ['archive']
  }

  async initialize(): Promise<boolean> {
    return true
  }

  async dispose(): Promise<void> {}

  /**
   * locationId format: "archivePath::internalPath"
   * e.g. "D:\files\test.zip::" for root, "D:\files\test.zip::src/main/" for subfolder
   */
  async readDirectory(locationId: string | null): Promise<ReadDirectoryResult> {
    if (!locationId) {
      return { entries: [], location: 'Archives', parentId: null }
    }

    const [archivePath, internalPath] = this.parseLocation(locationId)
    const ext = path.extname(archivePath).toLowerCase()

    if (ext === '.zip' || ext === '.jar') {
      return this.readZipDirectory(archivePath, internalPath)
    }

    return {
      entries: [],
      location: archivePath,
      parentId: null,
      extraColumns: []
    }
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

      // Only show immediate children
      const parts = relative.split('/').filter(Boolean)
      if (parts.length === 0) continue

      if (parts.length === 1 && !ze.isDirectory) {
        // File at this level
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
          attributes: { readonly: true, hidden: false, symlink: false }
        })
      } else {
        // Directory at this level
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
            attributes: { readonly: true, hidden: false, symlink: false }
          })
        }
      }
    }

    const archiveName = path.basename(archivePath)
    const displayPath = internalPath
      ? `[${archiveName}]/${internalPath}`
      : `[${archiveName}]`

    const parentId = internalPath
      ? `${archivePath}::${internalPath.replace(/[^/]+\/$/, '')}`
      : null // null means "exit archive" — the panel should navigate back to the filesystem

    return {
      entries,
      location: displayPath,
      parentId
    }
  }

  async resolveLocation(input: string): Promise<string | null> {
    // Check if it's a zip file path
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
    return ['copy'] // Extract from archive
  }

  async executeOperation(op: OperationRequest): Promise<OperationResult> {
    if (op.op === 'copy') {
      // Extract files from archive to destination
      const errors: Array<{ entryId: string; message: string }> = []
      for (const entry of op.sourceEntries) {
        const sepIdx = entry.id.indexOf('::')
        if (sepIdx < 0) {
          errors.push({ entryId: entry.id, message: 'Invalid archive entry ID' })
          continue
        }
        const archivePath = entry.id.slice(0, sepIdx)
        const internalPath = entry.id.slice(sepIdx + 2)

        try {
          const result = await extractFromZip(archivePath, internalPath, op.destinationLocationId)
          if (!result.success) {
            errors.push({ entryId: entry.id, message: result.error || 'Extraction failed' })
          }
        } catch (err) {
          errors.push({ entryId: entry.id, message: String(err) })
        }
      }
      return { success: errors.length === 0, errors: errors.length > 0 ? errors : undefined }
    }

    return { success: false, errors: [{ entryId: '', message: `Operation "${op.op}" not supported on archives` }] }
  }

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
