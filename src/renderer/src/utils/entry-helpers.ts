/**
 * Return the file extension including the leading dot, lowercased, or `''` if
 * the name has no extension. `"foo.TXT"` → `".txt"`.
 */
export function getExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot).toLowerCase() : ''
}

/**
 * Return the file name without its extension. `"foo.tar.gz"` → `"foo.tar"`.
 */
export function getBaseName(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}

/**
 * Split a plain (non-archive) filesystem path into its parent directory and
 * its last segment. Handles both `\` and `/` separators. If there is no
 * separator, the whole input is treated as the name and the parent is `''`.
 */
export function splitPathTail(p: string): { parent: string; name: string } {
  const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
  if (idx < 0) return { parent: '', name: p }
  return { parent: p.slice(0, idx), name: p.slice(idx + 1) }
}
