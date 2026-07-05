import type { Entry } from '@shared/types'
import type { TabState } from '../stores/panel-store'

function hasParentEntry(tab: TabState): boolean {
  return tab.locationId !== null
}

export const PARENT_ENTRY: Entry = {
  id: '__parent__',
  name: '..',
  isContainer: true,
  size: -1,
  modifiedAt: 0,
  mimeType: 'inode/directory',
  iconHint: 'folder',
  meta: {},
  attributes: { readonly: true, hidden: false, symlink: false }
}

export function bookmarkDisplayEntries(
  bookmarks: Array<{ name: string; path: string; pluginId: string }>
): Entry[] {
  return bookmarks.map((bm) => ({
    id: bm.path,
    name: `\u2605 ${bm.name}`,
    isContainer: true,
    size: -1,
    modifiedAt: 0,
    mimeType: 'inode/directory',
    iconHint: 'folder',
    meta: { bookmark: true, pluginId: bm.pluginId },
    attributes: { readonly: false, hidden: false, symlink: false }
  }))
}

/** Entries shown in the file list (parent row, directory entries, home bookmarks). */
export function buildDisplayEntries(tab: TabState, extraEntries: Entry[] = []): Entry[] {
  const rows = [...tab.entries, ...extraEntries]
  return hasParentEntry(tab) ? [PARENT_ENTRY, ...rows] : rows
}

export function getCursorDisplayEntry(tab: TabState, extraEntries: Entry[] = []): Entry | null {
  const display = buildDisplayEntries(tab, extraEntries)
  const idx = tab.cursorIndex
  if (idx < 0 || idx >= display.length) return null
  return display[idx]
}

export function isRenamableEntry(entry: Entry): boolean {
  if (entry.id === '__parent__') return false
  if (entry.iconHint === 'drive' || entry.iconHint === 'network') return false
  if (entry.meta.bookmark) return false
  return true
}