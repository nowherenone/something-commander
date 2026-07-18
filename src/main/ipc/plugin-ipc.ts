import { ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/types/ipc-channels'
import { pluginManager } from '../plugins/plugin-manager'
import { scanPlugins, loadPlugin, unloadPlugin, ensurePluginsDir } from '../plugins/plugin-loader'
import { extractFromZip, ArchivePlugin, getArchiveFormats } from '../plugins/archive'

/** Thin pass-through registrations between the renderer and the plugin system. */
export function registerPluginIPC(): void {
  ipcMain.handle(IPC_CHANNELS.PLUGIN_LIST, () => pluginManager.listPlugins())

  ipcMain.handle(IPC_CHANNELS.PLUGIN_READ_DIR, (_event, pluginId: string, locationId: string | null) =>
    pluginManager.readDirectory(pluginId, locationId)
  )

  ipcMain.handle(IPC_CHANNELS.PLUGIN_RESOLVE_LOC, (_event, pluginId: string, input: string) =>
    pluginManager.resolveLocation(pluginId, input)
  )

  ipcMain.handle(IPC_CHANNELS.PLUGIN_GET_OPS, (_event, pluginId: string) =>
    pluginManager.getSupportedOperations(pluginId)
  )

  ipcMain.handle(IPC_CHANNELS.PLUGIN_EXEC_OP, (_event, pluginId: string, op) =>
    pluginManager.executeOperation(pluginId, op)
  )

  ipcMain.handle(IPC_CHANNELS.IS_ARCHIVE, (_event, filePath: string) =>
    ArchivePlugin.isArchive(filePath)
  )

  ipcMain.handle(IPC_CHANNELS.ARCHIVE_FORMATS, () => getArchiveFormats())

  ipcMain.handle(
    IPC_CHANNELS.EXTRACT_FROM_ARCHIVE,
    (event, archivePath: string, internalPath: string, destDir: string) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      return extractFromZip(archivePath, internalPath, destDir, (progress) => {
        if (win) win.webContents.send(IPC_CHANNELS.EXTRACT_PROGRESS, progress)
      })
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.ENUMERATE_FILES,
    (_event, pluginId: string, entryIds: string[], destDir: string) =>
      pluginManager.enumerateFiles(pluginId, entryIds, destDir)
  )

  ipcMain.handle(
    IPC_CHANNELS.STREAM_COPY_FILE,
    (
      event,
      sourcePluginId: string,
      sourceEntryId: string,
      destPluginId: string,
      destLocationId: string,
      destFileName: string,
      transferId?: string
    ) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      // Coalesce progress to the next tick so a tight zip-inflate loop cannot
      // flood the renderer, while still delivering mid-copy after each yield.
      let pendingBytes: number | null = null
      let flushScheduled = false
      const sendProgress = (bytesCopied: number): void => {
        pendingBytes = bytesCopied
        if (flushScheduled || !win) return
        flushScheduled = true
        setImmediate(() => {
          flushScheduled = false
          if (pendingBytes !== null && win && !win.isDestroyed()) {
            win.webContents.send(IPC_CHANNELS.COPY_FILE_PROGRESS, pendingBytes)
            pendingBytes = null
          }
        })
      }
      return pluginManager.streamCopyFile(
        sourcePluginId,
        sourceEntryId,
        destPluginId,
        destLocationId,
        destFileName,
        sendProgress,
        transferId
      ).then((result) => {
        // Final flush so the last byte count is never lost after unsub races
        if (pendingBytes !== null && win && !win.isDestroyed()) {
          win.webContents.send(IPC_CHANNELS.COPY_FILE_PROGRESS, pendingBytes)
          pendingBytes = null
        }
        return result
      })
    }
  )

  ipcMain.handle(IPC_CHANNELS.CANCEL_STREAM_COPY, (_event, transferId: string) => {
    pluginManager.cancelStreamCopy(transferId)
  })

  // External plugin management
  ipcMain.handle(IPC_CHANNELS.PLUGIN_SCAN, () => scanPlugins())

  ipcMain.handle(IPC_CHANNELS.PLUGIN_LOAD, (_event, pluginDir: string) => loadPlugin(pluginDir))

  ipcMain.handle(IPC_CHANNELS.PLUGIN_UNLOAD, async (_event, pluginId: string) => {
    await unloadPlugin(pluginId)
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.PLUGIN_GET_DIR, () => ensurePluginsDir())
}
