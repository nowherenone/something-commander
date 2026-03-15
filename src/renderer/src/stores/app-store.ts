import { create } from 'zustand'

export type PanelId = 'left' | 'right'

interface AppState {
  activePanel: PanelId
  splitRatio: number
  driveMenuOpen: PanelId | null

  setActivePanel: (id: PanelId) => void
  toggleActivePanel: () => void
  setSplitRatio: (ratio: number) => void
  openDriveMenu: (panelId: PanelId) => void
  closeDriveMenu: () => void
}

export const useAppStore = create<AppState>((set) => ({
  activePanel: 'left',
  splitRatio: 0.5,
  driveMenuOpen: null,

  setActivePanel: (id) => set({ activePanel: id }),
  toggleActivePanel: () =>
    set((s) => ({ activePanel: s.activePanel === 'left' ? 'right' : 'left' })),
  setSplitRatio: (ratio) => set({ splitRatio: Math.max(0.15, Math.min(0.85, ratio)) }),
  openDriveMenu: (panelId) => set({ driveMenuOpen: panelId }),
  closeDriveMenu: () => set({ driveMenuOpen: null })
}))
