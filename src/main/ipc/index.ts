import { registerPluginIPC } from './plugin-ipc'
import { registerStoreIPC } from './store-ipc'
import { registerViewerIPC } from './viewer-ipc'
import { registerConnectionIPC } from './connection-ipc'
import { registerSystemIPC } from './system-ipc'
import { registerFsIPC } from './fs-ipc'
import { registerSearchIPC } from './search-ipc'
import { registerUpdateIPC, registerMainWindowForUpdates } from './update-ipc'
import { BrowserWindow } from 'electron'

export function registerAllIPC(): void {
  registerPluginIPC()
  registerStoreIPC()
  registerViewerIPC()
  registerConnectionIPC()
  registerSystemIPC()
  registerFsIPC()
  registerSearchIPC()
  registerUpdateIPC()
}

export function registerWindowForUpdater(win: BrowserWindow) {
  registerMainWindowForUpdates(win)
}
