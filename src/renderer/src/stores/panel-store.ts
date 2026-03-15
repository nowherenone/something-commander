import { create } from 'zustand'
import type { Entry, ColumnDefinition } from '@shared/types'
import { sortEntries, type SortConfig } from '../utils/sort'

const DEFAULT_PLUGIN = 'local-filesystem'

let tabIdCounter = 0
function nextTabId(): string {
  return `tab-${++tabIdCounter}`
}

export interface TabState {
  id: string
  pluginId: string
  locationId: string | null
  locationDisplay: string
  entries: Entry[]
  parentId: string | null
  extraColumns: ColumnDefinition[]
  selectedEntryIds: Set<string>
  calculatingFolderIds: Set<string>
  cursorIndex: number
  sortConfig: SortConfig
  showHidden: boolean
  isLoading: boolean
  error: string | null
}

function createInitialTab(): TabState {
  return {
    id: nextTabId(),
    pluginId: DEFAULT_PLUGIN,
    locationId: null,
    locationDisplay: '',
    entries: [],
    parentId: null,
    extraColumns: [],
    selectedEntryIds: new Set(),
    calculatingFolderIds: new Set(),
    cursorIndex: 0,
    sortConfig: { field: 'name', direction: 'asc' },
    showHidden: false,
    isLoading: false,
    error: null
  }
}

interface PanelSlice {
  tabs: TabState[]
  activeTabId: string
}

function createInitialPanel(): PanelSlice {
  const tab = createInitialTab()
  return {
    tabs: [tab],
    activeTabId: tab.id
  }
}

function getActiveTab(panel: PanelSlice): TabState {
  return panel.tabs.find((t) => t.id === panel.activeTabId) || panel.tabs[0]
}

function updateTab(panel: PanelSlice, tabId: string, updater: (tab: TabState) => TabState): PanelSlice {
  return {
    ...panel,
    tabs: panel.tabs.map((t) => (t.id === tabId ? updater(t) : t))
  }
}

interface PanelStoreState {
  left: PanelSlice
  right: PanelSlice

  // Tab management
  addTab: (panelId: 'left' | 'right') => void
  closeTab: (panelId: 'left' | 'right', tabId: string) => void
  switchTab: (panelId: 'left' | 'right', tabId: string) => void

  // Navigation & data
  navigate: (panelId: 'left' | 'right', locationId: string | null) => Promise<void>
  refresh: (panelId: 'left' | 'right') => Promise<void>
  setSort: (panelId: 'left' | 'right', config: SortConfig) => void
  toggleHidden: (panelId: 'left' | 'right') => void
  setCursor: (panelId: 'left' | 'right', index: number) => void

  // Selection
  toggleSelect: (panelId: 'left' | 'right', entryId: string) => void
  spaceSelect: (panelId: 'left' | 'right', entryIndex: number) => void
  updateEntrySize: (panelId: 'left' | 'right', entryId: string, size: number) => void
  cancelFolderCalculations: (panelId: 'left' | 'right') => void
  selectRange: (panelId: 'left' | 'right', from: number, to: number) => void
  selectAll: (panelId: 'left' | 'right') => void
  deselectAll: (panelId: 'left' | 'right') => void
  invertSelection: (panelId: 'left' | 'right') => void

  // Helpers
  getActiveTab: (panelId: 'left' | 'right') => TabState
}

export const usePanelStore = create<PanelStoreState>((set, get) => ({
  left: createInitialPanel(),
  right: createInitialPanel(),

  getActiveTab: (panelId) => getActiveTab(get()[panelId]),

  addTab: (panelId) => {
    const panel = get()[panelId]
    const currentTab = getActiveTab(panel)
    const newTab: TabState = {
      ...createInitialTab(),
      pluginId: currentTab.pluginId,
      locationId: currentTab.locationId,
      locationDisplay: currentTab.locationDisplay,
      entries: currentTab.entries,
      parentId: currentTab.parentId,
      sortConfig: currentTab.sortConfig,
      showHidden: currentTab.showHidden
    }
    set({
      [panelId]: {
        tabs: [...panel.tabs, newTab],
        activeTabId: newTab.id
      }
    })
  },

  closeTab: (panelId, tabId) => {
    const panel = get()[panelId]
    if (panel.tabs.length <= 1) return
    const newTabs = panel.tabs.filter((t) => t.id !== tabId)
    const newActiveId =
      panel.activeTabId === tabId
        ? newTabs[Math.max(0, panel.tabs.findIndex((t) => t.id === tabId) - 1)].id
        : panel.activeTabId
    set({
      [panelId]: {
        tabs: newTabs,
        activeTabId: newActiveId
      }
    })
  },

  switchTab: (panelId, tabId) => {
    set({
      [panelId]: {
        ...get()[panelId],
        activeTabId: tabId
      }
    })
  },

  navigate: async (panelId, locationId) => {
    const panel = get()[panelId]
    const tab = getActiveTab(panel)
    const previousLocationId = tab.locationId

    set({ [panelId]: updateTab(panel, tab.id, (t) => ({ ...t, isLoading: true, error: null })) })

    try {
      const result = await window.api.plugins.readDirectory(tab.pluginId, locationId)
      let entries = result.entries

      const currentTab = getActiveTab(get()[panelId])
      if (!currentTab.showHidden) {
        entries = entries.filter((e) => !e.attributes.hidden)
      }
      entries = sortEntries(entries, currentTab.sortConfig)

      // When going up, place cursor on the folder we came from
      let cursorIndex = 0
      if (previousLocationId) {
        const hasParentRow = result.parentId !== null
        const offset = hasParentRow ? 1 : 0 // account for ".." row
        const prevIdx = entries.findIndex((e) => e.id === previousLocationId)
        if (prevIdx >= 0) {
          cursorIndex = prevIdx + offset
        }
      }

      set({
        [panelId]: updateTab(get()[panelId], tab.id, (t) => ({
          ...t,
          locationId,
          locationDisplay: result.location,
          entries,
          parentId: result.parentId,
          extraColumns: result.extraColumns || [],
          selectedEntryIds: new Set(),
          calculatingFolderIds: new Set(),
          cursorIndex,
          isLoading: false,
          error: null
        }))
      })

      localStorage.setItem(`panel-${panelId}-location`, locationId || '')
    } catch (err) {
      set({
        [panelId]: updateTab(get()[panelId], tab.id, (t) => ({
          ...t,
          isLoading: false,
          error: String(err)
        }))
      })
    }
  },

  refresh: async (panelId) => {
    const tab = getActiveTab(get()[panelId])
    await get().navigate(panelId, tab.locationId)
  },

  setSort: (panelId, config) => {
    const panel = get()[panelId]
    const tab = getActiveTab(panel)
    const entries = sortEntries(tab.entries, config)
    set({ [panelId]: updateTab(panel, tab.id, (t) => ({ ...t, sortConfig: config, entries })) })
  },

  toggleHidden: (panelId) => {
    const panel = get()[panelId]
    const tab = getActiveTab(panel)
    set({
      [panelId]: updateTab(panel, tab.id, (t) => ({ ...t, showHidden: !t.showHidden }))
    })
    get().refresh(panelId)
  },

  setCursor: (panelId, index) => {
    const panel = get()[panelId]
    const tab = getActiveTab(panel)
    const maxIdx = tab.entries.length - 1 + (tab.parentId !== null ? 1 : 0)
    const clamped = Math.max(0, Math.min(index, maxIdx))
    set({ [panelId]: updateTab(panel, tab.id, (t) => ({ ...t, cursorIndex: clamped })) })
  },

  toggleSelect: (panelId, entryId) => {
    const panel = get()[panelId]
    const tab = getActiveTab(panel)
    const newSet = new Set(tab.selectedEntryIds)
    if (newSet.has(entryId)) {
      newSet.delete(entryId)
    } else {
      newSet.add(entryId)
    }
    set({ [panelId]: updateTab(panel, tab.id, (t) => ({ ...t, selectedEntryIds: newSet })) })
  },

  spaceSelect: (panelId, entryIndex) => {
    const panel = get()[panelId]
    const tab = getActiveTab(panel)
    if (entryIndex < 0 || entryIndex >= tab.entries.length) return
    const entry = tab.entries[entryIndex]

    const newSet = new Set(tab.selectedEntryIds)
    const wasSelected = newSet.has(entry.id)
    if (wasSelected) {
      newSet.delete(entry.id)
    } else {
      newSet.add(entry.id)
    }

    // Don't advance cursor on Space
    set({
      [panelId]: updateTab(panel, tab.id, (t) => ({
        ...t,
        selectedEntryIds: newSet
      }))
    })

    // Calculate folder size when selecting a container
    if (!wasSelected && entry.isContainer) {
      // Mark as calculating
      const calcSet = new Set(get()[panelId] ? getActiveTab(get()[panelId]).calculatingFolderIds : [])
      calcSet.add(entry.id)
      set({
        [panelId]: updateTab(get()[panelId], tab.id, (t) => ({
          ...t,
          calculatingFolderIds: new Set(calcSet)
        }))
      })

      window.api.util.calcFolderSize(entry.id).then((size) => {
        // Only update if still calculating (not cancelled)
        const currentTab = getActiveTab(get()[panelId])
        if (currentTab.calculatingFolderIds.has(entry.id)) {
          const newCalc = new Set(currentTab.calculatingFolderIds)
          newCalc.delete(entry.id)
          set({
            [panelId]: updateTab(get()[panelId], tab.id, (t) => ({
              ...t,
              entries: t.entries.map((e) => (e.id === entry.id ? { ...e, size } : e)),
              calculatingFolderIds: newCalc
            }))
          })
        }
      })
    }
  },

  updateEntrySize: (panelId, entryId, size) => {
    const panel = get()[panelId]
    const tab = getActiveTab(panel)
    set({
      [panelId]: updateTab(panel, tab.id, (t) => ({
        ...t,
        entries: t.entries.map((e) => (e.id === entryId ? { ...e, size } : e))
      }))
    })
  },

  cancelFolderCalculations: (panelId) => {
    const panel = get()[panelId]
    const tab = getActiveTab(panel)
    set({
      [panelId]: updateTab(panel, tab.id, (t) => ({
        ...t,
        calculatingFolderIds: new Set()
      }))
    })
  },

  selectRange: (panelId, from, to) => {
    const panel = get()[panelId]
    const tab = getActiveTab(panel)
    const newSet = new Set(tab.selectedEntryIds)
    const start = Math.min(from, to)
    const end = Math.max(from, to)
    for (let i = start; i <= end; i++) {
      if (tab.entries[i]) newSet.add(tab.entries[i].id)
    }
    set({ [panelId]: updateTab(panel, tab.id, (t) => ({ ...t, selectedEntryIds: newSet })) })
  },

  selectAll: (panelId) => {
    const panel = get()[panelId]
    const tab = getActiveTab(panel)
    const newSet = new Set(tab.entries.map((e) => e.id))
    set({ [panelId]: updateTab(panel, tab.id, (t) => ({ ...t, selectedEntryIds: newSet })) })
  },

  deselectAll: (panelId) => {
    const panel = get()[panelId]
    const tab = getActiveTab(panel)
    set({
      [panelId]: updateTab(panel, tab.id, (t) => ({ ...t, selectedEntryIds: new Set() }))
    })
  },

  invertSelection: (panelId) => {
    const panel = get()[panelId]
    const tab = getActiveTab(panel)
    const newSet = new Set<string>()
    for (const entry of tab.entries) {
      if (!tab.selectedEntryIds.has(entry.id)) {
        newSet.add(entry.id)
      }
    }
    set({ [panelId]: updateTab(panel, tab.id, (t) => ({ ...t, selectedEntryIds: newSet })) })
  }
}))
