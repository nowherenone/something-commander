import { create } from 'zustand'

export type PanelId = 'left' | 'right'

interface AppState {
  activePanel: PanelId
  splitRatio: number

  setActivePanel: (id: PanelId) => void
  toggleActivePanel: () => void
  setSplitRatio: (ratio: number) => void
}

export const useAppStore = create<AppState>((set) => ({
  activePanel: 'left',
  splitRatio: 0.5,

  setActivePanel: (id) => set({ activePanel: id }),
  toggleActivePanel: () =>
    set((s) => ({ activePanel: s.activePanel === 'left' ? 'right' : 'left' })),
  setSplitRatio: (ratio) => set({ splitRatio: Math.max(0.15, Math.min(0.85, ratio)) })
}))
