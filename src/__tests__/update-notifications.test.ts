import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runUpdateCheck } from '../renderer/src/utils/update-notifications'
import { showToast } from '../renderer/src/components/layout/Toast'
import { useUpdateStore } from '../renderer/src/stores/update-store'

vi.mock('../renderer/src/components/layout/Toast', () => ({
  showToast: vi.fn()
}))

describe('runUpdateCheck', () => {
  beforeEach(() => {
    vi.mocked(showToast).mockClear()
    useUpdateStore.setState({
      phase: 'idle',
      availableVersion: null,
      downloadPercent: 0,
      lastError: null
    })
    ;(window as any).api = {
      update: {
        checkForUpdates: vi.fn(),
        downloadUpdate: vi.fn().mockResolvedValue({ success: true }),
        quitAndInstall: vi.fn()
      }
    }
  })

  it('never toasts when an update is available — store only', async () => {
    ;(window as any).api.update.checkForUpdates.mockResolvedValue({
      updateAvailable: true,
      version: '0.2.0'
    })

    const res = await runUpdateCheck()
    expect(res.updateAvailable).toBe(true)
    expect(showToast).not.toHaveBeenCalled()
    expect(useUpdateStore.getState().phase).toBe('available')
    expect(useUpdateStore.getState().availableVersion).toBe('0.2.0')
  })

  it('toasts only on manual check when already current', async () => {
    ;(window as any).api.update.checkForUpdates.mockResolvedValue({
      updateAvailable: false
    })

    await runUpdateCheck({ announceCurrent: true })
    expect(showToast).toHaveBeenCalledTimes(1)
    expect(showToast).toHaveBeenCalledWith(
      'You are running the latest version.',
      expect.objectContaining({ variant: 'success' })
    )
  })

  it('stays silent when current on startup (no announceCurrent)', async () => {
    ;(window as any).api.update.checkForUpdates.mockResolvedValue({
      updateAvailable: false
    })

    await runUpdateCheck()
    expect(showToast).not.toHaveBeenCalled()
  })
})
