import { ipcMain } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'
import { exec } from 'child_process'
import { IPC_CHANNELS } from '@shared/types/ipc-channels'
import { pluginManager } from '../plugins/plugin-manager'

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
    const ext = path.extname(filePath).toLowerCase()
    return ['.zip', '.jar'].includes(ext)
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
    async (_event, sourcePath: string, destPath: string, isDirectory: boolean) => {
      try {
        if (isDirectory) {
          await copyDirRecursive(sourcePath, destPath)
        } else {
          // Ensure parent dir exists
          await fs.mkdir(path.dirname(destPath), { recursive: true })
          await fs.copyFile(sourcePath, destPath)
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
