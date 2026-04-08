import { create } from 'zustand'
import type { Entry } from '@shared/types'
import type { PanelId } from './app-store'

interface DragState {
  isDragging: boolean
  dragSourcePanelId: PanelId | null
  draggedEntries: Entry[]
  dragSourcePluginId: string | null
  dragSourceLocationId: string | null
  dropTargetPanelId: PanelId | null

  startDrag: (
    panelId: PanelId,
    entries: Entry[],
    pluginId: string,
    locationId: string | null
  ) => void
  setDropTarget: (panelId: PanelId | null) => void
  endDrag: () => void
}

export const useDragStore = create<DragState>((set) => ({
  isDragging: false,
  dragSourcePanelId: null,
  draggedEntries: [],
  dragSourcePluginId: null,
  dragSourceLocationId: null,
  dropTargetPanelId: null,

  startDrag: (panelId, entries, pluginId, locationId) =>
    set({
      isDragging: true,
      dragSourcePanelId: panelId,
      draggedEntries: entries,
      dragSourcePluginId: pluginId,
      dragSourceLocationId: locationId,
      dropTargetPanelId: null
    }),

  setDropTarget: (panelId) => set({ dropTargetPanelId: panelId }),

  endDrag: () =>
    set({
      isDragging: false,
      dragSourcePanelId: null,
      draggedEntries: [],
      dragSourcePluginId: null,
      dragSourceLocationId: null,
      dropTargetPanelId: null
    })
}))
