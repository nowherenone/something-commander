import { describe, it, expect, vi, beforeEach } from 'vitest'
import { notifyUpdateCheckResult } from '../renderer/src/utils/update-notifications'
import { showToast } from '../renderer/src/components/layout/Toast'

vi.mock('../renderer/src/components/layout/Toast', () => ({
  showToast: vi.fn()
}))

describe('update-notifications', () => {
  beforeEach(() => {
    vi.mocked(showToast).mockClear()
  })

  it('shows one toast when an update is available', () => {
    notifyUpdateCheckResult({ updateAvailable: true, version: '0.2.0' })
    expect(showToast).toHaveBeenCalledTimes(1)
    expect(showToast).toHaveBeenCalledWith('Update 0.2.0 is available.', 8000)
  })

  it('shows one toast when already on latest', () => {
    notifyUpdateCheckResult({ updateAvailable: false })
    expect(showToast).toHaveBeenCalledTimes(1)
    expect(showToast).toHaveBeenCalledWith('You are running the latest version.', 6000)
  })

  it('shows one toast on check error', () => {
    notifyUpdateCheckResult({ error: 'network timeout' })
    expect(showToast).toHaveBeenCalledTimes(1)
    expect(showToast).toHaveBeenCalledWith('Update check failed: network timeout', 10000)
  })
})