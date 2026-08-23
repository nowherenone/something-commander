/**
 * Layout persistence (UX plan F-11/F-12): saved tabs/directories/cursor
 * restore, dead-location fallback to $HOME, and debounced live saving.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  initLayoutPersistence,
  restorePanelLocation,
  navigateHome
} from '../renderer/src/stores/layout-persistence'
import { usePanelStore } from '../renderer/src/stores/panel-store'
import { useAppStore } from '../renderer/src/stores/app-store'

const api = (window as unknown as { api: { store: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> }; util: { getHomeDir: ReturnType<typeof vi.fn> }; plugins: { exists: ReturnType<typeof vi.fn> } } }).api

function resetStores(): void {
  usePanelStore.setState({
    left: usePanelStore.getState().left,
    right: usePanelStore.getState().right
  })
}

describe('layout persistence (F-11/F-12)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.store.get.mockResolvedValue(null)
    api.plugins.exists.mockResolvedValue(true)
    resetStores()
  })

  it('restores saved tabs with location and clamped cursor', async () => {
    api.store.get.mockImplementation(async (key: string) => {
      if (key !== 'layout') return null
      return {
        splitRatio: 0.4,
        leftViewMode: 'brief',
        rightViewMode: 'tree',
        panels: {
          left: {
            activeTabIndex: 0,
            tabs: [
              {
                pluginId: 'local-filesystem',
                locationId: '/tmp/projects',
                cursorIndex: 99,
                sortField: 'name',
                sortDirection: 'asc'
              }
            ]
          },
          right: {
            activeTabIndex: 0,
            tabs: [
              {
                pluginId: 'local-filesystem',
                locationId: '/tmp/other',
                cursorIndex: 0,
                sortField: 'name',
                sortDirection: 'asc'
              }
            ]
          }
        }
      }
    })

    await restorePanelLocation('left')
    const tab = usePanelStore.getState().getActiveTab('left')
    expect(tab.locationId).toBe('/tmp/projects')
    // Cursor clamps to the loaded listing (empty mock listing + '..' row → 0)
    expect(tab.cursorIndex).toBe(0)
  })

  it('falls back to $HOME when the saved location is dead (F-12)', async () => {
    api.store.get.mockImplementation(async (key: string) => {
      if (key !== 'layout') return null
      return {
        splitRatio: 0.5,
        leftViewMode: 'brief',
        rightViewMode: 'brief',
        panels: {
          left: {
            activeTabIndex: 0,
            tabs: [
              {
                pluginId: 'local-filesystem',
                locationId: '/deleted/dir',
                cursorIndex: 0,
                sortField: 'name',
                sortDirection: 'asc'
              }
            ]
          },
          right: {
            activeTabIndex: 0,
            tabs: [
              { pluginId: 'local-filesystem', locationId: '/', cursorIndex: 0, sortField: 'name', sortDirection: 'asc' }
            ]
          }
        }
      }
    })
    api.plugins.exists.mockResolvedValue(false)

    await restorePanelLocation('left')
    const tab = usePanelStore.getState().getActiveTab('left')
    expect(api.util.getHomeDir).toHaveBeenCalled()
    expect(tab.locationId).toBe('/home/test')
  })

  it('lands on $HOME when nothing was ever saved (F-12 first run)', async () => {
    api.store.get.mockResolvedValue(null)
    await restorePanelLocation('right')
    expect(usePanelStore.getState().getActiveTab('right').locationId).toBe('/home/test')
  })

  it('navigateHome falls back to roots page when IPC fails', async () => {
    api.util.getHomeDir.mockRejectedValue(new Error('ipc down'))
    await navigateHome('left')
    expect(usePanelStore.getState().getActiveTab('left').locationId).toBeNull()
  })

  it('live-saves a debounced layout snapshot on panel changes', async () => {
    vi.useFakeTimers()
    const unsub = initLayoutPersistence()
    try {
      useAppStore.getState().setSplitRatio(0.3)
      await vi.advanceTimersByTimeAsync(700)
      expect(api.store.set).toHaveBeenCalledTimes(1)
      const [key, payload] = api.store.set.mock.calls[0]
      expect(key).toBe('layout')
      expect(payload.splitRatio).toBe(0.3)
      expect(payload.panels.left.tabs.length).toBeGreaterThan(0)
    } finally {
      unsub()
      vi.useRealTimers()
    }
  })

  it('does not save while a restore is in flight', async () => {
    // Restore reads a layout whose location exists; while awaiting navigation,
    // no save may be scheduled even though panel state changes.
    let resolveExists: ((v: boolean) => void) | undefined
    api.plugins.exists.mockImplementation(
      () => new Promise<boolean>((res) => { resolveExists = res })
    )
    api.store.get.mockImplementation(async (key: string) => {
      if (key !== 'layout') return null
      return {
        splitRatio: 0.5,
        leftViewMode: 'brief',
        rightViewMode: 'brief',
        panels: {
          left: {
            activeTabIndex: 0,
            tabs: [{ pluginId: 'local-filesystem', locationId: '/x', cursorIndex: 0, sortField: 'name', sortDirection: 'asc' }]
          },
          right: {
            activeTabIndex: 0,
            tabs: [{ pluginId: 'local-filesystem', locationId: '/', cursorIndex: 0, sortField: 'name', sortDirection: 'asc' }]
          }
        }
      }
    })

    vi.useFakeTimers()
    const unsub = initLayoutPersistence()
    try {
      const pending = restorePanelLocation('left')
      useAppStore.getState().setSplitRatio(0.3)
      await vi.advanceTimersByTimeAsync(700)
      expect(api.store.set).not.toHaveBeenCalled()
      resolveExists?.(true)
      await pending
    } finally {
      unsub()
      vi.useRealTimers()
    }
  })
})
