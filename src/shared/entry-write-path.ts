/**
 * Split an entry id into (parent location id, file name) for writeFromStream.
 *
 * Formats:
 *  - local: `/dir/file.txt` → (`/dir`, `file.txt`)
 *  - sftp/s3/archive: `connOrZip::dir/file.txt` → (`connOrZip::dir/`, `file.txt`)
 *  - smb: `user@host/share/dir/file.txt` → (`user@host/share/dir`, `file.txt`)
 */
export function splitEntryParentAndName(entryId: string): {
  destLocationId: string
  fileName: string
} {
  if (!entryId) return { destLocationId: '', fileName: '' }

  const sep = entryId.indexOf('::')
  if (sep >= 0) {
    const head = entryId.slice(0, sep + 2) // includes '::'
    const rest = entryId.slice(sep + 2).replace(/\\/g, '/')
    const slash = rest.lastIndexOf('/')
    if (slash < 0) {
      return { destLocationId: head, fileName: rest }
    }
    const dir = rest.slice(0, slash)
    const fileName = rest.slice(slash + 1)
    // Trailing slash so S3 prefix concat and archive internalDir work correctly
    const destLocationId = dir ? `${head}${dir.endsWith('/') ? dir : dir + '/'}` : head
    return { destLocationId, fileName }
  }

  const slash = Math.max(entryId.lastIndexOf('/'), entryId.lastIndexOf('\\'))
  if (slash < 0) return { destLocationId: '', fileName: entryId }
  return {
    destLocationId: entryId.slice(0, slash) || entryId.slice(0, 1), // keep "/" root on unix
    fileName: entryId.slice(slash + 1)
  }
}
