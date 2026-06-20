import { create } from 'zustand'

export interface OverlayEntry {
  id: string
  onEscape: () => void
}

interface OverlayState {
  overlays: OverlayEntry[]
  push: (entry: OverlayEntry) => void
  pop: () => void
  dismissTop: () => void
  isTop: (id: string) => boolean
  clear: () => void
}

export const useOverlayStore = create<OverlayState>((set, get) => ({
  overlays: [],

  push: (entry) =>
    set((s) => ({
      overlays: [...s.overlays.filter((o) => o.id !== entry.id), entry]
    })),

  pop: () =>
    set((s) => ({
      overlays: s.overlays.slice(0, -1)
    })),

  dismissTop: () => {
    const top = get().overlays[get().overlays.length - 1]
    if (top) {
      top.onEscape()
      get().pop()
    }
  },

  isTop: (id) => {
    const o = get().overlays
    return o.length > 0 && o[o.length - 1].id === id
  },

  clear: () => set({ overlays: [] })
}))
