import { create } from 'zustand'

export type BottomBarMode = 'fnkeys' | 'status' | 'none'

export interface Settings {
  // Display
  fontSize: number
  rowHeight: number
  showHiddenFiles: boolean
  dateFormat: string
  fontFamily: string

  // Layout
  bottomBar: BottomBarMode
  showCommandLine: boolean

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
  bottomBar: 'fnkeys',
  showCommandLine: false,
  confirmDelete: true,
  confirmOverwrite: true,
  theme: 'dark',
  shell: navigator.platform?.startsWith('Win') ? 'powershell' : '/bin/bash'
}

interface SettingsState extends Settings {
  updateSettings: (partial: Partial<Settings>) => void
  resetSettings: () => void
}

export const useSettingsStore = create<SettingsState>((set) => ({
  ...DEFAULT_SETTINGS,

  updateSettings: (partial) =>
    set((state) => {
      const newSettings = { ...state, ...partial }
      const { updateSettings: _, resetSettings: __, ...toSave } = newSettings
      window.api.store.set('settings', toSave)

      document.documentElement.style.setProperty('--font-size', `${newSettings.fontSize}px`)
      document.documentElement.style.setProperty('--row-height', `${newSettings.rowHeight}px`)
      document.documentElement.style.setProperty('--font-family', newSettings.fontFamily)
      document.documentElement.setAttribute('data-theme', newSettings.theme)

      return partial
    }),

  resetSettings: () =>
    set(() => {
      window.api.store.set('settings', DEFAULT_SETTINGS)
      return { ...DEFAULT_SETTINGS }
    })
}))

/** Called once on app startup. Loads from disk; migrates localStorage data if no disk file yet. */
export async function loadSettings(): Promise<void> {
  const diskData = await window.api.store.get('settings') as Partial<Settings> | null
  if (diskData && typeof diskData === 'object') {
    const merged = { ...DEFAULT_SETTINGS, ...diskData }
    useSettingsStore.setState(merged)
    // Re-apply CSS/theme from loaded settings
    document.documentElement.style.setProperty('--font-size', `${merged.fontSize}px`)
    document.documentElement.style.setProperty('--row-height', `${merged.rowHeight}px`)
    document.documentElement.style.setProperty('--font-family', merged.fontFamily)
    document.documentElement.setAttribute('data-theme', merged.theme)
    return
  }
  // One-time migration from localStorage
  try {
    const lsRaw = localStorage.getItem('flemanager-settings')
    if (lsRaw) {
      const parsed = JSON.parse(lsRaw) as Partial<Settings>
      const merged = { ...DEFAULT_SETTINGS, ...parsed }
      useSettingsStore.setState(merged)
      await window.api.store.set('settings', merged)
      localStorage.removeItem('flemanager-settings')
    }
  } catch { /* ignore */ }
}
