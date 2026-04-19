import { ipcMain, BrowserWindow } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'
import { is } from '@electron-toolkit/utils'
import { IPC_CHANNELS } from '@shared/types/ipc-channels'

type UtilWindowKind = 'viewer' | 'editor'

function openUtilWindow(kind: UtilWindowKind, filePath: string, fileName: string): void {
  const titlePrefix = kind === 'viewer' ? 'View' : 'Edit'
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    title: `${titlePrefix}: ${fileName}`,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  const query = `file=${encodeURIComponent(filePath)}&name=${encodeURIComponent(fileName)}`
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/${kind}?${query}`)
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'), {
      hash: `/${kind}?${query}`
    })
  }
}

/** File-viewer/editor IO and window lifecycle handlers. */
export function registerViewerIPC(): void {
  ipcMain.handle(IPC_CHANNELS.OPEN_VIEWER_WINDOW, (_event, filePath: string, fileName: string) => {
    openUtilWindow('viewer', filePath, fileName)
  })

  ipcMain.handle(IPC_CHANNELS.OPEN_EDITOR_WINDOW, (_event, filePath: string, fileName: string) => {
    openUtilWindow('editor', filePath, fileName)
  })

  ipcMain.handle(
    IPC_CHANNELS.READ_FILE_CHUNK,
    async (_event, filePath: string, offset: number, length: number) => {
      try {
        const handle = await fs.open(filePath, 'r')
        const buffer = Buffer.alloc(length)
        const { bytesRead } = await handle.read(buffer, 0, length, offset)
        await handle.close()
        return { data: buffer.slice(0, bytesRead).toString('utf-8'), bytesRead }
      } catch (err) {
        return { data: '', bytesRead: 0, error: String(err) }
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.GET_FILE_SIZE, async (_event, filePath: string) => {
    try {
      const stat = await fs.stat(filePath)
      return stat.size
    } catch {
      return 0
    }
  })

  ipcMain.handle(IPC_CHANNELS.SAVE_FILE, async (_event, filePath: string, content: string) => {
    try {
      await fs.writeFile(filePath, content, 'utf-8')
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.READ_FILE_CONTENT,
    async (_event, filePath: string, maxBytes: number = 512 * 1024) => {
      try {
        const stat = await fs.stat(filePath)
        const isLarge = stat.size > maxBytes
        const handle = await fs.open(filePath, 'r')
        const buffer = Buffer.alloc(Math.min(stat.size, maxBytes))
        await handle.read(buffer, 0, buffer.length, 0)
        await handle.close()

        // Try to detect if it's text or binary
        let isBinary = false
        for (let i = 0; i < Math.min(buffer.length, 8192); i++) {
          if (buffer[i] === 0) {
            isBinary = true
            break
          }
        }

        return {
          content: isBinary ? buffer.toString('hex') : buffer.toString('utf-8'),
          isBinary,
          totalSize: stat.size,
          truncated: isLarge
        }
      } catch (err) {
        return { content: '', isBinary: false, totalSize: 0, truncated: false, error: String(err) }
      }
    }
  )
}
