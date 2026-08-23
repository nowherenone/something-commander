import { useAppStore, type PanelId, type PanelViewMode } from './app-store'
import { usePanelStore, parentOffset } from './panel-store'
import type { SortField } from '../utils/sort'

/**
 * Session layout persistence (UX plan F-11/F-12). One `layout` blob in the
 * store IPC covers everything the plan asks to survive a relaunch:
 *   - splitRatio and per-panel view modes,
 *   - every tab per panel with its plugin, directory, sort order, and cursor.
 * Window bounds live separately in the main process (`window-state.ts`).
 *
 * Landing (F-12): a panel with nothing restorable opens on $HOME instead of
 * the Filesystems roots page — roots stay reachable through the drive menu.
 */

const LAYOUT_KEY = 'layout'
/** Upper bound so a corrupted blob can't spawn unbounded tabs. */
const MAX_RESTORE_TABS = 8

interface SavedTab {
  pluginId: string
  locationId: string | null
  cursorIndex: number
  sortField: SortField
  sortDirection: 'asc' | 'desc'
}

interface SavedPanel {
  tabs: SavedTab[]
  activeTabIndex: number
}

export interface SavedLayout {
  splitRatio: number
  leftViewMode: PanelViewMode
  rightViewMode: PanelViewMode
  panels: Record<PanelId, SavedPanel>
}

/** Depth of in-flight restores — suppresses save subscriptions while > 0. */
let restoringDepth = 0

function isPanelViewMode(v: unknown): v is PanelViewMode {
  return v === 'brief' || v === 'tree' || v === 'info' || v === 'quickview'
}

function sanitizeLayout(raw: unknown): SavedLayout | null {
  if (!raw || typeof raw !== 'object') return null
  const l = raw as Partial<SavedLayout>
  if (!l.panels || typeof l.panels !== 'object') return null
  const sanitizePanel = (p: unknown): SavedPanel | null => {
    if (!p || typeof p !== 'object') return null
    const tabs = Array.isArray((p as SavedPanel).tabs)
      ? (p as SavedPanel).tabs.filter(
          (t): t is SavedTab =>
            !!t && typeof t === 'object' && typeof (t as SavedTab).pluginId === 'string'
        )
      : []
    if (tabs.length === 0) return null
    return { tabs: tabs.slice(0, MAX_RESTORE_TABS), activeTabIndex: Number((p as SavedPanel).activeTabIndex) || 0 }
  }
  const left = sanitizePanel(l.panels.left)
  const right = sanitizePanel(l.panels.right)
  if (!left || !right) return null
  return {
    splitRatio: typeof l.splitRatio === 'number' ? Math.min(0.85, Math.max(0.15, l.splitRatio)) : 0.5,
    leftViewMode: isPanelViewMode(l.leftViewMode) ? l.leftViewMode : 'brief',
    rightViewMode: isPanelViewMode(l.rightViewMode) ? l.rightViewMode : 'brief',
    panels: { left, right }
  }
}

function captureLayout(): SavedLayout {
  const app = useAppStore.getState()
  const panel = usePanelStore.getState()
  const capturePanel = (id: PanelId): SavedPanel => {
    const slice = panel[id]
    return {
      tabs: slice.tabs.map((t) => ({
        pluginId: t.pluginId,
        locationId: t.locationId,
        cursorIndex: t.cursorIndex,
        sortField: t.sortConfig.field,
        sortDirection: t.sortConfig.direction
      })),
      activeTabIndex: Math.max(
        0,
        slice.tabs.findIndex((t) => t.id === slice.activeTabId)
      )
    }
  }
  return {
    splitRatio: app.splitRatio,
    leftViewMode: app.leftViewMode,
    rightViewMode: app.rightViewMode,
    panels: { left: capturePanel('left'), right: capturePanel('right') }
  }
}

/**
 * Live-save the layout on every panel/app change (debounced — dragging the
 * splitter or walking the cursor fires hundreds of updates).
 */
export function initLayoutPersistence(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  const schedule = (): void => {
    if (restoringDepth > 0) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      void window.api.store.set(LAYOUT_KEY, captureLayout())
    }, 600)
  }
  const unsubPanel = usePanelStore.subscribe(schedule)
  const unsubApp = useAppStore.subscribe(schedule)
  return () => {
    unsubPanel()
    unsubApp()
    if (timer) clearTimeout(timer)
  }
}

/** Navigate to $HOME (F-12); falls back to the roots page if IPC fails. */
export async function navigateHome(panelId: PanelId): Promise<void> {
  let home: string | null = null
  try {
    home = await window.api.util.getHomeDir()
  } catch {
    home = null
  }
  await usePanelStore.getState().navigateWithPlugin(panelId, 'local-filesystem', home)
}

/** Restore one panel's tabs from the saved layout. Returns true when restored. */
async function restoreSavedPanel(panelId: PanelId, saved: SavedPanel): Promise<boolean> {
  const store = usePanelStore.getState()
  const tabIds: string[] = [store.getActiveTab(panelId).id]

  for (let i = 1; i < saved.tabs.length; i++) {
    store.addTab(panelId)
    tabIds.push(usePanelStore.getState().getActiveTab(panelId).id)
  }

  let firstTabFailed = false
  for (let i = 0; i < tabIds.length; i++) {
    const t = saved.tabs[i]
    usePanelStore.getState().switchTab(panelId, tabIds[i])

    // Sort must be set before navigating — the listing builds with it.
    if (t.sortField === 'name' || t.sortField === 'extension' || t.sortField === 'size' || t.sortField === 'modifiedAt') {
      usePanelStore.getState().setSort(panelId, { field: t.sortField, direction: t.sortDirection })
    }

    // Skip dead locations quietly (deleted folder, disconnected host) rather
    // than booting into error toasts. exists() stats on plugins without it.
    let alive = true
    if (t.locationId !== null) {
      try {
        alive = await window.api.plugins.exists(t.pluginId, t.locationId)
      } catch {
        alive = false
      }
    }

    if (!alive) {
      if (i === 0) {
        firstTabFailed = true
        continue // fall back below; keep later tabs working
      }
      usePanelStore.getState().closeTab(panelId, tabIds[i])
      continue
    }

    await usePanelStore.getState().navigateWithPlugin(panelId, t.pluginId, t.locationId)

    // Restore the cursor onto the reloaded listing (clamped to what loaded).
    const tab = usePanelStore.getState().getActiveTab(panelId)
    if (tab.id === tabIds[i]) {
      const maxIdx = tab.entries.length - 1 + parentOffset(tab)
      usePanelStore.getState().setCursor(panelId, Math.min(Math.max(0, t.cursorIndex), Math.max(0, maxIdx)))
    }
  }

  const finalTabs = usePanelStore.getState()[panelId].tabs
  if (finalTabs.length > 0) {
    const idx = Math.min(Math.max(0, saved.activeTabIndex), finalTabs.length - 1)
    usePanelStore.getState().switchTab(panelId, finalTabs[idx].id)
  }
  return !firstTabFailed
}

/**
 * Restore one panel at boot: saved layout → legacy single-location blob →
 * HOME landing (F-12). Called from FilePanel's mount effect (one call per
 * panel), replacing the old panel-{id}-state-only restore.
 */
export async function restorePanelLocation(panelId: PanelId): Promise<void> {
  restoringDepth++
  try {
    const [layoutRaw, legacyState, legacyLocation] = await Promise.all([
      window.api.store.get(LAYOUT_KEY),
      window.api.store.get(`panel-${panelId}-state`),
      window.api.store.get(`panel-${panelId}-location`)
    ])

    const layout = sanitizeLayout(layoutRaw)
    if (layout && (await restoreSavedPanel(panelId, layout.panels[panelId]))) {
      return
    }

    // Legacy fallback: exactly the pre-F-11 behavior, but landing on HOME
    // instead of the roots page when nothing was ever saved (F-12).
    const state = legacyState as { pluginId?: string; locationId?: string } | null
    const pluginId = state?.pluginId || 'local-filesystem'
    const locationId = state?.locationId || (legacyLocation as string | null) || null
    if (locationId) {
      await usePanelStore.getState().navigateWithPlugin(panelId, pluginId, locationId)
    } else {
      await navigateHome(panelId)
    }
  } finally {
    restoringDepth--
  }
}

/**
 * Restore chrome (splitRatio + view modes) once at App boot. Returns true
 * when a saved layout was applied.
 */
export async function restoreLayoutChrome(): Promise<boolean> {
  const raw = await window.api.store.get(LAYOUT_KEY)
  const layout = sanitizeLayout(raw)
  if (!layout) return false
  const app = useAppStore.getState()
  app.setSplitRatio(layout.splitRatio)
  app.setViewMode('left', layout.leftViewMode)
  app.setViewMode('right', layout.rightViewMode)
  return true
}
