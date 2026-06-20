import { autoUpdater } from 'electron-updater'
import { BrowserWindow } from 'electron'
import { is } from '@electron-toolkit/utils'

// Basic console logging (electron-updater can also log to file if desired)

let mainWindow: BrowserWindow | null = null
let updateStatus: { type: string; data?: any } = { type: 'idle' }

export function setMainWindow(win: BrowserWindow) {
  mainWindow = win
}

function sendStatus(status: { type: string; data?: any }) {
  updateStatus = status
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update:status', status)
  }
}

export function getUpdateStatus() {
  return updateStatus
}

export function initializeUpdater() {
  // In development we can use a local feed for testing
  // Production uses the publish config from electron-builder.yml (GitHub recommended)
  if (is.dev) {
    // For dev testing, users can create dev-app-update.yml
    // autoUpdater.updateConfigPath = path.join(app.getAppPath(), 'dev-app-update.yml')
    console.log('[Updater] Dev mode - auto update disabled by default (use check manually)')
  }

  // Configure behavior
  autoUpdater.autoDownload = false // we control it based on settings
  autoUpdater.autoInstallOnAppQuit = true

  // Events
  autoUpdater.on('checking-for-update', () => {
    sendStatus({ type: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    sendStatus({ type: 'available', data: { version: info.version, releaseNotes: info.releaseNotes } })
  })

  autoUpdater.on('update-not-available', () => {
    sendStatus({ type: 'not-available' })
  })

  autoUpdater.on('error', (err) => {
    sendStatus({ type: 'error', data: err.message || String(err) })
  })

  autoUpdater.on('download-progress', (progress) => {
    sendStatus({
      type: 'download-progress',
      data: {
        percent: progress.percent,
        transferred: progress.transferred,
        total: progress.total
      }
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    sendStatus({ type: 'downloaded', data: { version: info.version } })
  })
}

export async function checkForUpdates(): Promise<{ updateAvailable: boolean; version?: string; error?: string }> {
  if (is.dev) {
    // Simulate in dev
    return { updateAvailable: false, version: undefined }
  }

  try {
    const result = await autoUpdater.checkForUpdates()
    if (result && result.updateInfo) {
      return { updateAvailable: true, version: result.updateInfo.version }
    }
    return { updateAvailable: false }
  } catch (err: any) {
    sendStatus({ type: 'error', data: err.message })
    return { updateAvailable: false, error: err.message }
  }
}

export async function downloadUpdate(): Promise<{ success: boolean; error?: string }> {
  try {
    await autoUpdater.downloadUpdate()
    return { success: true }
  } catch (err: any) {
    sendStatus({ type: 'error', data: err.message })
    return { success: false, error: err.message }
  }
}

export function quitAndInstall(): void {
  // This will quit and install on next launch
  autoUpdater.quitAndInstall(false, true)
}

// Helper to apply user preference for auto-download
export function applyAutoDownload(enabled: boolean) {
  autoUpdater.autoDownload = enabled
}
