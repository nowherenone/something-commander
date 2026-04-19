import { ipcMain, BrowserWindow } from 'electron'
import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import * as path from 'path'
import { IPC_CHANNELS } from '@shared/types/ipc-channels'

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
    const readStream = fsSync.createReadStream(src, { highWaterMark: 256 * 1024 })
    const writeStream = fsSync.createWriteStream(dest)
    let bytesCopied = 0
    let lastReport = 0

    readStream.on('data', (chunk: string | Buffer) => {
      bytesCopied += chunk.length
      // Throttle progress reports to avoid flooding IPC
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
      onProgress(bytesCopied) // final report
      resolve()
    })
    readStream.pipe(writeStream)
  })
}

/** Local-filesystem IO used by renderer operation execution. */
export function registerFsIPC(): void {
  ipcMain.handle(IPC_CHANNELS.CHECK_EXISTS, async (_event, filePath: string) => {
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle(IPC_CHANNELS.GET_FILE_INFO, async (_event, filePath: string) => {
    try {
      const stat = await fs.stat(filePath)
      return { size: stat.size, modifiedAt: stat.mtimeMs, isDirectory: stat.isDirectory() }
    } catch {
      return null
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.COPY_SINGLE_FILE,
    async (event, sourcePath: string, destPath: string, isDirectory: boolean) => {
      try {
        if (isDirectory) {
          await fs.mkdir(destPath, { recursive: true })
        } else {
          await fs.mkdir(path.dirname(destPath), { recursive: true })
          await copyFileWithProgress(sourcePath, destPath, (bytesCopied) => {
            const win = BrowserWindow.fromWebContents(event.sender)
            if (win) win.webContents.send(IPC_CHANNELS.COPY_FILE_PROGRESS, bytesCopied)
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

  ipcMain.handle(IPC_CHANNELS.DELETE_SINGLE, async (_event, targetPath: string) => {
    try {
      await fs.rm(targetPath, { recursive: true })
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })
}
