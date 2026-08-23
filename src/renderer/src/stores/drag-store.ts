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
  /** An OS-level drag (from Finder/Explorer) is hovering the app (F-16). */
  externalDrag: boolean
  /** Folder row currently highlighted as the drop target (F-16). */
  rowDropTargetId: string | null

  startDrag: (
    panelId: PanelId,
    entries: Entry[],
    pluginId: string,
    locationId: string | null
  ) => void
  setDropTarget: (panelId: PanelId | null) => void
  setExternalDrag: (dragging: boolean) => void
  setRowDropTarget: (entryId: string | null) => void
  endDrag: () => void
}

export const useDragStore = create<DragState>((set) => ({
  isDragging: false,
  dragSourcePanelId: null,
  draggedEntries: [],
  dragSourcePluginId: null,
  dragSourceLocationId: null,
  dropTargetPanelId: null,
  externalDrag: false,
  rowDropTargetId: null,

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

  setExternalDrag: (dragging) =>
    set((s) =>
      s.externalDrag === dragging ? s : { externalDrag: dragging }
    ),

  setRowDropTarget: (entryId) =>
    set((s) => (s.rowDropTargetId === entryId ? s : { rowDropTargetId: entryId })),

  endDrag: () =>
    set({
      isDragging: false,
      dragSourcePanelId: null,
      draggedEntries: [],
      dragSourcePluginId: null,
      dragSourceLocationId: null,
      dropTargetPanelId: null,
      externalDrag: false,
      rowDropTargetId: null
    })
}))
