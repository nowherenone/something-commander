import * as path from 'path'
import * as fs from 'fs/promises'
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
    // Archives are read-only for now
    return []
  }

  async executeOperation(_op: OperationRequest): Promise<OperationResult> {
    return { success: false, errors: [{ entryId: '', message: 'Archives are read-only' }] }
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
