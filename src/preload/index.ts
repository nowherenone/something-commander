import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC_CHANNELS } from '../shared/types/ipc-channels'

const pluginsAPI = {
  list: () => ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_LIST),

  readDirectory: (pluginId: string, locationId: string | null) =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_READ_DIR, pluginId, locationId),

  resolveLocation: (pluginId: string, input: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_RESOLVE_LOC, pluginId, input),

  getSupportedOperations: (pluginId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_GET_OPS, pluginId),

  executeOperation: (pluginId: string, op: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_EXEC_OP, pluginId, op),

  onOperationProgress: (callback: (data: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown): void => callback(data)
    ipcRenderer.on(IPC_CHANNELS.OP_PROGRESS, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.OP_PROGRESS, handler)
  },

  onOperationComplete: (callback: (operationId: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, operationId: string): void =>
      callback(operationId)
    ipcRenderer.on(IPC_CHANNELS.OP_COMPLETE, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.OP_COMPLETE, handler)
  },

  onOperationError: (callback: (data: { operationId: string; error: string }) => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { operationId: string; error: string }
    ): void => callback(data)
    ipcRenderer.on(IPC_CHANNELS.OP_ERROR, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.OP_ERROR, handler)
  }
}

const api = {
  plugins: pluginsAPI
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
