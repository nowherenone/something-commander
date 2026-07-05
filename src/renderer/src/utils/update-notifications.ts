import { showToast } from '../components/layout/Toast'

export interface UpdateCheckResult {
  updateAvailable?: boolean
  version?: string
  error?: string
}

/** Show a single user-facing toast for a manual or startup update check. */
export function notifyUpdateCheckResult(res: UpdateCheckResult): void {
  if (res.updateAvailable) {
    showToast(`Update ${res.version} is available.`, 8000)
    return
  }
  if (res.error) {
    showToast(`Update check failed: ${res.error}`, 10000)
    return
  }
  showToast('You are running the latest version.', 6000)
}

export async function downloadUpdateWithNotify(
  downloadUpdate: () => Promise<{ success: boolean; error?: string }>
): Promise<void> {
  showToast('Downloading update...', 5000)
  const result = await downloadUpdate()
  if (!result.success) {
    showToast(`Update download failed: ${result.error || 'unknown error'}`, 10000)
  }
}