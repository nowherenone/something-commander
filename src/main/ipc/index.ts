import { registerPluginIPC } from './plugin-ipc'
import { registerStoreIPC } from './store-ipc'

export function registerAllIPC(): void {
  registerPluginIPC()
  registerStoreIPC()
}
