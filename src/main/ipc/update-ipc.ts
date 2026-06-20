import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/types/ipc-channels'
import {
  initializeUpdater,
  checkForUpdates,
  downloadUpdate,
  quitAndInstall,
  applyAutoDownload,
  setMainWindow,
  getUpdateStatus
} from '../updater'
import { BrowserWindow } from 'electron'

let updaterInitialized = false

export function registerUpdateIPC() {
  if (updaterInitialized) return
  updaterInitialized = true

  initializeUpdater()

  ipcMain.handle(IPC_CHANNELS.CHECK_FOR_UPDATES, async () => {
    return checkForUpdates()
  })

  ipcMain.handle(IPC_CHANNELS.DOWNLOAD_UPDATE, async () => {
    return downloadUpdate()
  })

  ipcMain.on(IPC_CHANNELS.QUIT_AND_INSTALL, () => {
    quitAndInstall()
  })

  ipcMain.handle(IPC_CHANNELS.GET_UPDATE_STATUS, () => {
    return getUpdateStatus()
  })

  // Allow renderer to control auto-download preference
  ipcMain.on('update:setAutoDownload', (_event, enabled: boolean) => {
    applyAutoDownload(enabled)
  })
}

export function registerMainWindowForUpdates(win: BrowserWindow) {
  setMainWindow(win)
}
