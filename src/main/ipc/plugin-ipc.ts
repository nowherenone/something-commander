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
}
