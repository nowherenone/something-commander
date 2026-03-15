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

const utilAPI = {
  calcFolderSize: (folderPath: string): Promise<number> =>
    ipcRenderer.invoke(IPC_CHANNELS.CALC_FOLDER_SIZE, folderPath),

  runCommand: (
    command: string,
    cwd: string,
    shell?: string
  ): Promise<{ stdout: string; stderr: string; code: number }> =>
    ipcRenderer.invoke(IPC_CHANNELS.RUN_COMMAND, command, cwd, shell),

  readFileContent: (
    filePath: string,
    maxBytes?: number
  ): Promise<{ content: string; isBinary: boolean; totalSize: number; truncated: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.READ_FILE_CONTENT, filePath, maxBytes),

  searchFiles: (
    rootPath: string,
    pattern: string,
    contentPattern: string,
    maxResults?: number
  ): Promise<Array<{ path: string; name: string; isDirectory: boolean; size: number }>> =>
    ipcRenderer.invoke(IPC_CHANNELS.SEARCH_FILES, rootPath, pattern, contentPattern, maxResults),

  copySingleFile: (sourcePath: string, destPath: string, isDirectory: boolean): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.COPY_SINGLE_FILE, sourcePath, destPath, isDirectory),

  moveSingleFile: (sourcePath: string, destPath: string, isDirectory: boolean): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.MOVE_SINGLE_FILE, sourcePath, destPath, isDirectory),

  deleteSingle: (targetPath: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.DELETE_SINGLE, targetPath),

  checkExists: (filePath: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.CHECK_EXISTS, filePath),

  getFileInfo: (filePath: string): Promise<{ size: number; modifiedAt: number; isDirectory: boolean } | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_FILE_INFO, filePath)
}

const api = {
  plugins: pluginsAPI,
  util: utilAPI
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
