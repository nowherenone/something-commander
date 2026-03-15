import { create } from 'zustand'

export interface Keybinding {
  key: string
  ctrl?: boolean
  alt?: boolean
  shift?: boolean
  action: string
}

const DEFAULT_KEYBINDINGS: Keybinding[] = [
  { key: 'Tab', action: 'switchPanel' },
  { key: 'Enter', action: 'activate' },
  { key: 'Backspace', action: 'goUp' },
  { key: ' ', action: 'spaceSelect' },
  { key: 'Insert', action: 'insertSelect' },
  { key: 'Home', action: 'cursorHome' },
  { key: 'End', action: 'cursorEnd' },
  { key: 'PageUp', action: 'pageUp' },
  { key: 'PageDown', action: 'pageDown' },
  { key: 'F3', action: 'viewFile' },
  { key: 'F5', action: 'copy' },
  { key: 'F6', action: 'move' },
  { key: 'F7', action: 'mkdir' },
  { key: 'F8', action: 'delete' },
  { key: 'Delete', action: 'delete' },
  { key: 'F9', action: 'settings' },
  { key: 'F7', alt: true, action: 'search' },
  { key: 'a', ctrl: true, action: 'selectAll' },
  { key: 'd', ctrl: true, action: 'deselectAll' },
  { key: 'i', ctrl: true, action: 'invertSelection' },
  { key: 't', ctrl: true, action: 'newTab' },
  { key: 'w', ctrl: true, action: 'closeTab' },
  { key: 'h', ctrl: true, action: 'toggleHidden' },
  { key: 'r', ctrl: true, action: 'refresh' },
  { key: 'm', ctrl: true, action: 'multiRename' },
  { key: 'l', ctrl: true, action: 'focusAddressBar' },
  { key: 'Escape', action: 'cancel' },
  { key: 'c', ctrl: true, action: 'compareDirectories' }
]

interface KeybindingsState {
  bindings: Keybinding[]
  updateBinding: (index: number, binding: Keybinding) => void
  resetBindings: () => void
  matchAction: (e: KeyboardEvent) => string | null
}

function loadBindings(): Keybinding[] {
  try {
    const saved = localStorage.getItem('flemanager-keybindings')
    if (saved) return JSON.parse(saved)
  } catch { /* ignore */ }
  return [...DEFAULT_KEYBINDINGS]
}

export const useKeybindingsStore = create<KeybindingsState>((set, get) => ({
  bindings: loadBindings(),

  updateBinding: (index, binding) => {
    set((s) => {
      const newBindings = [...s.bindings]
      newBindings[index] = binding
      localStorage.setItem('flemanager-keybindings', JSON.stringify(newBindings))
      return { bindings: newBindings }
    })
  },

  resetBindings: () => {
    localStorage.removeItem('flemanager-keybindings')
    set({ bindings: [...DEFAULT_KEYBINDINGS] })
  },

  matchAction: (e: KeyboardEvent) => {
    const bindings = get().bindings
    for (const b of bindings) {
      if (
        e.key === b.key &&
        !!e.ctrlKey === !!b.ctrl &&
        !!e.altKey === !!b.alt &&
        !!e.shiftKey === !!b.shift
      ) {
        return b.action
      }
    }
    // Also match lowercase for ctrl combos
    if (e.ctrlKey) {
      for (const b of bindings) {
        if (
          b.ctrl &&
          e.key.toLowerCase() === b.key &&
          !!e.altKey === !!b.alt &&
          !e.shiftKey
        ) {
          return b.action
        }
      }
    }
    return null
  }
}))

export { DEFAULT_KEYBINDINGS }
