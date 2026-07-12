import { ipcMain, BrowserWindow, Menu, nativeImage, shell, safeStorage } from 'electron'
import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import * as os from 'os'
import * as path from 'path'
import { exec, spawn } from 'child_process'
import { IPC_CHANNELS } from '@shared/types/ipc-channels'
import { pluginManager } from '../plugins/plugin-manager'

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

  ipcMain.handle(IPC_CHANNELS.SHOW_FILE_PROPERTIES, async (_event, filePath: string) => {
    return showFileProperties(filePath)
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

  ipcMain.handle(IPC_CHANNELS.GET_DISK_SPACE, async (_event, pluginIdOrPath: string, maybeLocationId?: string) => {
    // Support new signature getDiskSpace(pluginId, locationId) and old getDiskSpace(path)
    let pluginId: string | undefined
    let locationId: string
    if (maybeLocationId !== undefined) {
      pluginId = pluginIdOrPath
      locationId = maybeLocationId
    } else {
      locationId = pluginIdOrPath
    }

    // Let the owning plugin provide disk space if it implements it
    if (pluginId) {
      try {
        const plugin = pluginManager.get(pluginId)
        if (plugin && typeof plugin.getDiskSpace === 'function') {
          const result = await plugin.getDiskSpace(locationId)
          if (result && typeof result.total === 'number' && result.total > 0) {
            return result
          }
        }
      } catch {
        // fall through to legacy local logic
      }
    }

    // Legacy local filesystem behavior (used for local drives/paths)
    try {
      if (process.platform === 'win32') {
        // PowerShell gives the most accurate numbers for mapped drives
        const driveLetter = locationId.charAt(0).toUpperCase()
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
      const stats = await fs.statfs(locationId)
      return {
        free: Number(stats.bavail) * Number(stats.bsize),
        total: Number(stats.blocks) * Number(stats.bsize)
      }
    } catch {
      return { free: 0, total: 0 }
    }
  })

  // Secure string storage for passwords/credentials using OS keychain/credential vault
  ipcMain.handle('util:encryptString', async (_event, text: string) => {
    try {
      if (!safeStorage.isEncryptionAvailable()) {
        return text || ''
      }
      const buf = safeStorage.encryptString(text || '')
      return buf.toString('base64')
    } catch {
      return text || ''
    }
  })

  ipcMain.handle('util:decryptString', async (_event, data: string) => {
    try {
      if (!safeStorage.isEncryptionAvailable() || !data) {
        return data || ''
      }
      const buf = Buffer.from(data, 'base64')
      return safeStorage.decryptString(buf)
    } catch {
      // Decryption failed (e.g. data was plain text or from different machine) -> return as-is
      return data || ''
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

  setupDriveWatchers()
}

function commandExists(cmd: string): Promise<boolean> {
  return new Promise((resolve) => {
    exec(`command -v ${cmd}`, (err) => resolve(!err))
  })
}

function spawnDetached(cmd: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const child = spawn(cmd, args, { detached: true, stdio: 'ignore' })
      child.on('error', () => resolve(false))
      child.unref()
      resolve(true)
    } catch {
      resolve(false)
    }
  })
}

async function showFilePropertiesWindows(filePath: string): Promise<{ success: boolean; error?: string }> {
  const escaped = filePath.replace(/'/g, "''")
  return new Promise((resolve) => {
    exec(
      `powershell -NoProfile -Command "$shell = New-Object -ComObject Shell.Application; $item = Get-Item -LiteralPath '${escaped}'; $folder = $shell.Namespace($item.DirectoryName); $folderItem = $folder.ParseName($item.Name); $folderItem.InvokeVerb('properties')"`,
      { timeout: 10000 },
      (err) => {
        if (err) resolve({ success: false, error: String(err) })
        else resolve({ success: true })
      }
    )
  })
}

async function showFilePropertiesMac(filePath: string): Promise<{ success: boolean; error?: string }> {
  const escaped = filePath.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return new Promise((resolve) => {
    exec(
      `osascript -e 'tell application "Finder" to open information window of (POSIX file "${escaped}" as alias)'`,
      { timeout: 10000 },
      (err) => {
        if (err) resolve({ success: false, error: String(err) })
        else resolve({ success: true })
      }
    )
  })
}

async function showFilePropertiesLinux(filePath: string): Promise<{ success: boolean; error?: string }> {
  const uri = `file://${encodeURI(filePath)}`
  const attempts: Array<[string, string[]]> = [
    ['nautilus', ['--show-properties', uri]],
    ['nemo', ['--show-properties', uri]],
    ['caja', ['--show-properties', uri]],
    ['pcmanfm-qt', ['--show-properties', filePath]],
    ['pcmanfm', ['--show-properties', filePath]]
  ]

  for (const [cmd, args] of attempts) {
    if (await commandExists(cmd)) {
      const ok = await spawnDetached(cmd, args)
      if (ok) return { success: true }
    }
  }

  if (await commandExists('dbus-send')) {
    const ok = await spawnDetached('dbus-send', [
      '--print-reply',
      '--dest=org.kde.dolphin',
      '/dolphin',
      'org.kde.dolphin.showItemInfo',
      `string:${uri}`
    ])
    if (ok) return { success: true }
  }

  return { success: false, error: 'No supported file manager found' }
}

async function showFileProperties(filePath: string): Promise<{ success: boolean; error?: string }> {
  const resolved = path.resolve(filePath)
  try {
    await fs.access(resolved)
  } catch {
    return { success: false, error: 'File not found' }
  }

  if (process.platform === 'win32') return showFilePropertiesWindows(resolved)
  if (process.platform === 'darwin') return showFilePropertiesMac(resolved)
  return showFilePropertiesLinux(resolved)
}

let driveWatchersSetup = false

function notifyDrivesChanged() {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.DRIVES_CHANGED)
    }
  })
}

function setupDriveWatchers() {
  if (driveWatchersSetup || process.platform === 'win32') return // Win handled differently or poll later
  driveWatchersSetup = true

  const user = os.userInfo().username
  const watchDirs = [
    '/mnt',
    `/media/${user}`,
    `/run/media/${user}`
  ]

  watchDirs.forEach((dir) => {
    try {
      fsSync.watch(dir, { persistent: true, recursive: false }, (eventType) => {
        // Debounce notifications
        if (eventType === 'rename' || eventType === 'change') {
          setTimeout(() => notifyDrivesChanged(), 800)
        }
      })
    } catch {
      // dir may not exist yet
    }
  })

  // Also poll occasionally for robustness (e.g. USB that doesn't trigger watch perfectly)
  setInterval(() => {
    // Only notify if we think something might have changed; simple version always notify on interval is noisy
    // For now, do nothing extra; watchers + menu open refresh is good enough
  }, 15000)
}
