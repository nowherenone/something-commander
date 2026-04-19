import { ipcMain, BrowserWindow, Menu, nativeImage, shell } from 'electron'
import * as fs from 'fs/promises'
import { exec } from 'child_process'
import { IPC_CHANNELS } from '@shared/types/ipc-channels'

let dragIconCache: Electron.NativeImage | null = null

function getDragIcon(): Electron.NativeImage {
  if (dragIconCache) return dragIconCache
  // 16x16 file icon PNG — startDrag requires a non-empty image
  dragIconCache = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9h' +
    'AAAAJ0lEQVR4nGNgoCY4ceLEf2IwXgM+fPhwBx8eNWDUgJFiAEWZiRwAAMAs84RE7n75' +
    'AAAAAElFTkSuQmCC'
  )
  return dragIconCache
}

/** System-level handlers: open, context menus, disk space, shell commands, drag. */
export function registerSystemIPC(): void {
  ipcMain.handle(IPC_CHANNELS.OPEN_FILE, async (_event, filePath: string) => {
    return shell.openPath(filePath) // empty string = success, otherwise error message
  })

  ipcMain.handle(
    IPC_CHANNELS.SHOW_CONTEXT_MENU,
    (event, items: Array<{ label: string; id: string; separator?: boolean }>) => {
      return new Promise<string | null>((resolve) => {
        const template = items.map((item) => {
          if (item.separator) return { type: 'separator' as const }
          return { label: item.label, click: () => resolve(item.id) }
        })
        const menu = Menu.buildFromTemplate(template)
        const win = BrowserWindow.fromWebContents(event.sender)
        menu.popup({ window: win || undefined })
        menu.on('menu-will-close', () => {
          setTimeout(() => resolve(null), 100)
        })
      })
    }
  )

  ipcMain.handle(IPC_CHANNELS.GET_DISK_SPACE, async (_event, dirPath: string) => {
    try {
      if (process.platform === 'win32') {
        // PowerShell gives the most accurate numbers for mapped drives
        const driveLetter = dirPath.charAt(0).toUpperCase()
        return new Promise<{ free: number; total: number }>((resolve) => {
          exec(
            `powershell -Command "(Get-PSDrive ${driveLetter}).Free,(Get-PSDrive ${driveLetter}).Used"`,
            { timeout: 5000 },
            (err, stdout) => {
              if (err) return resolve({ free: 0, total: 0 })
              const lines = stdout.trim().split(/\r?\n/).map((s) => parseInt(s.trim(), 10))
              const free = lines[0] || 0
              const used = lines[1] || 0
              resolve({ free, total: free + used })
            }
          )
        })
      }
      const stats = await fs.statfs(dirPath)
      return {
        free: Number(stats.bavail) * Number(stats.bsize),
        total: Number(stats.blocks) * Number(stats.bsize)
      }
    } catch {
      return { free: 0, total: 0 }
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.RUN_COMMAND,
    (_event, command: string, cwd: string, shellOverride?: string) => {
      return new Promise<{ stdout: string; stderr: string; code: number }>((resolve) => {
        const opts = {
          cwd,
          shell: shellOverride || (process.platform === 'win32' ? 'powershell.exe' : '/bin/bash'),
          timeout: 30000,
          maxBuffer: 1024 * 1024
        }
        exec(command, opts, (error, stdout, stderr) => {
          resolve({
            stdout: stdout || '',
            stderr: stderr || '',
            code: error ? (error as { code?: number }).code || 1 : 0
          })
        })
      })
    }
  )

  ipcMain.on(IPC_CHANNELS.NATIVE_DRAG_START, (event, filePaths: string[]) => {
    if (!filePaths || filePaths.length === 0) return
    event.sender.startDrag({
      file: filePaths[0],
      files: filePaths,
      icon: getDragIcon()
    })
  })
}
