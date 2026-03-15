import { create } from 'zustand'
import type { Entry, ColumnDefinition } from '@shared/types'
import { sortEntries, type SortConfig } from '../utils/sort'

const DEFAULT_PLUGIN = 'local-filesystem'

interface PanelSlice {
  pluginId: string
  locationId: string | null
  locationDisplay: string
  entries: Entry[]
  parentId: string | null
  extraColumns: ColumnDefinition[]
  selectedEntryIds: Set<string>
  cursorIndex: number
  sortConfig: SortConfig
  showHidden: boolean
  isLoading: boolean
  error: string | null
}

function createInitialSlice(): PanelSlice {
  return {
    pluginId: DEFAULT_PLUGIN,
    locationId: null,
    locationDisplay: '',
    entries: [],
    parentId: null,
    extraColumns: [],
    selectedEntryIds: new Set(),
    cursorIndex: 0,
    sortConfig: { field: 'name', direction: 'asc' },
    showHidden: false,
    isLoading: false,
    error: null
  }
}

interface PanelStoreState {
  left: PanelSlice
  right: PanelSlice

  navigate: (panelId: 'left' | 'right', locationId: string | null) => Promise<void>
  refresh: (panelId: 'left' | 'right') => Promise<void>
  setSort: (panelId: 'left' | 'right', config: SortConfig) => void
  toggleHidden: (panelId: 'left' | 'right') => void
  setCursor: (panelId: 'left' | 'right', index: number) => void
  toggleSelect: (panelId: 'left' | 'right', entryId: string) => void
  selectRange: (panelId: 'left' | 'right', from: number, to: number) => void
  selectAll: (panelId: 'left' | 'right') => void
  deselectAll: (panelId: 'left' | 'right') => void
  invertSelection: (panelId: 'left' | 'right') => void
}

export const usePanelStore = create<PanelStoreState>((set, get) => ({
  left: createInitialSlice(),
  right: createInitialSlice(),

  navigate: async (panelId, locationId) => {
    const state = get()
    const panel = state[panelId]

    set({ [panelId]: { ...panel, isLoading: true, error: null } })

    try {
      const result = await window.api.plugins.readDirectory(panel.pluginId, locationId)
      let entries = result.entries

      // Filter hidden if needed
      const showHidden = get()[panelId].showHidden
      if (!showHidden) {
        entries = entries.filter((e) => !e.attributes.hidden)
      }

      // Sort
      entries = sortEntries(entries, panel.sortConfig)

      set({
        [panelId]: {
          ...get()[panelId],
          locationId,
          locationDisplay: result.location,
          entries,
          parentId: result.parentId,
          extraColumns: result.extraColumns || [],
          selectedEntryIds: new Set(),
          cursorIndex: 0,
          isLoading: false,
          error: null
        }
      })

      // Persist last location
      localStorage.setItem(`panel-${panelId}-location`, locationId || '')
      localStorage.setItem(`panel-${panelId}-plugin`, panel.pluginId)
    } catch (err) {
      set({
        [panelId]: {
          ...get()[panelId],
          isLoading: false,
          error: String(err)
        }
      })
    }
  },

  refresh: async (panelId) => {
    const panel = get()[panelId]
    await get().navigate(panelId, panel.locationId)
  },

  setSort: (panelId, config) => {
    const panel = get()[panelId]
    const entries = sortEntries(panel.entries, config)
    set({ [panelId]: { ...panel, sortConfig: config, entries } })
  },

  toggleHidden: (panelId) => {
    const panel = get()[panelId]
    set({ [panelId]: { ...panel, showHidden: !panel.showHidden } })
    get().refresh(panelId)
  },

  setCursor: (panelId, index) => {
    const panel = get()[panelId]
    const clamped = Math.max(0, Math.min(index, panel.entries.length - 1))
    set({ [panelId]: { ...panel, cursorIndex: clamped } })
  },

  toggleSelect: (panelId, entryId) => {
    const panel = get()[panelId]
    const newSet = new Set(panel.selectedEntryIds)
    if (newSet.has(entryId)) {
      newSet.delete(entryId)
    } else {
      newSet.add(entryId)
    }
    set({ [panelId]: { ...panel, selectedEntryIds: newSet } })
  },

  selectRange: (panelId, from, to) => {
    const panel = get()[panelId]
    const newSet = new Set(panel.selectedEntryIds)
    const start = Math.min(from, to)
    const end = Math.max(from, to)
    for (let i = start; i <= end; i++) {
      if (panel.entries[i]) {
        newSet.add(panel.entries[i].id)
      }
    }
    set({ [panelId]: { ...panel, selectedEntryIds: newSet } })
  },

  selectAll: (panelId) => {
    const panel = get()[panelId]
    const newSet = new Set(panel.entries.filter((e) => !e.isContainer).map((e) => e.id))
    set({ [panelId]: { ...panel, selectedEntryIds: newSet } })
  },

  deselectAll: (panelId) => {
    const panel = get()[panelId]
    set({ [panelId]: { ...panel, selectedEntryIds: new Set() } })
  },

  invertSelection: (panelId) => {
    const panel = get()[panelId]
    const newSet = new Set<string>()
    for (const entry of panel.entries) {
      if (!entry.isContainer && !panel.selectedEntryIds.has(entry.id)) {
        newSet.add(entry.id)
      }
    }
    set({ [panelId]: { ...panel, selectedEntryIds: newSet } })
  }
}))
