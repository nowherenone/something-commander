import * as path from 'path'
import type { Entry, ReadDirectoryResult } from '@shared/types'
import type { ArchiveEntry } from './driver'

// ─── Extension detection ───────────────────────────────────────────────────────

/** Compound extensions that must be checked before the simple path.extname() fallback. */
const COMPOUND_EXTS = ['.tar.gz', '.tar.bz2', '.tar.xz', '.tar.zst', '.tar.lz4'] as const

/** Aliases that normalize to canonical compound extensions. */
const EXT_ALIASES: Record<string, string> = {
  '.tgz':  '.tar.gz',
  '.tbz2': '.tar.bz2',
  '.txz':  '.tar.xz',
}

/**
 * Return the effective archive extension for a file path.
 * Handles compound extensions (.tar.gz etc.) and known aliases (.tgz etc.).
 */
export function getArchiveExtension(filePath: string): string {
  const lower = filePath.toLowerCase()
  const simple = path.extname(lower)
  if (EXT_ALIASES[simple]) return EXT_ALIASES[simple]
  for (const ext of COMPOUND_EXTS) {
    if (lower.endsWith(ext)) return ext
  }
  return simple
}

// ─── Location parsing ──────────────────────────────────────────────────────────

/**
 * Split a locationId of the form "archivePath::internalPath" into its parts.
 * e.g. "D:\files\a.zip::src/main/" → ["D:\files\a.zip", "src/main/"]
 */
export function parseLocation(locationId: string): [string, string] {
  const sepIdx = locationId.indexOf('::')
  if (sepIdx < 0) return [locationId, '']
  return [locationId.slice(0, sepIdx), locationId.slice(sepIdx + 2)]
}

// ─── Internal path helpers ─────────────────────────────────────────────────────

/** Return the basename of an archive-internal path (forward-slash, may end with /). */
export function archiveBasename(internalPath: string): string {
  const noTrailing = internalPath.replace(/\/$/, '')
  const lastSlash = noTrailing.lastIndexOf('/')
  return lastSlash >= 0 ? noTrailing.slice(lastSlash + 1) : noTrailing
}

/** Return the parent directory of an archive-internal path, with trailing slash. */
export function archiveDirname(internalPath: string): string {
  const noTrailing = internalPath.replace(/\/$/, '')
  const lastSlash = noTrailing.lastIndexOf('/')
  return lastSlash >= 0 ? noTrailing.slice(0, lastSlash + 1) : ''
}

/**
 * Join a destination path (which may be archive::internal or a local dir)
 * with a relative path, using forward slashes for archive paths.
 */
export function joinDestPath(destDir: string, relativePath: string): string {
  if (destDir.includes('::')) {
    const base = destDir.endsWith('/') || destDir.endsWith('::') ? destDir : destDir + '/'
    return base + relativePath
  }
  return path.join(destDir, relativePath)
}

// ─── Directory listing ─────────────────────────────────────────────────────────

/**
 * Build a ReadDirectoryResult from a flat list of ArchiveEntry objects.
 * This is format-agnostic: all drivers produce ArchiveEntry[], and this
 * function converts that into the panel's Entry[] with virtual directories.
 */
export function buildDirectoryListing(
  archivePath: string,
  internalPath: string,
  allEntries: ArchiveEntry[]
): ReadDirectoryResult {
  const prefix = internalPath || ''
  const seenDirs = new Set<string>()
  const entries: Entry[] = []

  for (const ae of allEntries) {
    if (!ae.path.startsWith(prefix)) continue
    const relative = ae.path.slice(prefix.length)
    if (!relative || relative === '/') continue

    const parts = relative.split('/').filter(Boolean)
    if (parts.length === 0) continue

    if (parts.length === 1 && !ae.isDirectory) {
      const ext = path.extname(parts[0]).slice(1).toLowerCase()
      entries.push({
        id: `${archivePath}::${prefix}${parts[0]}`,
        name: parts[0],
        isContainer: false,
        size: ae.size,
        modifiedAt: ae.modifiedAt.getTime(),
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
          modifiedAt: ae.modifiedAt.getTime(),
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
