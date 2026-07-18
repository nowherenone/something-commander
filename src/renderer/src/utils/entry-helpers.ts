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

/**
 * Normalize a location/entry id for prefix comparison: unify separators and
 * strip trailing slashes (keep archive `::` root suffix intact).
 */
export function normalizeLocationPath(p: string): string {
  if (!p) return ''
  // Preserve archive scheme suffix like `file.zip::` or `file.zip::folder/`
  const sepIdx = p.indexOf('::')
  if (sepIdx >= 0) {
    const archive = p.slice(0, sepIdx).replace(/\\/g, '/')
    let internal = p.slice(sepIdx + 2).replace(/\\/g, '/')
    internal = internal.replace(/\/+$/, '')
    return internal ? `${archive}::${internal}` : `${archive}::`
  }
  return p.replace(/\\/g, '/').replace(/\/+$/, '')
}

/**
 * True when `child` is the same path as `parent` or a strict descendant.
 * Uses separator-aware prefix matching so `/home/a` does not match `/home/ab`.
 */
export function isSameOrDescendantPath(parent: string, child: string): boolean {
  const p = normalizeLocationPath(parent)
  const c = normalizeLocationPath(child)
  if (!p || !c) return false
  if (c === p) return true
  // Archive root `zip::` — any entry inside that archive is a descendant
  if (p.endsWith('::')) return c.startsWith(p)
  return c.startsWith(p + '/') || c.startsWith(p + '::')
}

/**
 * Whether copy/move of `entries` into `destLocationId` would place a selected
 * folder into itself or one of its subfolders.
 *
 * Only selected *containers* can cause this. Copying files into a subfolder of
 * the current source listing is valid (e.g. left=/work, right=/work/out).
 */
export function wouldCopyIntoSelf(
  entries: ReadonlyArray<{ id: string; isContainer: boolean }>,
  destLocationId: string
): boolean {
  if (!destLocationId) return false
  for (const entry of entries) {
    if (!entry.isContainer) continue
    if (isSameOrDescendantPath(entry.id, destLocationId)) return true
  }
  return false
}

/** Join parent dir + name using the separator style of `dir` (Windows/Unix). */
export function joinLocationPath(dir: string, name: string): string {
  if (!dir) return name
  if (!name) return dir
  const sep = dir.includes('\\') && !dir.includes('/') ? '\\' : '/'
  // Prefer backslash when Windows drive path
  const useSep =
    /\\/.test(dir) && !dir.includes('://') ? '\\' : sep === '\\' ? '\\' : '/'
  const cleaned = dir.replace(/[/\\]+$/, '')
  return cleaned + useSep + name
}

/**
 * Default confirm-dialog destination for copy/move.
 * Single non-container file → full path including file name (rename-on-copy).
 * Otherwise → destination directory only.
 */
export function defaultCopyMoveDestPath(
  destDir: string,
  entries: ReadonlyArray<{ name: string; isContainer: boolean }>
): string {
  if (entries.length === 1 && !entries[0].isContainer) {
    return joinLocationPath(destDir, entries[0].name)
  }
  return destDir
}

export interface ParsedCopyDest {
  /** Directory for enumerate/stream-copy */
  destDir: string
  /** When set, overrides the single-file destination name */
  destFileName?: string
}

/**
 * Parse the confirm-dialog destination field for copy/move.
 * Single-file mode: full path with optional rename; trailing slash = dir only
 * (keep original file name). Multi-item mode: field is the directory.
 */
export function parseCopyMoveDestInput(
  destInput: string,
  options: { isSingleFile: boolean; originalFileName: string }
): ParsedCopyDest {
  const raw = destInput.trim()
  if (!raw) {
    return { destDir: '', destFileName: options.isSingleFile ? options.originalFileName : undefined }
  }

  if (!options.isSingleFile) {
    return { destDir: raw.replace(/[/\\]+$/, '') || raw }
  }

  // Trailing separator → treat as directory, keep original name
  if (/[/\\]$/.test(raw)) {
    return {
      destDir: raw.replace(/[/\\]+$/, ''),
      destFileName: options.originalFileName
    }
  }

  const { parent, name } = splitPathTail(raw)
  if (!parent) {
    // Bare filename → same folder not specified; caller should still have a dir
    return { destDir: '', destFileName: name || options.originalFileName }
  }
  return {
    destDir: parent,
    destFileName: name || options.originalFileName
  }
}
