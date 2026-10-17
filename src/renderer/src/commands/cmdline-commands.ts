/**
 * Command-line actions shared by keybindings, the panel keyboard handler and
 * the CommandLine input itself: focus, type-to-command-line, history, and the
 * Total Commander paste helpers (Ctrl+Enter / Ctrl+Shift+Enter / Ctrl+P).
 */
import { detectShellKind, isLocalDirectory, quoteArg, type ShellKind } from '@shared/cmdline'
import type { PlaceholderContext } from '@shared/cmdline-smart'
import { useAppStore } from '../stores/app-store'
import { usePanelStore, parentOffset } from '../stores/panel-store'
import { useSettingsStore } from '../stores/settings-store'
import { useCmdlineStore } from '../stores/cmdline-store'
import type { Entry } from '@shared/types'

export type PanelId = 'left' | 'right'

/** Action ids the CommandLine input handles itself (they also work from the panel). */
export const CMDLINE_INPUT_ACTIONS = new Set([
  'cmdlinePasteName',
  'cmdlinePastePath',
  'cmdlinePasteDir',
  'cmdlineHistory'
])

export function rendererPlatform(): NodeJS.Platform {
  const p = (typeof navigator !== 'undefined' && navigator.platform) || ''
  if (p.startsWith('Win')) return 'win32'
  if (p.startsWith('Mac')) return 'darwin'
  return 'linux'
}

/**
 * Quoting style for the shell commands will run in: the Settings override
 * when set, else what main resolved for "auto" ($SHELL / pwsh), else the
 * platform guess.
 */
export function currentShellKind(): ShellKind {
  const override = useSettingsStore.getState().shell.trim()
  if (override) return detectShellKind(override, rendererPlatform())
  return useCmdlineStore.getState().resolvedShellKind ?? detectShellKind('', rendererPlatform())
}

/** Ask main which shell "auto" means (once per session). */
let shellProbe: Promise<void> | null = null
export function probeShellKind(): Promise<void> {
  if (!shellProbe) {
    shellProbe = (async () => {
      try {
        const info = await window.api.cmd?.shellInfo()
        if (info) useCmdlineStore.setState({ resolvedShellKind: info.kind })
      } catch {
        /* keep the platform guess */
      }
    })()
  }
  return shellProbe
}

function entryPath(tab: ReturnType<typeof activeTab>, entry: Entry): string {
  return isLocalDirectory(tab.pluginId, tab.locationId) ? entry.id : joinDisplay(tab.locationDisplay, entry.name)
}

function panelPath(tab: ReturnType<typeof activeTab>): string | null {
  if (isLocalDirectory(tab.pluginId, tab.locationId)) return tab.locationId
  return tab.locationDisplay || null
}

/** Values for %f %F %s %p %P from the current panels. */
export function placeholderContext(): PlaceholderContext {
  const ap = useAppStore.getState().activePanel
  const store = usePanelStore.getState()
  const tab = store.getActiveTab(ap)
  const other = store.getActiveTab(ap === 'left' ? 'right' : 'left')
  const cur = cursorEntry()
  const selected = tab.entries.filter((e) => tab.selectedEntryIds.has(e.id))
  const paths = (selected.length > 0 ? selected : cur ? [cur] : []).map((e) => entryPath(tab, e))
  return {
    cursorName: cur?.name ?? null,
    selectedPaths: paths,
    panelPath: panelPath(tab),
    otherPanelPath: panelPath(other)
  }
}

/** Selected entries of the active panel (for "run per selected file"). */
export function selectedEntries(): Entry[] {
  const tab = activeTab()
  return tab.entries.filter((e) => tab.selectedEntryIds.has(e.id))
}

/** Placeholder context for one file of a per-file run. */
export function perFileContext(entry: Entry): PlaceholderContext {
  const base = placeholderContext()
  return { ...base, cursorName: entry.name, selectedPaths: [entryPath(activeTab(), entry)] }
}

function activeTab(): ReturnType<ReturnType<typeof usePanelStore.getState>['getActiveTab']> {
  return usePanelStore.getState().getActiveTab(useAppStore.getState().activePanel)
}

function cursorEntry(): Entry | null {
  const tab = activeTab()
  const idx = tab.cursorIndex - parentOffset(tab)
  return idx >= 0 && idx < tab.entries.length ? tab.entries[idx] : null
}

/** Show the bar if hidden; returns true when it was hidden. */
function ensureVisible(): boolean {
  const s = useSettingsStore.getState()
  if (s.showCommandLine) return false
  s.updateSettings({ showCommandLine: true })
  return true
}

function joinDisplay(dir: string, name: string): string {
  if (!dir) return name
  const sep = rendererPlatform() === 'win32' && !dir.includes('://') ? '\\' : '/'
  return dir.endsWith('/') || dir.endsWith('\\') ? dir + name : dir + sep + name
}

/** The text the paste helpers insert, already quoted for the active shell. */
export function pasteText(kind: 'name' | 'path' | 'dir'): string | null {
  const tab = activeTab()
  const local = isLocalDirectory(tab.pluginId, tab.locationId)
  const q = (s: string): string => quoteArg(s, currentShellKind())
  if (kind === 'dir') {
    const dir = local ? tab.locationId! : tab.locationDisplay
    return dir ? q(dir) : null
  }
  const entry = cursorEntry()
  if (!entry) return null
  if (kind === 'name') return q(entry.name)
  return q(local ? entry.id : joinDisplay(tab.locationDisplay, entry.name))
}

function paste(kind: 'name' | 'path' | 'dir'): void {
  const text = pasteText(kind)
  if (!text) return
  ensureVisible()
  useCmdlineStore.getState().post({ type: 'insert', text })
}

export function focusCommandLine(): void {
  ensureVisible()
  useCmdlineStore.getState().post({ type: 'focus' })
}

export function openCommandHistory(): void {
  ensureVisible()
  useCmdlineStore.getState().post({ type: 'history' })
}

export const pasteCursorName = (): void => paste('name')
export const pasteCursorPath = (): void => paste('path')
export const pasteCurrentDir = (): void => paste('dir')

/**
 * Type-to-command-line: a printable key pressed in the panel. Only applies
 * when the bar is visible. Returns true when the key was consumed.
 */
export function typeIntoCommandLine(ch: string): boolean {
  if (!useSettingsStore.getState().showCommandLine) return false
  useCmdlineStore.getState().post({ type: 'insert', text: ch, raw: true })
  return true
}

/**
 * Whether a panel keydown should go to the command line: one printable
 * character, no Ctrl/Alt/Meta. AltGr (reported as Ctrl+Alt on Windows) still
 * types, so "@" or "\" on European layouts work.
 */
export function isTypeToCmdlineKey(e: KeyboardEvent): boolean {
  if (e.key.length !== 1 || e.isComposing) return false
  if (e.metaKey) return false
  const altGr = typeof e.getModifierState === 'function' && e.getModifierState('AltGraph')
  if ((e.ctrlKey || e.altKey) && !altGr) return false
  return true
}

/** Registered via App's registerCommands. */
export const cmdlineCommands = {
  focusCommandLine,
  cmdlinePasteName: pasteCursorName,
  cmdlinePastePath: pasteCursorPath,
  cmdlinePasteDir: pasteCurrentDir,
  cmdlineHistory: openCommandHistory
}

// ── Previous location per panel, for `cd -` ────────────────────────────────

export interface PanelLocation {
  pluginId: string
  locationId: string | null
}

const previous: Record<PanelId, PanelLocation | null> = { left: null, right: null }
const current: Record<PanelId, PanelLocation | null> = { left: null, right: null }
let tracking = false

function snapshot(panel: PanelId): PanelLocation {
  const tab = usePanelStore.getState().getActiveTab(panel)
  return { pluginId: tab.pluginId, locationId: tab.locationId }
}

/** Track each panel's last location so `cd -` can return to it. Idempotent. */
export function installLocationTracking(): void {
  if (tracking) return
  tracking = true
  for (const p of ['left', 'right'] as const) current[p] = snapshot(p)
  usePanelStore.subscribe(() => {
    for (const p of ['left', 'right'] as const) {
      const now = snapshot(p)
      const was = current[p]
      if (!was || was.pluginId !== now.pluginId || was.locationId !== now.locationId) {
        if (was && was.locationId !== null) previous[p] = was
        current[p] = now
      }
    }
  })
}

export function previousLocation(panel: PanelId): PanelLocation | null {
  return previous[panel]
}
