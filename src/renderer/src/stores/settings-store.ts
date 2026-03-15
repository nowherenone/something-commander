import { create } from 'zustand'

export interface Settings {
  // Display
  fontSize: number
  rowHeight: number
  showHiddenFiles: boolean
  dateFormat: string
  fontFamily: string

  // Operations
  confirmDelete: boolean
  confirmOverwrite: boolean

  // Theme
  theme: 'dark' | 'light'

  // Command line
  shell: string
}

const DEFAULT_SETTINGS: Settings = {
  fontSize: 13,
  rowHeight: 24,
  showHiddenFiles: false,
  dateFormat: 'yyyy-MM-dd HH:mm',
  fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
  confirmDelete: true,
  confirmOverwrite: true,
  theme: 'dark',
  shell: process.platform === 'win32' ? 'powershell' : '/bin/bash'
}

function loadSettings(): Settings {
  try {
    const saved = localStorage.getItem('flemanager-settings')
    if (saved) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) }
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_SETTINGS }
}

interface SettingsState extends Settings {
  updateSettings: (partial: Partial<Settings>) => void
  resetSettings: () => void
}

export const useSettingsStore = create<SettingsState>((set) => ({
  ...loadSettings(),

  updateSettings: (partial) =>
    set((state) => {
      const newSettings = { ...state, ...partial }
      // Persist
      const { updateSettings: _, resetSettings: __, ...toSave } = newSettings
      localStorage.setItem('flemanager-settings', JSON.stringify(toSave))

      // Apply CSS variable overrides
      document.documentElement.style.setProperty('--font-size', `${newSettings.fontSize}px`)
      document.documentElement.style.setProperty('--row-height', `${newSettings.rowHeight}px`)
      document.documentElement.style.setProperty('--font-family', newSettings.fontFamily)

      return partial
    }),

  resetSettings: () =>
    set(() => {
      localStorage.removeItem('flemanager-settings')
      return { ...DEFAULT_SETTINGS }
    })
}))
