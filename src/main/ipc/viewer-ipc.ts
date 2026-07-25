import { ipcMain, BrowserWindow } from 'electron'
import * as path from 'path'
import { is } from '@electron-toolkit/utils'
import { IPC_CHANNELS } from '@shared/types/ipc-channels'
import { pluginManager } from '../plugins/plugin-manager'

type UtilWindowKind = 'viewer' | 'editor'

const LOCAL = 'local-filesystem'

/** Parse pluginId|entryId composite, or treat bare path as local-filesystem. */
function parseScopedPath(filePath: string): { pluginId: string; entryId: string } {
  const pipe = filePath.indexOf('|')
  if (pipe > 0) {
    return { pluginId: filePath.slice(0, pipe), entryId: filePath.slice(pipe + 1) }
  }
  if (filePath.includes('::')) {
    return { pluginId: 'archive', entryId: filePath }
  }
  return { pluginId: LOCAL, entryId: filePath }
}

function openUtilWindow(kind: UtilWindowKind, filePath: string, fileName: string): void {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    title: fileName,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })
  win.setMenu(null)

  const query = `file=${encodeURIComponent(filePath)}&name=${encodeURIComponent(fileName)}`
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/${kind}?${query}`)
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'), {
      hash: `/${kind}?${query}`
    })
  }
}

/** File-viewer/editor IO and window lifecycle — all content I/O via pluginManager. */
export function registerViewerIPC(): void {
  ipcMain.handle(IPC_CHANNELS.OPEN_VIEWER_WINDOW, (_event, pluginId: string, entryId: string, fileName: string) => {
    openUtilWindow('viewer', `${pluginId}|${entryId}`, fileName)
  })

  ipcMain.handle(IPC_CHANNELS.OPEN_EDITOR_WINDOW, (_event, pluginId: string, entryId: string, fileName: string) => {
    openUtilWindow('editor', `${pluginId}|${entryId}`, fileName)
  })

  ipcMain.handle(
    IPC_CHANNELS.READ_FILE_CHUNK,
    async (_event, filePath: string, offset: number, length: number) => {
      try {
        const { pluginId, entryId } = parseScopedPath(filePath)
        const res = await pluginManager.readEntryContent(pluginId, entryId, offset, length)
        if (res.error) {
          return { data: '', bytesRead: 0, error: res.error }
        }
        // When isBinary, data may be hex string from readEntryContent
        let raw: Buffer
        if (Buffer.isBuffer(res.data)) {
          raw = res.data
        } else if (res.isBinary && typeof res.data === 'string') {
          raw = Buffer.from(res.data, 'hex')
        } else {
          raw = Buffer.from(String(res.data), 'utf-8')
        }
        return {
          data: raw.toString('base64'),
          bytesRead: raw.length,
          encoding: 'base64'
        }
      } catch (err) {
        return { data: '', bytesRead: 0, error: String(err) }
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.GET_FILE_SIZE, async (_event, filePath: string) => {
    try {
      const { pluginId, entryId } = parseScopedPath(filePath)
      return await pluginManager.getSize(pluginId, entryId)
    } catch {
      const { pluginId, entryId } = parseScopedPath(filePath)
      const st = await pluginManager.statEntry(pluginId, entryId)
      return st?.size || 0
    }
  })

  ipcMain.handle(IPC_CHANNELS.SAVE_FILE, async (_event, filePath: string, content: string) => {
    try {
      const { pluginId, entryId } = parseScopedPath(filePath)
      if (!entryId) return { success: false, error: 'Invalid save path' }
      const result = await pluginManager.writeEntryContent(pluginId, entryId, content)
      return { success: result.success, error: result.error, bytesWritten: result.bytesWritten }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.SAVE_ENTRY_CONTENT,
    async (_event, pluginId: string, entryId: string, content: string) => {
      return pluginManager.writeEntryContent(pluginId, entryId, content)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.READ_ENTRY_CONTENT,
    async (_event, pluginId: string, entryId: string, offset = 0, length?: number) => {
      return pluginManager.readEntryContent(pluginId, entryId, offset, length)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.READ_FILE_CONTENT,
    async (_event, filePath: string, maxBytes: number = 512 * 1024) => {
      try {
        const { pluginId, entryId } = parseScopedPath(filePath)
        const res = await pluginManager.readEntryContent(pluginId, entryId, 0, maxBytes)
        if (res.error) {
          return {
            content: '',
            isBinary: false,
            totalSize: 0,
            truncated: false,
            error: res.error
          }
        }
        const content =
          typeof res.data === 'string'
            ? res.data
            : res.isBinary
              ? Buffer.from(res.data).toString('hex')
              : Buffer.from(res.data).toString('utf-8')
        return {
          content,
          isBinary: res.isBinary,
          totalSize: res.totalSize,
          truncated: res.totalSize > maxBytes
        }
      } catch (err) {
        return { content: '', isBinary: false, totalSize: 0, truncated: false, error: String(err) }
      }
    }
  )
}
