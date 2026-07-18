/**
 * Drives shipped update-store helpers (badge visibility + titles) and
 * install flow against mocked window.api.update.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  useUpdateStore,
  updateBadgeTitle,
  updateBadgeVisible
} from '../renderer/src/stores/update-store'

describe('update badge helpers', () => {
  it('hides badge when idle/checking', () => {
    expect(updateBadgeVisible('idle')).toBe(false)
    expect(updateBadgeVisible('checking')).toBe(false)
  })

  it('shows badge for available / downloading / ready / error', () => {
    expect(updateBadgeVisible('available')).toBe(true)
    expect(updateBadgeVisible('downloading')).toBe(true)
    expect(updateBadgeVisible('ready')).toBe(true)
    expect(updateBadgeVisible('error')).toBe(true)
  })

  it('titles explain click-to-install or restart', () => {
    expect(
      updateBadgeTitle({
        phase: 'available',
        availableVersion: '0.2.0',
        downloadPercent: 0,
        lastError: null
      })
    ).toMatch(/Update 0\.2\.0 available/i)

    expect(
      updateBadgeTitle({
        phase: 'ready',
        availableVersion: '0.2.0',
        downloadPercent: 100,
        lastError: null
      })
    ).toMatch(/click to restart/i)
  })
})

describe('useUpdateStore (shipped)', () => {
  beforeEach(() => {
    useUpdateStore.setState({
      phase: 'idle',
      availableVersion: null,
      downloadPercent: 0,
      lastError: null
    })
  })

  it('setFromStatus maps available and downloaded without toasts', () => {
    useUpdateStore.getState().setFromStatus({
      type: 'available',
      data: { version: '1.2.3' }
    })
    expect(useUpdateStore.getState().phase).toBe('available')
    expect(useUpdateStore.getState().availableVersion).toBe('1.2.3')

    useUpdateStore.getState().setFromStatus({
      type: 'downloaded',
      data: { version: '1.2.3' }
    })
    expect(useUpdateStore.getState().phase).toBe('ready')
  })

  it('installAndRestart downloads then quitAndInstall when available', async () => {
    const downloadUpdate = vi.fn().mockResolvedValue({ success: true })
    const quitAndInstall = vi.fn()
    ;(window as any).api = {
      update: {
        checkForUpdates: vi.fn(),
        downloadUpdate,
        quitAndInstall
      }
    }

    useUpdateStore.setState({
      phase: 'available',
      availableVersion: '9.9.9',
      downloadPercent: 0,
      lastError: null
    })

    await useUpdateStore.getState().installAndRestart()

    expect(downloadUpdate).toHaveBeenCalledTimes(1)
    expect(quitAndInstall).toHaveBeenCalledTimes(1)
    expect(useUpdateStore.getState().phase).toBe('ready')
  })

  it('installAndRestart only restarts when already ready', async () => {
    const downloadUpdate = vi.fn()
    const quitAndInstall = vi.fn()
    ;(window as any).api = {
      update: { downloadUpdate, quitAndInstall }
    }

    useUpdateStore.setState({
      phase: 'ready',
      availableVersion: '9.9.9',
      downloadPercent: 100,
      lastError: null
    })

    await useUpdateStore.getState().installAndRestart()

    expect(downloadUpdate).not.toHaveBeenCalled()
    expect(quitAndInstall).toHaveBeenCalledTimes(1)
  })
})
