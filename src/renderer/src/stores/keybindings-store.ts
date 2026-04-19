import { create } from 'zustand'

export interface Keybinding {
  key: string
  ctrl?: boolean
  alt?: boolean
  shift?: boolean
  action: string
}

const DEFAULT_KEYBINDINGS: Keybinding[] = [
  // Navigation primitives (handled inline in useKeyboard, listed here for docs/settings UI).
  { key: 'Tab', action: 'switchPanel' },
  { key: 'Enter', action: 'activate' },
  { key: 'Backspace', action: 'goUp' },
  { key: ' ', action: 'spaceSelect' },
  { key: 'Insert', action: 'insertSelect' },
  { key: 'Home', action: 'cursorHome' },
  { key: 'End', action: 'cursorEnd' },
  { key: 'PageUp', action: 'pageUp' },
  { key: 'PageDown', action: 'pageDown' },
  { key: 'Escape', action: 'cancel' },
  // Function-key commands — dispatched via the command registry.
  { key: 'F3', action: 'view' },
  { key: 'F4', action: 'edit' },
  { key: 'F5', action: 'copy' },
  { key: 'F5', alt: true, action: 'pack' },
  { key: 'F6', action: 'move' },
  { key: 'F7', action: 'mkdir' },
  { key: 'F7', alt: true, action: 'search' },
  { key: 'F8', action: 'delete' },
  { key: 'Delete', action: 'delete' },
  { key: 'F9', action: 'settings' },
  { key: 'F9', alt: true, action: 'unpack' },
  { key: 'F1', alt: true, action: 'driveMenuLeft' },
  { key: 'F2', alt: true, action: 'driveMenuRight' },
  // Ctrl-letter commands.
  { key: 'a', ctrl: true, action: 'selectAll' },
  { key: 'd', ctrl: true, action: 'driveMenu' },
  { key: 'd', ctrl: true, shift: true, action: 'deselectAll' },
  { key: 'i', ctrl: true, action: 'invertSelection' },
  { key: 't', ctrl: true, action: 'newTab' },
  { key: 'w', ctrl: true, action: 'closeTab' },
  { key: 'h', ctrl: true, action: 'toggleHidden' },
  { key: 'r', ctrl: true, action: 'refresh' },
  { key: 'm', ctrl: true, action: 'multiRename' },
  { key: 'c', ctrl: true, action: 'compare' },
  { key: 'l', ctrl: true, action: 'focusAddressBar' },
  { key: '1', ctrl: true, action: 'viewBrief' },
  { key: '2', ctrl: true, action: 'viewTree' },
  { key: '3', ctrl: true, action: 'viewInfo' },
  { key: 'q', ctrl: true, action: 'viewQuickview' }
]

interface KeybindingsState {
  bindings: Keybinding[]
  updateBinding: (index: number, binding: Keybinding) => void
  resetBindings: () => void
  /** Return the action id whose binding matches the event, or null. */
  matchAction: (e: KeyboardEvent) => string | null
}

function loadBindings(): Keybinding[] {
  try {
    const saved = localStorage.getItem('flemanager-keybindings')
    if (saved) return JSON.parse(saved)
  } catch { /* ignore */ }
  return [...DEFAULT_KEYBINDINGS]
}

function matchBinding(bindings: Keybinding[], e: KeyboardEvent): string | null {
  // Single-char keys compare case-insensitively so Shift+letter combos match
  // lowercase bindings ("D" with shiftKey → binding key "d").
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
  for (const b of bindings) {
    if (
      k === b.key &&
      !!e.ctrlKey === !!b.ctrl &&
      !!e.altKey === !!b.alt &&
      !!e.shiftKey === !!b.shift
    ) {
      return b.action
    }
  }
  return null
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

  matchAction: (e) => matchBinding(get().bindings, e)
}))

export { DEFAULT_KEYBINDINGS }
