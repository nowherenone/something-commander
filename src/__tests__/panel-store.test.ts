import { describe, it, expect, beforeEach, vi } from 'vitest'
import { usePanelStore } from '../renderer/src/stores/panel-store'
import type { Entry } from '../shared/types/entry'

function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: '/test/file.txt',
    name: 'file.txt',
    isContainer: false,
    size: 100,
    modifiedAt: 1000000,
    mimeType: 'text/plain',
    iconHint: 'file',
    meta: { extension: 'txt' },
    attributes: { readonly: false, hidden: false, symlink: false },
    ...overrides
  }
}

// Helper to create a fresh panel slice
function freshPanel() {
  let counter = Date.now()
  const tabId = `tab-reset-${++counter}`
  return {
    tabs: [
      {
        id: tabId,
        pluginId: 'local-filesystem',
        locationId: null,
        locationDisplay: '',
        entries: [] as Entry[],
        parentId: null,
        extraColumns: [],
        selectedEntryIds: new Set<string>(),
        cursorIndex: 0,
        sortConfig: { field: 'name' as const, direction: 'asc' as const },
        showHidden: false,
        isLoading: false,
        error: null
      }
    ],
    activeTabId: tabId
  }
}

describe('panel-store', () => {
  beforeEach(() => {
    usePanelStore.setState({
      left: freshPanel(),
      right: freshPanel()
    })
  })

  describe('tabs', () => {
    it('starts with one tab per panel', () => {
      const state = usePanelStore.getState()
      expect(state.left.tabs.length).toBe(1)
      expect(state.right.tabs.length).toBe(1)
    })

    it('addTab creates a new tab', () => {
      usePanelStore.getState().addTab('left')
      expect(usePanelStore.getState().left.tabs.length).toBe(2)
    })

    it('closeTab removes a tab', () => {
      usePanelStore.getState().addTab('left')
      const tabs = usePanelStore.getState().left.tabs
      expect(tabs.length).toBe(2)

      usePanelStore.getState().closeTab('left', tabs[1].id)
      expect(usePanelStore.getState().left.tabs.length).toBe(1)
    })

    it('does not close the last tab', () => {
      const tabId = usePanelStore.getState().left.tabs[0].id
      usePanelStore.getState().closeTab('left', tabId)
      expect(usePanelStore.getState().left.tabs.length).toBe(1)
    })

    it('switchTab changes activeTabId', () => {
      usePanelStore.getState().addTab('left')
      const tabs = usePanelStore.getState().left.tabs
      const firstId = tabs[0].id
      const secondId = tabs[1].id

      usePanelStore.getState().switchTab('left', firstId)
      expect(usePanelStore.getState().left.activeTabId).toBe(firstId)

      usePanelStore.getState().switchTab('left', secondId)
      expect(usePanelStore.getState().left.activeTabId).toBe(secondId)
    })
  })

  describe('navigate', () => {
    it('calls readDirectory and updates entries', async () => {
      const mockEntries: Entry[] = [
        makeEntry({ id: '/docs', name: 'docs', isContainer: true }),
        makeEntry({ id: '/readme.md', name: 'readme.md' })
      ]

      vi.mocked(window.api.plugins.readDirectory).mockResolvedValueOnce({
        entries: mockEntries,
        location: '/home',
        parentId: null,
        extraColumns: []
      })

      await usePanelStore.getState().navigate('left', '/home')

      const tab = usePanelStore.getState().getActiveTab('left')
      expect(tab.entries.length).toBe(2)
      expect(tab.locationDisplay).toBe('/home')
      expect(tab.parentId).toBeNull()
      expect(tab.isLoading).toBe(false)
    })

    it('sorts entries with containers first', async () => {
      const mockEntries: Entry[] = [
        makeEntry({ id: '/z.txt', name: 'z.txt', isContainer: false }),
        makeEntry({ id: '/a', name: 'a', isContainer: true }),
        makeEntry({ id: '/b.txt', name: 'b.txt', isContainer: false })
      ]

      vi.mocked(window.api.plugins.readDirectory).mockResolvedValueOnce({
        entries: mockEntries,
        location: '/test',
        parentId: '/',
        extraColumns: []
      })

      await usePanelStore.getState().navigate('left', '/test')

      const tab = usePanelStore.getState().getActiveTab('left')
      expect(tab.entries[0].name).toBe('a')
      expect(tab.entries[0].isContainer).toBe(true)
    })

    it('handles errors gracefully', async () => {
      vi.mocked(window.api.plugins.readDirectory).mockRejectedValueOnce(
        new Error('Permission denied')
      )

      await usePanelStore.getState().navigate('left', '/forbidden')

      const tab = usePanelStore.getState().getActiveTab('left')
      expect(tab.isLoading).toBe(false)
      expect(tab.error).toContain('Permission denied')
    })
  })

  describe('selection', () => {
    it('toggleSelect adds and removes entries', async () => {
      const mockEntries: Entry[] = [
        makeEntry({ id: '/a.txt', name: 'a.txt' }),
        makeEntry({ id: '/b.txt', name: 'b.txt' })
      ]

      vi.mocked(window.api.plugins.readDirectory).mockResolvedValueOnce({
        entries: mockEntries,
        location: '/test',
        parentId: null
      })

      await usePanelStore.getState().navigate('left', '/test')

      usePanelStore.getState().toggleSelect('left', '/a.txt')
      expect(usePanelStore.getState().getActiveTab('left').selectedEntryIds.has('/a.txt')).toBe(true)

      usePanelStore.getState().toggleSelect('left', '/a.txt')
      expect(usePanelStore.getState().getActiveTab('left').selectedEntryIds.has('/a.txt')).toBe(false)
    })

    it('selectAll selects all entries', async () => {
      const mockEntries: Entry[] = [
        makeEntry({ id: '/a.txt', name: 'a.txt' }),
        makeEntry({ id: '/dir', name: 'dir', isContainer: true }),
        makeEntry({ id: '/b.txt', name: 'b.txt' })
      ]

      vi.mocked(window.api.plugins.readDirectory).mockResolvedValueOnce({
        entries: mockEntries,
        location: '/test',
        parentId: null
      })

      await usePanelStore.getState().navigate('left', '/test')
      usePanelStore.getState().selectAll('left')

      const tab = usePanelStore.getState().getActiveTab('left')
      expect(tab.selectedEntryIds.size).toBe(3)
    })

    it('deselectAll clears selection', async () => {
      const mockEntries: Entry[] = [makeEntry({ id: '/a.txt', name: 'a.txt' })]

      vi.mocked(window.api.plugins.readDirectory).mockResolvedValueOnce({
        entries: mockEntries,
        location: '/test',
        parentId: null
      })

      await usePanelStore.getState().navigate('left', '/test')
      usePanelStore.getState().selectAll('left')
      usePanelStore.getState().deselectAll('left')

      expect(usePanelStore.getState().getActiveTab('left').selectedEntryIds.size).toBe(0)
    })
  })

  describe('cursor', () => {
    it('setCursor clamps to valid range', async () => {
      const mockEntries: Entry[] = [
        makeEntry({ id: '/a', name: 'a' }),
        makeEntry({ id: '/b', name: 'b' }),
        makeEntry({ id: '/c', name: 'c' })
      ]

      vi.mocked(window.api.plugins.readDirectory).mockResolvedValueOnce({
        entries: mockEntries,
        location: '/test',
        parentId: null
      })

      await usePanelStore.getState().navigate('left', '/test')

      usePanelStore.getState().setCursor('left', -5)
      expect(usePanelStore.getState().getActiveTab('left').cursorIndex).toBe(0)

      usePanelStore.getState().setCursor('left', 100)
      // 3 entries + ".." row (locationId is '/test', not null) = max index 3
      expect(usePanelStore.getState().getActiveTab('left').cursorIndex).toBe(3)
    })
  })

  describe('sort', () => {
    it('setSort re-sorts entries', async () => {
      const mockEntries: Entry[] = [
        makeEntry({ id: '/a', name: 'a', size: 300 }),
        makeEntry({ id: '/b', name: 'b', size: 100 }),
        makeEntry({ id: '/c', name: 'c', size: 200 })
      ]

      vi.mocked(window.api.plugins.readDirectory).mockResolvedValueOnce({
        entries: mockEntries,
        location: '/test',
        parentId: null
      })

      await usePanelStore.getState().navigate('left', '/test')
      usePanelStore.getState().setSort('left', { field: 'size', direction: 'asc' })

      const tab = usePanelStore.getState().getActiveTab('left')
      expect(tab.entries.map((e) => e.name)).toEqual(['b', 'c', 'a'])
    })
  })

  describe('spaceSelect', () => {
    it('does NOT advance cursor', async () => {
      const mockEntries: Entry[] = [
        makeEntry({ id: '/a', name: 'a' }),
        makeEntry({ id: '/b', name: 'b' }),
        makeEntry({ id: '/c', name: 'c' })
      ]

      vi.mocked(window.api.plugins.readDirectory).mockResolvedValueOnce({
        entries: mockEntries,
        location: '/test',
        parentId: null
      })

      await usePanelStore.getState().navigate('left', '/test')
      usePanelStore.getState().setCursor('left', 1)
      usePanelStore.getState().spaceSelect('left', 1)

      const tab = usePanelStore.getState().getActiveTab('left')
      // Cursor should stay at 1, NOT advance to 2
      expect(tab.cursorIndex).toBe(1)
      expect(tab.selectedEntryIds.has('/b')).toBe(true)
    })

    it('toggles selection off when pressing space again', async () => {
      const mockEntries: Entry[] = [makeEntry({ id: '/a', name: 'a' })]

      vi.mocked(window.api.plugins.readDirectory).mockResolvedValueOnce({
        entries: mockEntries,
        location: '/test',
        parentId: null
      })

      await usePanelStore.getState().navigate('left', '/test')
      usePanelStore.getState().spaceSelect('left', 0)
      expect(usePanelStore.getState().getActiveTab('left').selectedEntryIds.has('/a')).toBe(true)

      usePanelStore.getState().spaceSelect('left', 0)
      expect(usePanelStore.getState().getActiveTab('left').selectedEntryIds.has('/a')).toBe(false)
    })

    it('marks container as calculating when selected', async () => {
      const mockEntries: Entry[] = [
        makeEntry({ id: '/docs', name: 'docs', isContainer: true })
      ]

      vi.mocked(window.api.plugins.readDirectory).mockResolvedValueOnce({
        entries: mockEntries,
        location: '/test',
        parentId: null
      })

      await usePanelStore.getState().navigate('left', '/test')
      usePanelStore.getState().spaceSelect('left', 0)

      const tab = usePanelStore.getState().getActiveTab('left')
      expect(tab.calculatingFolderIds.has('/docs')).toBe(true)
    })
  })

  describe('cancelFolderCalculations', () => {
    it('clears all calculating folder IDs', async () => {
      const mockEntries: Entry[] = [
        makeEntry({ id: '/a', name: 'a', isContainer: true }),
        makeEntry({ id: '/b', name: 'b', isContainer: true })
      ]

      vi.mocked(window.api.plugins.readDirectory).mockResolvedValueOnce({
        entries: mockEntries,
        location: '/test',
        parentId: null
      })

      await usePanelStore.getState().navigate('left', '/test')
      usePanelStore.getState().spaceSelect('left', 0)
      usePanelStore.getState().spaceSelect('left', 1)

      expect(usePanelStore.getState().getActiveTab('left').calculatingFolderIds.size).toBe(2)

      usePanelStore.getState().cancelFolderCalculations('left')
      expect(usePanelStore.getState().getActiveTab('left').calculatingFolderIds.size).toBe(0)
    })
  })

  describe('navigate cursor placement', () => {
    it('places cursor on previous folder when going up', async () => {
      // First navigate to /test/subdir
      vi.mocked(window.api.plugins.readDirectory).mockResolvedValueOnce({
        entries: [makeEntry({ id: '/test/a', name: 'a', isContainer: true })],
        location: '/test/subdir',
        parentId: '/test'
      })
      await usePanelStore.getState().navigate('left', '/test/subdir')

      // Now navigate up to /test — should land cursor on 'subdir'
      vi.mocked(window.api.plugins.readDirectory).mockResolvedValueOnce({
        entries: [
          makeEntry({ id: '/test/alpha', name: 'alpha', isContainer: true }),
          makeEntry({ id: '/test/subdir', name: 'subdir', isContainer: true }),
          makeEntry({ id: '/test/zzz', name: 'zzz', isContainer: true })
        ],
        location: '/test',
        parentId: '/'
      })
      await usePanelStore.getState().navigate('left', '/test')

      const tab = usePanelStore.getState().getActiveTab('left')
      // subdir is at index 1 in entries, plus 1 for ".." row = cursor at 2
      expect(tab.cursorIndex).toBe(2)
    })

    it('full Enter→Backspace flow with Windows-style paths', async () => {
      // Step 1: navigate to D:\Work (initial)
      vi.mocked(window.api.plugins.readDirectory).mockResolvedValueOnce({
        entries: [
          makeEntry({ id: 'D:\\Work\\Alpha', name: 'Alpha', isContainer: true }),
          makeEntry({ id: 'D:\\Work\\Flemanager', name: 'Flemanager', isContainer: true }),
          makeEntry({ id: 'D:\\Work\\Zeta', name: 'Zeta', isContainer: true }),
          makeEntry({ id: 'D:\\Work\\readme.txt', name: 'readme.txt' })
        ],
        location: 'D:\\Work',
        parentId: 'D:\\'
      })
      await usePanelStore.getState().navigate('left', 'D:\\Work')

      // Step 2: navigate INTO Flemanager (like pressing Enter on that entry)
      vi.mocked(window.api.plugins.readDirectory).mockResolvedValueOnce({
        entries: [
          makeEntry({ id: 'D:\\Work\\Flemanager\\src', name: 'src', isContainer: true }),
          makeEntry({ id: 'D:\\Work\\Flemanager\\package.json', name: 'package.json' })
        ],
        location: 'D:\\Work\\Flemanager',
        parentId: 'D:\\Work'
      })
      await usePanelStore.getState().navigate('left', 'D:\\Work\\Flemanager')

      // Verify we're in Flemanager
      let tab = usePanelStore.getState().getActiveTab('left')
      expect(tab.locationId).toBe('D:\\Work\\Flemanager')

      // Step 3: go back up with Backspace (navigate to parentId)
      vi.mocked(window.api.plugins.readDirectory).mockResolvedValueOnce({
        entries: [
          makeEntry({ id: 'D:\\Work\\Alpha', name: 'Alpha', isContainer: true }),
          makeEntry({ id: 'D:\\Work\\Flemanager', name: 'Flemanager', isContainer: true }),
          makeEntry({ id: 'D:\\Work\\Zeta', name: 'Zeta', isContainer: true }),
          makeEntry({ id: 'D:\\Work\\readme.txt', name: 'readme.txt' })
        ],
        location: 'D:\\Work',
        parentId: 'D:\\'
      })
      await usePanelStore.getState().navigate('left', 'D:\\Work')

      tab = usePanelStore.getState().getActiveTab('left')
      // Flemanager is at index 1 (after sorting: Alpha=0, Flemanager=1, Zeta=2, readme.txt=3)
      // Plus 1 for ".." row = cursor at 2
      expect(tab.cursorIndex).toBe(2)
      // Verify the entry at the cursor position (accounting for ".." offset)
      expect(tab.entries[1].name).toBe('Flemanager')
    })
  })
})
