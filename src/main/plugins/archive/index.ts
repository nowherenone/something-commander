import * as fs from 'fs/promises'
import type {
  BrowsePlugin,
  PluginManifest,
  ReadDirectoryResult,
  PluginOperation,
  OperationRequest,
  OperationResult
} from '@shared/types'
import type { ArchiveDriver, ArchiveEntry } from './driver'
import { ZipDriver } from './drivers/zip'
import { TarDriver, TarReadOnlyDriver } from './drivers/tar'
import {
  parseLocation,
  getArchiveExtension,
  archiveBasename,
  archiveDirname,
  joinDestPath,
  buildDirectoryListing
} from './utils'

// ─── Module-level driver registry ─────────────────────────────────────────────
// Shared by ArchivePlugin instances and the extractFromZip backward-compat export.

const DRIVERS = new Map<string, ArchiveDriver>()

function registerDriver(driver: ArchiveDriver): void {
  for (const ext of driver.extensions) DRIVERS.set(ext, driver)
}

function getDriver(archivePath: string): ArchiveDriver | null {
  return DRIVERS.get(getArchiveExtension(archivePath)) ?? null
}

registerDriver(new ZipDriver())
registerDriver(new TarDriver())
registerDriver(new TarReadOnlyDriver())

// ─── Public format query ───────────────────────────────────────────────────────

export interface ArchiveFormatInfo {
  label: string
  extensions: string[]
  primaryExtension: string
  supportsWrite: boolean
}

/** Returns one entry per registered driver (deduplicated). */
export function getArchiveFormats(): ArchiveFormatInfo[] {
  const seen = new Set<ArchiveDriver>()
  const formats: ArchiveFormatInfo[] = []
  for (const driver of DRIVERS.values()) {
    if (!seen.has(driver)) {
      seen.add(driver)
      formats.push({
        label: driver.extensions[0].replace(/^\./, '').toUpperCase(),
        extensions: [...driver.extensions],
        primaryExtension: driver.extensions[0],
        supportsWrite: driver.supportsWrite
      })
    }
  }
  return formats
}

// ─── Backward-compat export (used by plugin-ipc.ts) ───────────────────────────

/**
 * Extract an entry from any supported archive format to a local directory.
 * Kept as a module-level export for backward compatibility with plugin-ipc.ts.
 */
export async function extractFromZip(
  archivePath: string,
  internalPath: string,
  destDir: string
): Promise<{ success: boolean; error?: string; extractedCount: number }> {
  const driver = getDriver(archivePath)
  if (!driver) return { success: false, error: 'Unsupported archive format', extractedCount: 0 }
  const result = await driver.extract(archivePath, internalPath, destDir)
  return { success: result.success, error: result.error, extractedCount: result.count }
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

  /** Check whether a file can be browsed as an archive. */
  static isArchive(filePath: string): boolean {
    return DRIVERS.has(getArchiveExtension(filePath))
  }

  // ── BrowsePlugin interface ──────────────────────────────────────────────────

  /**
   * locationId format: "archivePath::internalPath"
   * e.g. "D:\files\a.zip::"  (root), "D:\files\a.zip::src/main/" (subfolder)
   */
  async readDirectory(locationId: string | null): Promise<ReadDirectoryResult> {
    if (!locationId) return { entries: [], location: 'Archives', parentId: null }
    const [archivePath, internalPath] = parseLocation(locationId)
    const driver = getDriver(archivePath)
    if (!driver) return { entries: [], location: archivePath, parentId: null }
    const allEntries = await driver.readEntries(archivePath)
    return buildDirectoryListing(archivePath, internalPath, allEntries)
  }

  async resolveLocation(input: string): Promise<string | null> {
    if (!getDriver(input)) return null
    try {
      await fs.access(input)
      return `${input}::`
    } catch {
      return null
    }
  }

  getSupportedOperations(): PluginOperation[] {
    return ['copy', 'delete', 'rename', 'move']
  }

  async executeOperation(op: OperationRequest): Promise<OperationResult> {
    const errors: Array<{ entryId: string; message: string }> = []

    // ── copy (extract to local or other archive) ────────────────────────────
    if (op.op === 'copy') {
      for (const entry of op.sourceEntries) {
        const [archivePath, internalPath] = parseLocation(entry.id)
        const driver = getDriver(archivePath)
        if (!driver) {
          errors.push({ entryId: entry.id, message: 'Unsupported archive format' })
          continue
        }
        try {
          const result = await driver.extract(archivePath, internalPath, op.destinationLocationId)
          if (!result.success) errors.push({ entryId: entry.id, message: result.error || 'Extraction failed' })
        } catch (err) {
          errors.push({ entryId: entry.id, message: String(err) })
        }
      }
      return { success: errors.length === 0, errors: errors.length > 0 ? errors : undefined }
    }

    // ── delete ──────────────────────────────────────────────────────────────
    if (op.op === 'delete') {
      const byArchive = new Map<string, string[]>()
      for (const entry of op.entries) {
        const [archivePath, internalPath] = parseLocation(entry.id)
        if (!byArchive.has(archivePath)) byArchive.set(archivePath, [])
        byArchive.get(archivePath)!.push(internalPath)
      }
      for (const [archivePath, internalPaths] of byArchive) {
        const driver = getDriver(archivePath)
        if (!driver?.deleteEntries) {
          errors.push({ entryId: archivePath, message: 'This archive format does not support deletion' })
          continue
        }
        try {
          await driver.deleteEntries(archivePath, internalPaths)
        } catch (err) {
          errors.push({ entryId: archivePath, message: String(err) })
        }
      }
      return { success: errors.length === 0, errors: errors.length > 0 ? errors : undefined }
    }

    // ── rename ──────────────────────────────────────────────────────────────
    if (op.op === 'rename') {
      const [archivePath, internalPath] = parseLocation(op.entry.id)
      const driver = getDriver(archivePath)
      if (!driver?.renameEntry) {
        return { success: false, errors: [{ entryId: op.entry.id, message: 'This archive format does not support renaming' }] }
      }
      const isDir = internalPath.endsWith('/')
      const newInternalPath = archiveDirname(internalPath) + op.newName + (isDir ? '/' : '')
      try {
        await driver.renameEntry(archivePath, internalPath, newInternalPath)
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
      const [destArchivePath, destInternalDir] = parseLocation(op.destinationLocationId)
      const driver = getDriver(destArchivePath)
      if (!driver?.moveEntries) {
        return { success: false, errors: [{ entryId: '', message: 'This archive format does not support moving' }] }
      }
      const srcPaths = op.sourceEntries.map((e) => parseLocation(e.id)[1])
      try {
        await driver.moveEntries(destArchivePath, srcPaths, destInternalDir)
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

  async writeFromStream(
    destLocationId: string,
    destFileName: string,
    stream: NodeJS.ReadableStream
  ): Promise<{ success: boolean; bytesWritten: number; error?: string }> {
    const [archivePath, internalDir] = parseLocation(destLocationId)
    const driver = getDriver(archivePath)
    if (!driver?.addFromStream) {
      return { success: false, bytesWritten: 0, error: 'This archive format does not support writing' }
    }
    const entryPath = internalDir
      ? (internalDir.endsWith('/') ? internalDir : internalDir + '/') + destFileName
      : destFileName
    return driver.addFromStream(archivePath, entryPath, stream)
  }

  async enumerateFiles(
    entryIds: string[],
    destDir: string
  ): Promise<Array<{ sourcePath: string; destPath: string; size: number; isDirectory: boolean; relativePath: string }>> {
    const result: Array<{ sourcePath: string; destPath: string; size: number; isDirectory: boolean; relativePath: string }> = []

    // Group by archive so we open each file only once
    const byArchive = new Map<string, string[]>()
    for (const id of entryIds) {
      const [archivePath, internalPath] = parseLocation(id)
      if (!byArchive.has(archivePath)) byArchive.set(archivePath, [])
      byArchive.get(archivePath)!.push(internalPath)
    }

    for (const [archivePath, internalPaths] of byArchive) {
      const driver = getDriver(archivePath)
      if (!driver) continue

      let allEntries: ArchiveEntry[]
      try {
        allEntries = await driver.readEntries(archivePath)
      } catch {
        continue
      }

      for (const internalPath of internalPaths) {
        if (!internalPath) {
          // Entire archive
          for (const ae of allEntries) {
            const rel = ae.isDirectory ? ae.path.replace(/\/$/, '') : ae.path
            if (!rel) continue
            result.push({
              sourcePath: `${archivePath}::${ae.path}`,
              destPath: destDir ? joinDestPath(destDir, rel) : rel,
              size: ae.isDirectory ? 0 : ae.size,
              isDirectory: ae.isDirectory,
              relativePath: rel
            })
          }
        } else if (internalPath.endsWith('/')) {
          // Directory subtree
          const topName = archiveBasename(internalPath)
          for (const ae of allEntries) {
            if (!ae.path.startsWith(internalPath) || ae.path === internalPath) continue
            const suffix = ae.path.slice(internalPath.length)
            const rel = ae.isDirectory
              ? topName + '/' + suffix.replace(/\/$/, '')
              : topName + '/' + suffix
            result.push({
              sourcePath: `${archivePath}::${ae.path}`,
              destPath: destDir ? joinDestPath(destDir, rel) : rel,
              size: ae.isDirectory ? 0 : ae.size,
              isDirectory: ae.isDirectory,
              relativePath: rel
            })
          }
        } else {
          // Single file
          const ae = allEntries.find((e) => e.path === internalPath)
          if (ae) {
            const rel = archiveBasename(internalPath)
            result.push({
              sourcePath: `${archivePath}::${internalPath}`,
              destPath: destDir ? joinDestPath(destDir, rel) : rel,
              size: ae.size,
              isDirectory: false,
              relativePath: rel
            })
          }
        }
      }
    }

    return result
  }

  async createReadStream(entryId: string): Promise<NodeJS.ReadableStream | null> {
    const [archivePath, internalPath] = parseLocation(entryId)
    if (!internalPath || internalPath.endsWith('/')) return null
    const driver = getDriver(archivePath)
    if (!driver) return null
    return driver.createReadStream(archivePath, internalPath)
  }
}
