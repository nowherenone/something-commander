/**
 * Translate raw OS / plugin error strings into one-line messages a person can
 * act on (UX plan F-07: errors explain cause + next step, no jargon). The raw
 * text stays available alongside — the operation dialog shows it in the
 * expandable per-file detail list.
 */
export function friendlyFileError(raw: string): string {
  const s = raw || ''
  if (/ENOSPC/i.test(s)) {
    return 'Destination disk is full — free up space or choose another destination.'
  }
  if (/EACCES|EPERM/i.test(s)) {
    return 'Permission denied — check the permissions on the file and its folder.'
  }
  if (/ENOENT/i.test(s)) {
    return 'That file or folder no longer exists — it may have been moved or deleted.'
  }
  if (/EBUSY|ETXTBSY|EPERM.*in use/i.test(s)) {
    return 'The file is in use by another program — close it and try again.'
  }
  if (/EISDIR/i.test(s)) {
    return 'A file was expected but a folder is in the way.'
  }
  if (/ENOTDIR/i.test(s)) {
    return 'A folder was expected but a file is in the way.'
  }
  if (/ENAMETOOLONG/i.test(s)) {
    return 'The name is too long for the destination — try a shorter name.'
  }
  if (/EROFS/i.test(s)) {
    return 'The destination is read-only.'
  }
  if (/ECONN|ETIMEDOUT|EHOSTUNREACH|ENOTFOUND|EAI_AGAIN|EPIPE|EPROTO/i.test(s)) {
    return 'Network problem — check the connection and try again.'
  }
  if (/^cancel/i.test(s)) {
    return 'Cancelled.'
  }
  // Unknown error: keep the original, but cap pathological dumps.
  return s.length > 200 ? `${s.slice(0, 197)}…` : s
}
