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

/** Known plugin prefixes for remote archive sources. */
const PLUGIN_PREFIXES = ['smb:', 'sftp:', 's3:', 'archive:']

/**
 * Check if an archive path references a remote source plugin.
 * e.g. "smb:connId::remote/path/file.zip" → true
 */
export function isRemoteArchivePath(archivePath: string): boolean {
  return PLUGIN_PREFIXES.some((p) => archivePath.startsWith(p))
}

/**
 * Parse a remote archive path into plugin ID and entry ID.
 * e.g. "smb:connId::remote/path/file.zip" → { pluginId: "smb", entryId: "connId::remote/path/file.zip" }
 */
export function parseRemoteRef(archivePath: string): { pluginId: string; entryId: string } {
  const colonIdx = archivePath.indexOf(':')
  const pluginId = archivePath.slice(0, colonIdx)
  const entryId = archivePath.slice(colonIdx + 1)
  return { pluginId, entryId }
}

/**
 * Split a locationId of the form "archivePath::internalPath" into its parts.
 * For remote archives like "smb:connId::remote/file.zip::src/main/",
 * splits at the LAST "::" that follows an archive extension.
 */
export function parseLocation(locationId: string): [string, string] {
  // Find the archive extension boundary — the :: after the archive filename
  // For "smb:connId::path/file.zip::internal" we need to split at the :: after .zip
  // Strategy: find the last :: that is preceded by an archive extension
  const parts = locationId.split('::')
  if (parts.length <= 1) return [locationId, '']
  if (parts.length === 2) return [parts[0], parts[1]]

  // Multiple :: segments — find the split point
  // Build up the archive path by joining segments until we find one ending with an archive extension
  for (let i = 0; i < parts.length - 1; i++) {
    const candidate = parts.slice(0, i + 1).join('::')
    const ext = getArchiveExtension(candidate)
    if (ext && ARCHIVE_EXTENSIONS.has(ext)) {
      return [candidate, parts.slice(i + 1).join('::')]
    }
  }

  // Fallback: split at first ::
  return [parts[0], parts.slice(1).join('::')]
}

/** Set of known archive extensions for location parsing. */
const ARCHIVE_EXTENSIONS = new Set([
  '.zip', '.jar', '.tar', '.tar.gz', '.tgz', '.tar.bz2', '.tbz2', '.tar.xz', '.txz'
])

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
