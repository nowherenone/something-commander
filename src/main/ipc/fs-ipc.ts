import { ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/types/ipc-channels'
import { pluginManager } from '../plugins/plugin-manager'
import type { Entry } from '@shared/types'

const LOCAL = 'local-filesystem'

function makeEntry(id: string, name: string, isContainer: boolean, size = 0): Entry {
  return {
    id,
    name,
    isContainer,
    size: isContainer ? -1 : size,
    modifiedAt: 0,
    mimeType: isContainer ? 'inode/directory' : 'application/octet-stream',
    iconHint: isContainer ? 'folder' : 'file',
    meta: {},
    attributes: { readonly: false, hidden: false, symlink: false }
  }
}

/**
 * Bare-path util handlers kept for back-compat: each injects pluginId
 * `local-filesystem` and delegates to pluginManager — no parallel fs stack.
 */
export function registerFsIPC(): void {
  ipcMain.handle(IPC_CHANNELS.CHECK_EXISTS, async (_event, filePath: string) => {
    return pluginManager.exists(LOCAL, filePath)
  })

  ipcMain.handle(IPC_CHANNELS.GET_FILE_INFO, async (_event, filePath: string) => {
    const st = await pluginManager.statEntry(LOCAL, filePath)
    if (!st) return null
    return {
      size: st.size,
      modifiedAt: st.modifiedAt,
      isDirectory: !!st.isDirectory
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.COPY_SINGLE_FILE,
    async (event, sourcePath: string, destPath: string, isDirectory: boolean) => {
      try {
        const pathMod = await import('path')
        const destDir = pathMod.dirname(destPath)
        const destName = pathMod.basename(destPath)
        const entry = makeEntry(sourcePath, pathMod.basename(sourcePath), isDirectory)

        if (isDirectory) {
          // Create dest dir then copy tree via plugin copy of the source folder
          // into the parent with the desired name: copy to destDir, then rename if needed
          const result = await pluginManager.executeOperation(LOCAL, {
            op: 'copy',
            sourceEntries: [entry],
            destinationLocationId: destDir,
            destinationPluginId: LOCAL
          })
          if (!result.success) {
            return { success: false, error: result.errors?.[0]?.message || 'Copy failed' }
          }
          // Plugin copies as source basename; rename if dest name differs
          const copiedAs = pathMod.join(destDir, entry.name)
          if (copiedAs !== destPath) {
            const ren = await pluginManager.executeOperation(LOCAL, {
              op: 'rename',
              entry: makeEntry(copiedAs, entry.name, true),
              newName: destName
            })
            if (!ren.success) {
              return {
                success: false,
                error: ren.errors?.[0]?.message || 'Rename after directory copy failed'
              }
            }
          }
          return { success: true }
        }

        // File copy with progress via streamCopyFile
        const win = BrowserWindow.fromWebContents(event.sender)
        const transferId = `legacy-copy-${Date.now()}`
        const result = await pluginManager.streamCopyFile(
          LOCAL,
          sourcePath,
          LOCAL,
          destDir,
          destName,
          (bytes) => {
            if (win && !win.isDestroyed()) {
              win.webContents.send(IPC_CHANNELS.COPY_FILE_PROGRESS, bytes)
            }
          },
          transferId
        )
        return { success: result.success, error: result.error }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.MOVE_SINGLE_FILE,
    async (_event, sourcePath: string, destPath: string, isDirectory: boolean) => {
      try {
        const pathMod = await import('path')
        const destDir = pathMod.dirname(destPath)
        const destName = pathMod.basename(destPath)
        const srcName = pathMod.basename(sourcePath)
        const entry = makeEntry(sourcePath, srcName, isDirectory)

        // Same parent → rename
        if (pathMod.dirname(sourcePath) === destDir) {
          if (srcName === destName) return { success: true }
          const result = await pluginManager.executeOperation(LOCAL, {
            op: 'rename',
            entry,
            newName: destName
          })
          return {
            success: result.success,
            error: result.errors?.[0]?.message
          }
        }

        // Different parent → move into destDir (keeps source name), then rename if needed
        const result = await pluginManager.executeOperation(LOCAL, {
          op: 'move',
          sourceEntries: [entry],
          destinationLocationId: destDir,
          destinationPluginId: LOCAL
        })
        if (!result.success) {
          return { success: false, error: result.errors?.[0]?.message || 'Move failed' }
        }
        const movedAs = pathMod.join(destDir, srcName)
        if (movedAs !== destPath) {
          const ren = await pluginManager.executeOperation(LOCAL, {
            op: 'rename',
            entry: makeEntry(movedAs, srcName, isDirectory),
            newName: destName
          })
          if (!ren.success) {
            return { success: false, error: ren.errors?.[0]?.message || 'Rename after move failed' }
          }
        }
        return { success: true }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.DELETE_SINGLE, async (_event, targetPath: string) => {
    try {
      const pathMod = await import('path')
      const st = await pluginManager.statEntry(LOCAL, targetPath)
      const isDir = !!st?.isDirectory
      const result = await pluginManager.executeOperation(LOCAL, {
        op: 'delete',
        entries: [makeEntry(targetPath, pathMod.basename(targetPath), isDir, st?.size || 0)]
      })
      return {
        success: result.success,
        error: result.errors?.[0]?.message
      }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })
}
