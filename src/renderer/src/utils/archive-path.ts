/**
 * Archive locations use `::` to separate the archive file path from the path
 * *inside* the archive. Example: `D:\backup\archive.zip::folder/file.txt`.
 *
 * These helpers centralize that convention so callers don't re-implement the
 * splitting logic with subtle differences (windows vs. posix slashes, leading
 * slash in the internal part, etc.).
 */

const SEP = '::'

export function isArchivePath(locationId: string): boolean {
  return locationId.includes(SEP)
}

export interface ArchivePathParts {
  /** Path to the archive file itself (e.g. `D:\a\archive.zip`). */
  archive: string
  /** Internal path inside the archive with `/` separators, no leading slash. */
  internal: string
}

export function parseArchivePath(locationId: string): ArchivePathParts {
  const [archive, internal] = parseArchiveLocationParts(locationId)
  return { archive, internal }
}

const ARCHIVE_EXTENSIONS = new Set([
  '.zip', '.jar', '.tar', '.tar.gz', '.tgz', '.tar.bz2', '.tbz2', '.tar.xz', '.txz', '.7z'
])

function getArchiveExtension(filePath: string): string {
  const lower = filePath.toLowerCase()
  const compound = ['.tar.gz', '.tar.bz2', '.tar.xz', '.tar.zst', '.tar.lz4'] as const
  const aliases: Record<string, string> = { '.tgz': '.tar.gz', '.tbz2': '.tar.bz2', '.txz': '.tar.xz' }
  const simple = lower.slice(lower.lastIndexOf('.'))
  if (aliases[simple]) return aliases[simple]
  for (const ext of compound) {
    if (lower.endsWith(ext)) return ext
  }
  return simple
}

/**
 * Split an archive location id into archive file path + internal path.
 * Handles remote refs like `sftp:conn::remote/file.zip::folder/`.
 */
export function parseArchiveLocation(locationId: string): ArchivePathParts {
  const [archive, internal] = parseArchiveLocationParts(locationId)
  return { archive, internal }
}

function parseArchiveLocationParts(locationId: string): [string, string] {
  const parts = locationId.split(SEP)
  if (parts.length <= 1) return [locationId, '']

  for (let i = 0; i < parts.length - 1; i++) {
    const candidate = parts.slice(0, i + 1).join(SEP)
    const ext = getArchiveExtension(candidate)
    if (ext && ARCHIVE_EXTENSIONS.has(ext)) {
      const internal = parts.slice(i + 1).join(SEP).replace(/\\/g, '/').replace(/^\//, '')
      return [candidate, internal]
    }
  }

  const archive = parts[0]
  const internal = parts.slice(1).join(SEP).replace(/\\/g, '/').replace(/^\//, '')
  return [archive, internal]
}

export function joinArchivePath(archive: string, internal: string): string {
  const cleaned = internal.replace(/\\/g, '/').replace(/^\//, '')
  return `${archive}${SEP}${cleaned}`
}

/**
 * Split a full archive destination into (directory-inside-archive, filename).
 * Used when a copy's destination is a file path and we need to place it at
 * `archive::dir/filename`.
 */
export function toArchivePathForInternalFile(destPath: string): {
  destDir: string
  destFileName: string
} {
  const { archive, internal } = parseArchivePath(destPath)
  const lastSlash = internal.lastIndexOf('/')
  if (lastSlash >= 0) {
    return {
      destDir: joinArchivePath(archive, internal.slice(0, lastSlash)),
      destFileName: internal.slice(lastSlash + 1)
    }
  }
  return {
    destDir: `${archive}${SEP}`,
    destFileName: internal
  }
}

export { SEP as ARCHIVE_PATH_SEP }
