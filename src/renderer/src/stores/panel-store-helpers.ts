import type { ColumnDefinition, Entry, ReadDirectoryResult } from '@shared/types'
import { sortEntries, type SortConfig } from '../utils/sort'

/**
 * Pure transformation from a plugin's `ReadDirectoryResult` into the fields
 * a panel tab needs to render. All three navigation entry points (`navigate`,
 * `navigateWithPlugin`, `refresh`) go through this helper so they share the
 * hidden-filter, sort, and cursor-restore pipeline.
 */
export interface BuiltDirView {
  entries: Entry[]
  cursorIndex: number
  parentId: string | null
  extraColumns: ColumnDefinition[]
}

/**
 * Find an entry by id in the sorted list using exact match first, then a
 * case-insensitive fallback for cross-platform paths (Windows drive letters).
 */
export function findEntryIndexById(entries: Entry[], id: string): number {
  const exact = entries.findIndex((e) => e.id === id)
  if (exact >= 0) return exact
  const lower = id.toLowerCase()
  return entries.findIndex((e) => e.id.toLowerCase() === lower)
}

export function findEntryIndexByName(entries: Entry[], name: string): number {
  return entries.findIndex((e) => e.name === name)
}

interface BuildDirViewOpts {
  showHidden: boolean
  sortConfig: SortConfig
  /** Whether a ".." row will be rendered above the entry list. */
  hasParentRow: boolean
  /**
   * Given the sorted+filtered entries, return the index of the entry that
   * should receive the cursor, or -1 to fall through to the default (0).
   */
  findCursor?: (entries: Entry[]) => number
  /** Optional clamp target — useful for refresh() when nothing matches. */
  fallbackCursor?: number
}

export function buildDirView(result: ReadDirectoryResult, opts: BuildDirViewOpts): BuiltDirView {
  let entries = result.entries
  if (!opts.showHidden) entries = entries.filter((e) => !e.attributes.hidden)
  entries = sortEntries(entries, opts.sortConfig)

  const offset = opts.hasParentRow ? 1 : 0
  const maxIdx = entries.length - 1 + offset

  let cursorIndex = 0
  if (opts.findCursor) {
    const found = opts.findCursor(entries)
    if (found >= 0) cursorIndex = found + offset
    else if (opts.fallbackCursor !== undefined) cursorIndex = opts.fallbackCursor
  } else if (opts.fallbackCursor !== undefined) {
    cursorIndex = opts.fallbackCursor
  }

  // Clamp so a refresh that deleted entries doesn't leave cursor past the end.
  cursorIndex = Math.max(0, Math.min(cursorIndex, Math.max(0, maxIdx)))

  return {
    entries,
    cursorIndex,
    parentId: result.parentId,
    extraColumns: result.extraColumns || []
  }
}
