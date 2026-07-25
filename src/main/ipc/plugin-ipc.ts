import { ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/types/ipc-channels'
import { pluginManager } from '../plugins/plugin-manager'
import { scanPlugins, loadPlugin, unloadPlugin, ensurePluginsDir } from '../plugins/plugin-loader'
import { ArchivePlugin, getArchiveFormats } from '../plugins/archive'

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

  ipcMain.handle(IPC_CHANNELS.PLUGIN_EXISTS, (_event, pluginId: string, entryId: string) =>
    pluginManager.exists(pluginId, entryId)
  )

  ipcMain.handle(IPC_CHANNELS.PLUGIN_STAT, (_event, pluginId: string, entryId: string) =>
    pluginManager.statEntry(pluginId, entryId)
  )

  ipcMain.handle(IPC_CHANNELS.PLUGIN_GET_SIZE, (_event, pluginId: string, entryId: string) =>
    pluginManager.getSize(pluginId, entryId).catch(() => 0)
  )

  ipcMain.handle(IPC_CHANNELS.IS_ARCHIVE, (_event, filePath: string) =>
    ArchivePlugin.isArchive(filePath)
  )

  ipcMain.handle(IPC_CHANNELS.ARCHIVE_FORMATS, () => getArchiveFormats())

  /**
   * Thin shim: bulk unpack → archive plugin executeOperation(copy).
   * Kept for any remaining callers; preferred path is plugins.executeOperation.
   */
  ipcMain.handle(
    IPC_CHANNELS.EXTRACT_FROM_ARCHIVE,
    async (_event, archivePath: string, internalPath: string, destDir: string) => {
      const entryId =
        internalPath && internalPath.length > 0
          ? `${archivePath}::${internalPath}`
          : `${archivePath}::`
      const baseName = archivePath.split(/[/\\]/).pop() || archivePath
      const result = await pluginManager.executeOperation('archive', {
        op: 'copy',
        sourceEntries: [
          {
            id: entryId,
            name: baseName,
            isContainer: !internalPath || internalPath.endsWith('/'),
            size: 0,
            modifiedAt: 0,
            mimeType: 'application/zip',
            iconHint: 'archive',
            meta: {},
            attributes: { readonly: false, hidden: false, symlink: false }
          }
        ],
        destinationLocationId: destDir,
        destinationPluginId: 'local-filesystem'
      })
      return {
        success: result.success,
        error: result.errors?.[0]?.message,
        extractedCount: result.success ? 1 : 0
      }
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
      const tid =
        transferId ||
        `xfer-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

      // Push latest bytes every 50ms from main — independent of transform
      // callbacks and independent of the (returned-immediately) invoke.
      const progressTick = setInterval(() => {
        if (!win || win.isDestroyed()) return
        const n = pluginManager.getStreamCopyProgress(tid)
        if (n > 0) {
          win.webContents.send(IPC_CHANNELS.COPY_FILE_PROGRESS, n)
        }
      }, 50)

      const sendProgress = (bytesCopied: number): void => {
        if (win && !win.isDestroyed()) {
          win.webContents.send(IPC_CHANNELS.COPY_FILE_PROGRESS, bytesCopied)
        }
      }

      // CRITICAL: do NOT await the multi-GB copy inside this handle.
      // Holding the invoke open for the whole transfer starves concurrent
      // progress polls and freezes the op dialog in real Electron use.
      void pluginManager
        .streamCopyFile(
          sourcePluginId,
          sourceEntryId,
          destPluginId,
          destLocationId,
          destFileName,
          sendProgress,
          tid
        )
        .then((result) => {
          clearInterval(progressTick)
          if (win && !win.isDestroyed()) {
            const finalBytes = result.bytesWritten || pluginManager.getStreamCopyProgress(tid)
            win.webContents.send(IPC_CHANNELS.COPY_FILE_PROGRESS, finalBytes)
            win.webContents.send(IPC_CHANNELS.STREAM_COPY_DONE, { transferId: tid, result })
          }
        })
        .catch((err) => {
          clearInterval(progressTick)
          if (win && !win.isDestroyed()) {
            win.webContents.send(IPC_CHANNELS.STREAM_COPY_DONE, {
              transferId: tid,
              result: { success: false, bytesWritten: 0, error: String(err) }
            })
          }
        })

      return { started: true, transferId: tid }
    }
  )

  ipcMain.handle(IPC_CHANNELS.CANCEL_STREAM_COPY, (_event, transferId: string) => {
    pluginManager.cancelStreamCopy(transferId)
  })

  ipcMain.handle(IPC_CHANNELS.GET_STREAM_COPY_PROGRESS, (_event, transferId: string) =>
    pluginManager.getStreamCopyProgress(transferId)
  )

  // External plugin management
  ipcMain.handle(IPC_CHANNELS.PLUGIN_SCAN, () => scanPlugins())

  ipcMain.handle(IPC_CHANNELS.PLUGIN_LOAD, (_event, pluginDir: string) => loadPlugin(pluginDir))

  ipcMain.handle(IPC_CHANNELS.PLUGIN_UNLOAD, async (_event, pluginId: string) => {
    await unloadPlugin(pluginId)
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.PLUGIN_GET_DIR, () => ensurePluginsDir())
}
