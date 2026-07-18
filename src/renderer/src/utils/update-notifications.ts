import { useUpdateStore } from '../stores/update-store'
import { showToast } from '../components/layout/Toast'

export interface UpdateCheckResult {
  updateAvailable?: boolean
  version?: string
  error?: string
}

export interface NotifyUpdateOptions {
  /**
   * Manual check: tell the user when already on latest.
   * Startup checks stay silent (badge only if update exists).
   */
  announceCurrent?: boolean
  /**
   * When true, pre-download in the background after an update is found
   * (badge switches to “ready to restart”). Never shows an “available” toast.
   */
  autoDownload?: boolean
}

/**
 * Run an update check. New versions surface only via the menu-bar badge —
 * never as a toast. Optional toast only for manual “you’re current” / hard errors.
 */
export async function runUpdateCheck(opts: NotifyUpdateOptions = {}): Promise<UpdateCheckResult> {
  const res = await useUpdateStore.getState().checkForUpdates({
    autoDownload: opts.autoDownload
  })

  if (res.updateAvailable) {
    // Badge only — no toast
    return res
  }

  if (res.error) {
    if (opts.announceCurrent) {
      showToast(`Update check failed: ${res.error}`, {
        duration: 8000,
        variant: 'error',
        dedupeKey: 'app-update-error'
      })
    }
    return res
  }

  if (opts.announceCurrent) {
    showToast('You are running the latest version.', {
      duration: 3500,
      variant: 'success',
      dedupeKey: 'app-update-current'
    })
  }
  return res
}

/** @deprecated Use runUpdateCheck — kept for any leftover imports. */
export function notifyUpdateCheckResult(
  res: UpdateCheckResult,
  opts: { silentIfCurrent?: boolean; willAutoDownload?: boolean } = {}
): void {
  if (res.updateAvailable) {
    useUpdateStore.getState().setPhase('available', {
      availableVersion: res.version ?? null
    })
    return
  }
  if (res.error) {
    if (!opts.silentIfCurrent) {
      showToast(`Update check failed: ${res.error}`, {
        duration: 8000,
        variant: 'error'
      })
    }
    return
  }
  if (!opts.silentIfCurrent) {
    showToast('You are running the latest version.', {
      duration: 3500,
      variant: 'success'
    })
  }
}

/** @deprecated Prefer update-store installAndRestart / checkForUpdates. */
export async function downloadUpdateWithNotify(
  downloadUpdate: () => Promise<{ success: boolean; error?: string }>,
  opts: { announceStart?: boolean } = {}
): Promise<void> {
  void opts
  useUpdateStore.getState().setPhase('downloading', { downloadPercent: 0 })
  const result = await downloadUpdate()
  if (!result.success) {
    useUpdateStore.getState().setPhase('available', {
      lastError: result.error || 'Download failed'
    })
    showToast(`Update download failed: ${result.error || 'unknown error'}`, {
      duration: 10000,
      variant: 'error',
      dedupeKey: 'app-update-error'
    })
    return
  }
  useUpdateStore.getState().setPhase('ready', { downloadPercent: 100 })
}
