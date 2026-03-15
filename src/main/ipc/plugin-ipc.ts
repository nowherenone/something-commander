import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/types/ipc-channels'
import { pluginManager } from '../plugins/plugin-manager'

export function registerPluginIPC(): void {
  ipcMain.handle(IPC_CHANNELS.PLUGIN_LIST, () => {
    return pluginManager.listPlugins()
  })

  ipcMain.handle(IPC_CHANNELS.PLUGIN_READ_DIR, (_event, pluginId: string, locationId: string | null) => {
    return pluginManager.readDirectory(pluginId, locationId)
  })

  ipcMain.handle(IPC_CHANNELS.PLUGIN_RESOLVE_LOC, (_event, pluginId: string, input: string) => {
    return pluginManager.resolveLocation(pluginId, input)
  })

  ipcMain.handle(IPC_CHANNELS.PLUGIN_GET_OPS, (_event, pluginId: string) => {
    return pluginManager.getSupportedOperations(pluginId)
  })

  ipcMain.handle(IPC_CHANNELS.PLUGIN_EXEC_OP, (_event, pluginId: string, op) => {
    return pluginManager.executeOperation(pluginId, op)
  })
}
