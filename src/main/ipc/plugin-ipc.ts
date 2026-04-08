import { ipcMain, BrowserWindow, shell, Menu, nativeImage } from 'electron'
import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import * as path from 'path'
import { exec } from 'child_process'
import { is } from '@electron-toolkit/utils'
import { IPC_CHANNELS } from '@shared/types/ipc-channels'
import { pluginManager } from '../plugins/plugin-manager'
import { scanPlugins, loadPlugin, unloadPlugin, ensurePluginsDir } from '../plugins/plugin-loader'
import { extractFromZip, ArchivePlugin, getArchiveFormats } from '../plugins/archive'
import type { SftpPlugin } from '../plugins/sftp'
import type { S3Plugin } from '../plugins/s3'

async function calcFolderSize(dirPath: string): Promise<number> {
  let totalSize = 0
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)
      if (entry.isDirectory()) {
        totalSize += await calcFolderSize(fullPath)
      } else {
        try {
          const stat = await fs.stat(fullPath)
          totalSize += stat.size
        } catch {
          // Skip files we can't stat
        }
      }
    }
  } catch {
    // Skip dirs we can't read
  }
  return totalSize
}

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

  ipcMain.handle(IPC_CHANNELS.CALC_FOLDER_SIZE, (_event, folderPath: string) => {
    return calcFolderSize(folderPath)
  })

  ipcMain.handle(IPC_CHANNELS.IS_ARCHIVE, (_event, filePath: string) => {
    return ArchivePlugin.isArchive(filePath)
  })

  ipcMain.handle(IPC_CHANNELS.ARCHIVE_FORMATS, () => {
    return getArchiveFormats()
  })

  // Open file with system default application
  ipcMain.handle(IPC_CHANNELS.OPEN_FILE, async (_event, filePath: string) => {
    const result = await shell.openPath(filePath)
    return result // empty string = success, otherwise error message
  })

  // Open viewer in new window
  ipcMain.handle(IPC_CHANNELS.OPEN_VIEWER_WINDOW, (_event, filePath: string, fileName: string) => {
    const viewerWindow = new BrowserWindow({
      width: 900,
      height: 700,
      title: `View: ${fileName}`,
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        sandbox: false
      }
    })

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      viewerWindow.loadURL(
        `${process.env['ELECTRON_RENDERER_URL']}#/viewer?file=${encodeURIComponent(filePath)}&name=${encodeURIComponent(fileName)}`
      )
    } else {
      viewerWindow.loadFile(path.join(__dirname, '../renderer/index.html'), {
        hash: `/viewer?file=${encodeURIComponent(filePath)}&name=${encodeURIComponent(fileName)}`
      })
    }
  })

  // Open editor in new window
  ipcMain.handle(IPC_CHANNELS.OPEN_EDITOR_WINDOW, (_event, filePath: string, fileName: string) => {
    const editorWindow = new BrowserWindow({
      width: 900,
      height: 700,
      title: `Edit: ${fileName}`,
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        sandbox: false
      }
    })

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      editorWindow.loadURL(
        `${process.env['ELECTRON_RENDERER_URL']}#/editor?file=${encodeURIComponent(filePath)}&name=${encodeURIComponent(fileName)}`
      )
    } else {
      editorWindow.loadFile(path.join(__dirname, '../renderer/index.html'), {
        hash: `/editor?file=${encodeURIComponent(filePath)}&name=${encodeURIComponent(fileName)}`
      })
    }
  })

  // Read a chunk of a file (for virtualized viewer)
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

  // Get file size
  ipcMain.handle(IPC_CHANNELS.GET_FILE_SIZE, async (_event, filePath: string) => {
    try {
      const stat = await fs.stat(filePath)
      return stat.size
    } catch {
      return 0
    }
  })

  // Save file content
  ipcMain.handle(IPC_CHANNELS.SAVE_FILE, async (_event, filePath: string, content: string) => {
    try {
      await fs.writeFile(filePath, content, 'utf-8')
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  // Context menu
  ipcMain.handle(
    IPC_CHANNELS.SHOW_CONTEXT_MENU,
    async (event, items: Array<{ label: string; id: string; separator?: boolean }>) => {
      return new Promise<string | null>((resolve) => {
        const template = items.map((item) => {
          if (item.separator) return { type: 'separator' as const }
          return {
            label: item.label,
            click: () => resolve(item.id)
          }
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

  // Get disk free/total space for a path
  ipcMain.handle(IPC_CHANNELS.GET_DISK_SPACE, async (_event, dirPath: string) => {
    try {
      if (process.platform === 'win32') {
        // On Windows, use PowerShell to get accurate disk space
        const driveLetter = dirPath.charAt(0).toUpperCase()
        return new Promise<{ free: number; total: number }>((resolve) => {
          exec(
            `powershell -Command "(Get-PSDrive ${driveLetter}).Free,(Get-PSDrive ${driveLetter}).Used"`,
            { timeout: 5000 },
            (err, stdout) => {
              if (err) {
                resolve({ free: 0, total: 0 })
                return
              }
              const lines = stdout.trim().split(/\r?\n/).map(s => parseInt(s.trim(), 10))
              const free = lines[0] || 0
              const used = lines[1] || 0
              resolve({ free, total: free + used })
            }
          )
        })
      }
      // On Linux/macOS, statfs works fine
      const stats = await fs.statfs(dirPath)
      return {
        free: Number(stats.bavail) * Number(stats.bsize),
        total: Number(stats.blocks) * Number(stats.bsize)
      }
    } catch {
      return { free: 0, total: 0 }
    }
  })

  // SFTP connection management
  ipcMain.handle(
    IPC_CHANNELS.SFTP_CONNECT,
    async (_event, host: string, port: number, username: string, password?: string) => {
      const sftp = pluginManager.get('sftp') as SftpPlugin | undefined
      if (!sftp) throw new Error('SFTP plugin not loaded')
      const connId = await sftp.connect(host, port, username, password)
      return connId
    }
  )

  ipcMain.handle(IPC_CHANNELS.SFTP_DISCONNECT, async (_event, connId: string) => {
    const sftp = pluginManager.get('sftp') as SftpPlugin | undefined
    if (!sftp) throw new Error('SFTP plugin not loaded')
    await sftp.disconnect(connId)
  })

  ipcMain.handle(IPC_CHANNELS.SFTP_LIST_CONNECTIONS, () => {
    const sftp = pluginManager.get('sftp') as SftpPlugin | undefined
    if (!sftp) return []
    return sftp.getConnections()
  })

  // S3 connection management
  ipcMain.handle(
    IPC_CHANNELS.S3_CONNECT,
    async (_event, bucket: string, region: string, accessKeyId: string, secretAccessKey: string, label?: string) => {
      const s3 = pluginManager.get('s3') as S3Plugin | undefined
      if (!s3) throw new Error('S3 plugin not loaded')
      return s3.connect(bucket, region, accessKeyId, secretAccessKey, label)
    }
  )

  ipcMain.handle(IPC_CHANNELS.S3_DISCONNECT, (_event, connId: string) => {
    const s3 = pluginManager.get('s3') as S3Plugin | undefined
    if (!s3) return
    s3.disconnect(connId)
  })

  // External plugin management
  ipcMain.handle(IPC_CHANNELS.PLUGIN_SCAN, () => scanPlugins())

  ipcMain.handle(IPC_CHANNELS.PLUGIN_LOAD, (_event, pluginDir: string) => loadPlugin(pluginDir))

  ipcMain.handle(IPC_CHANNELS.PLUGIN_UNLOAD, async (_event, pluginId: string) => {
    await unloadPlugin(pluginId)
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.PLUGIN_GET_DIR, () => ensurePluginsDir())

  // Extract files from archive to local filesystem
  ipcMain.handle(
    IPC_CHANNELS.EXTRACT_FROM_ARCHIVE,
    async (_event, archivePath: string, internalPath: string, destDir: string) => {
      return extractFromZip(archivePath, internalPath, destDir)
    }
  )

  // Stream copy a single file between any two plugins
  ipcMain.handle(
    IPC_CHANNELS.STREAM_COPY_FILE,
    async (
      event,
      sourcePluginId: string,
      sourceEntryId: string,
      destPluginId: string,
      destLocationId: string,
      destFileName: string
    ) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      return pluginManager.streamCopyFile(
        sourcePluginId,
        sourceEntryId,
        destPluginId,
        destLocationId,
        destFileName,
        (bytesCopied) => {
          if (win) {
            win.webContents.send(IPC_CHANNELS.COPY_FILE_PROGRESS, bytesCopied)
          }
        }
      )
    }
  )

  // Enumerate files through the plugin system
  ipcMain.handle(
    IPC_CHANNELS.ENUMERATE_FILES,
    async (_event, pluginId: string, entryIds: string[], destDir: string) => {
      return pluginManager.enumerateFiles(pluginId, entryIds, destDir)
    }
  )

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

  ipcMain.handle(
    IPC_CHANNELS.SEARCH_FILES,
    async (
      _event,
      rootPath: string,
      pattern: string,
      contentPattern: string,
      maxResults: number = 500
    ) => {
      const results: Array<{ path: string; name: string; isDirectory: boolean; size: number }> = []
      const regex = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'), 'i')
      const contentRegex = contentPattern ? new RegExp(contentPattern, 'i') : null

      async function walk(dir: string): Promise<void> {
        if (results.length >= maxResults) return
        try {
          const entries = await fs.readdir(dir, { withFileTypes: true })
          for (const entry of entries) {
            if (results.length >= maxResults) return
            const fullPath = path.join(dir, entry.name)
            const matches = regex.test(entry.name)

            if (entry.isDirectory()) {
              if (matches && !contentPattern) {
                results.push({ path: fullPath, name: entry.name, isDirectory: true, size: 0 })
              }
              await walk(fullPath)
            } else if (matches) {
              if (contentRegex) {
                try {
                  const content = await fs.readFile(fullPath, 'utf-8')
                  if (contentRegex.test(content)) {
                    const stat = await fs.stat(fullPath)
                    results.push({
                      path: fullPath,
                      name: entry.name,
                      isDirectory: false,
                      size: stat.size
                    })
                  }
                } catch {
                  // Skip files we can't read
                }
              } else {
                try {
                  const stat = await fs.stat(fullPath)
                  results.push({
                    path: fullPath,
                    name: entry.name,
                    isDirectory: false,
                    size: stat.size
                  })
                } catch {
                  // skip
                }
              }
            }
          }
        } catch {
          // skip dirs we can't read
        }
      }

      await walk(rootPath)
      return results
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.RUN_COMMAND,
    (_event, command: string, cwd: string, shell?: string) => {
      return new Promise<{ stdout: string; stderr: string; code: number }>((resolve) => {
        const opts = {
          cwd,
          shell: shell || (process.platform === 'win32' ? 'powershell.exe' : '/bin/bash'),
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

  // Single-file operations for progress tracking
  ipcMain.handle(
    IPC_CHANNELS.CHECK_EXISTS,
    async (_event, filePath: string) => {
      try {
        await fs.access(filePath)
        return true
      } catch {
        return false
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.GET_FILE_INFO,
    async (_event, filePath: string) => {
      try {
        const stat = await fs.stat(filePath)
        return {
          size: stat.size,
          modifiedAt: stat.mtimeMs,
          isDirectory: stat.isDirectory()
        }
      } catch {
        return null
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.COPY_SINGLE_FILE,
    async (event, sourcePath: string, destPath: string, isDirectory: boolean) => {
      try {
        if (isDirectory) {
          await fs.mkdir(destPath, { recursive: true })
        } else {
          await fs.mkdir(path.dirname(destPath), { recursive: true })
          // Stream-based copy with progress
          await copyFileWithProgress(sourcePath, destPath, (bytesCopied) => {
            const win = BrowserWindow.fromWebContents(event.sender)
            if (win) {
              win.webContents.send(IPC_CHANNELS.COPY_FILE_PROGRESS, bytesCopied)
            }
          })
        }
        return { success: true }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.MOVE_SINGLE_FILE,
    async (_event, sourcePath: string, destPath: string, isDirectory: boolean) => {
      try {
        await fs.mkdir(path.dirname(destPath), { recursive: true })
        try {
          await fs.rename(sourcePath, destPath)
        } catch (err: unknown) {
          if ((err as NodeJS.ErrnoException).code === 'EXDEV') {
            if (isDirectory) {
              await copyDirRecursive(sourcePath, destPath)
            } else {
              await fs.copyFile(sourcePath, destPath)
            }
            await fs.rm(sourcePath, { recursive: true })
          } else {
            throw err
          }
        }
        return { success: true }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.DELETE_SINGLE,
    async (_event, targetPath: string) => {
      try {
        await fs.rm(targetPath, { recursive: true })
        return { success: true }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )

  // Native drag-and-drop: hand file paths to the OS for dragging to external apps
  ipcMain.on(IPC_CHANNELS.NATIVE_DRAG_START, (event, filePaths: string[]) => {
    if (!filePaths || filePaths.length === 0) return
    event.sender.startDrag({
      file: filePaths[0],
      files: filePaths,
      icon: getDragIcon()
    })
  })
}

async function copyDirRecursive(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true })
  const dirents = await fs.readdir(src, { withFileTypes: true })
  for (const dirent of dirents) {
    const srcPath = path.join(src, dirent.name)
    const destPath = path.join(dest, dirent.name)
    if (dirent.isDirectory()) {
      await copyDirRecursive(srcPath, destPath)
    } else {
      await fs.copyFile(srcPath, destPath)
    }
  }
}

function copyFileWithProgress(
  src: string,
  dest: string,
  onProgress: (bytesCopied: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const readStream = fsSync.createReadStream(src, { highWaterMark: 256 * 1024 }) // 256KB chunks
    const writeStream = fsSync.createWriteStream(dest)
    let bytesCopied = 0
    let lastReport = 0

    readStream.on('data', (chunk: string | Buffer) => {
      bytesCopied += chunk.length
      // Throttle progress reports to avoid flooding IPC (every 100ms worth)
      const now = Date.now()
      if (now - lastReport > 250) {
        onProgress(bytesCopied)
        lastReport = now
      }
    })

    readStream.on('error', (err) => {
      writeStream.destroy()
      reject(err)
    })

    writeStream.on('error', (err) => {
      readStream.destroy()
      reject(err)
    })

    writeStream.on('finish', () => {
      onProgress(bytesCopied) // Final report
      resolve()
    })

    readStream.pipe(writeStream)
  })
}
