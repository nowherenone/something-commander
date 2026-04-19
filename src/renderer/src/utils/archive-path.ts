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
  const idx = locationId.indexOf(SEP)
  if (idx < 0) return { archive: locationId, internal: '' }
  const archive = locationId.slice(0, idx)
  const internal = locationId.slice(idx + SEP.length).replace(/\\/g, '/').replace(/^\//, '')
  return { archive, internal }
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
