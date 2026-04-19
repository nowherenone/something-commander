import { registerPluginIPC } from './plugin-ipc'
import { registerStoreIPC } from './store-ipc'
import { registerViewerIPC } from './viewer-ipc'
import { registerConnectionIPC } from './connection-ipc'
import { registerSystemIPC } from './system-ipc'
import { registerFsIPC } from './fs-ipc'
import { registerSearchIPC } from './search-ipc'

export function registerAllIPC(): void {
  registerPluginIPC()
  registerStoreIPC()
  registerViewerIPC()
  registerConnectionIPC()
  registerSystemIPC()
  registerFsIPC()
  registerSearchIPC()
}
