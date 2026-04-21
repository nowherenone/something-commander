import { create } from 'zustand'

export type BottomBarMode = 'fnkeys' | 'status' | 'none'
export type SizeFormat = 'full' | 'short'
export type ThemeName = 'dark' | 'light' | 'classic' | 'monokai'

/**
 * Custom color overrides layered on top of the active theme. Keys are CSS
 * variable names (including the leading `--`). Only keys listed in
 * COLOR_OVERRIDE_KEYS are user-facing; other variables stay managed by the
 * theme sheet.
 */
export type ColorOverrides = Partial<Record<ColorOverrideKey, string>>

export const COLOR_OVERRIDE_KEYS = [
  '--bg-primary',
  '--bg-secondary',
  '--bg-panel',
  '--text-primary',
  '--text-secondary',
  '--bg-cursor',
  '--bg-selected',
  '--accent',
  '--border-color'
] as const
export type ColorOverrideKey = (typeof COLOR_OVERRIDE_KEYS)[number]

export interface ColorOverrideMeta {
  key: ColorOverrideKey
  label: string
}

/** UI labels for each overridable variable, in a sensible display order. */
export const COLOR_OVERRIDE_META: readonly ColorOverrideMeta[] = [
  { key: '--bg-primary', label: 'Background' },
  { key: '--bg-secondary', label: 'Secondary background' },
  { key: '--bg-panel', label: 'Panel background' },
  { key: '--text-primary', label: 'Text' },
  { key: '--text-secondary', label: 'Secondary text' },
  { key: '--bg-cursor', label: 'Cursor' },
  { key: '--bg-selected', label: 'Selection' },
  { key: '--accent', label: 'Accent' },
  { key: '--border-color', label: 'Border' }
]

export interface Settings {
  // Display
  fontSize: number
  rowHeight: number
  showHiddenFiles: boolean
  dateFormat: string
  fontFamily: string
  sizeFormat: SizeFormat

  // Layout
  bottomBar: BottomBarMode
  showCommandLine: boolean

  // Operations
  confirmDelete: boolean
  confirmOverwrite: boolean

  // Theme
  theme: ThemeName
  colorOverrides: ColorOverrides

  // Command line
  shell: string
}

const DEFAULT_SETTINGS: Settings = {
  fontSize: 13,
  rowHeight: 24,
  showHiddenFiles: false,
  dateFormat: 'yyyy-MM-dd HH:mm',
  fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
  sizeFormat: 'full',
  bottomBar: 'fnkeys',
  showCommandLine: false,
  confirmDelete: true,
  confirmOverwrite: true,
  theme: 'monokai',
  colorOverrides: {},
  shell: navigator.platform?.startsWith('Win') ? 'powershell' : '/bin/bash'
}

interface SettingsState extends Settings {
  updateSettings: (partial: Partial<Settings>) => void
  resetSettings: () => void
  setColorOverride: (key: ColorOverrideKey, value: string | null) => void
  resetColorOverrides: () => void
}

/**
 * Apply the full color override set to the document. Any variable in
 * COLOR_OVERRIDE_KEYS that isn't in `overrides` gets removed so the theme
 * sheet takes over again — this lets a "reset" actually revert.
 */
function applyColorOverrides(overrides: ColorOverrides): void {
  const root = document.documentElement
  for (const key of COLOR_OVERRIDE_KEYS) {
    const value = overrides[key]
    if (value) root.style.setProperty(key, value)
    else root.style.removeProperty(key)
  }
}

function applyDisplaySettings(s: Settings): void {
  const root = document.documentElement
  root.style.setProperty('--font-size', `${s.fontSize}px`)
  root.style.setProperty('--row-height', `${s.rowHeight}px`)
  root.style.setProperty('--font-family', s.fontFamily)
  root.setAttribute('data-theme', s.theme)
  applyColorOverrides(s.colorOverrides)
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...DEFAULT_SETTINGS,

  updateSettings: (partial) =>
    set((state) => {
      const newSettings = { ...state, ...partial }
      const { updateSettings: _, resetSettings: __, setColorOverride: ___, resetColorOverrides: ____, ...toSave } = newSettings
      window.api.store.set('settings', toSave)
      applyDisplaySettings(newSettings)
      return partial
    }),

  resetSettings: () =>
    set(() => {
      window.api.store.set('settings', DEFAULT_SETTINGS)
      applyDisplaySettings(DEFAULT_SETTINGS)
      return { ...DEFAULT_SETTINGS }
    }),

  setColorOverride: (key, value) => {
    const current = get().colorOverrides
    const next: ColorOverrides = { ...current }
    if (value) next[key] = value
    else delete next[key]
    get().updateSettings({ colorOverrides: next })
  },

  resetColorOverrides: () => get().updateSettings({ colorOverrides: {} })
}))

/** Called once on app startup. Loads from disk; migrates localStorage data if no disk file yet. */
export async function loadSettings(): Promise<void> {
  const diskData = await window.api.store.get('settings') as Partial<Settings> | null
  if (diskData && typeof diskData === 'object') {
    const merged = { ...DEFAULT_SETTINGS, ...diskData, colorOverrides: { ...DEFAULT_SETTINGS.colorOverrides, ...diskData.colorOverrides } }
    useSettingsStore.setState(merged)
    applyDisplaySettings(merged)
    return
  }
  // One-time migration from localStorage
  try {
    const lsRaw = localStorage.getItem('flemanager-settings')
    if (lsRaw) {
      const parsed = JSON.parse(lsRaw) as Partial<Settings>
      const merged = { ...DEFAULT_SETTINGS, ...parsed, colorOverrides: { ...DEFAULT_SETTINGS.colorOverrides, ...parsed.colorOverrides } }
      useSettingsStore.setState(merged)
      applyDisplaySettings(merged)
      await window.api.store.set('settings', merged)
      localStorage.removeItem('flemanager-settings')
    }
  } catch { /* ignore */ }
}
