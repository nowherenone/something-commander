import { describe, it, expect } from 'vitest'
import {
  buildDisplayEntries,
  getCursorDisplayEntry,
  isRenamableEntry,
  PARENT_ENTRY,
  bookmarkDisplayEntries
} from '../renderer/src/utils/display-entries'
import type { TabState } from '../renderer/src/stores/panel-store'

function makeTab(overrides: Partial<TabState> = {}): TabState {
  return {
    id: 'tab-1',
    pluginId: 'local-filesystem',
    locationId: '/home/user',
    locationDisplay: '/home/user',
    entries: [
      {
        id: '/home/user/file.txt',
        name: 'file.txt',
        isContainer: false,
        size: 10,
        modifiedAt: 0,
        mimeType: '',
        iconHint: 'file',
        meta: { extension: 'txt' },
        attributes: { readonly: false, hidden: false, symlink: false }
      }
    ],
    parentId: '/home',
    extraColumns: [],
    selectedEntryIds: new Set(),
    calculatingFolderIds: new Set(),
    cursorIndex: 1,
    sortConfig: { field: 'name', direction: 'asc' },
    showHidden: false,
    isLoading: false,
    error: null,
    errorFolderIds: new Set(),
    renamingEntryId: null,
    ...overrides
  }
}

describe('display-entries', () => {
  it('prepends parent row when location is not home', () => {
    const display = buildDisplayEntries(makeTab())
    expect(display[0]).toEqual(PARENT_ENTRY)
    expect(display[1]?.name).toBe('file.txt')
  })

  it('resolves cursor entry across parent row', () => {
    const tab = makeTab({ cursorIndex: 1 })
    expect(getCursorDisplayEntry(tab)?.name).toBe('file.txt')
  })

  it('rejects non-renamable entries', () => {
    expect(isRenamableEntry(PARENT_ENTRY)).toBe(false)
    expect(isRenamableEntry({
      id: 'C:\\',
      name: 'C:\\',
      isContainer: true,
      size: -1,
      modifiedAt: 0,
      mimeType: '',
      iconHint: 'drive',
      meta: {},
      attributes: { readonly: false, hidden: false, symlink: false }
    })).toBe(false)
    expect(isRenamableEntry(makeTab().entries[0])).toBe(true)
  })

  it('includes bookmark rows on home view', () => {
    const tab = makeTab({ locationId: null, cursorIndex: 1 })
    const bookmarks = bookmarkDisplayEntries([{ name: 'Work', path: '/work', pluginId: 'local-filesystem' }])
    const display = buildDisplayEntries(tab, bookmarks)
    expect(display.map((e) => e.name)).toEqual(['file.txt', '★ Work'])
    expect(getCursorDisplayEntry(tab, bookmarks)?.name).toBe('★ Work')
  })
})