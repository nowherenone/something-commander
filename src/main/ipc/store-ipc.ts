import { ipcMain, app } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'
import { IPC_CHANNELS } from '@shared/types/ipc-channels'

export function registerStoreIPC(): void {
  const userDataPath = app.getPath('userData')

  ipcMain.handle(IPC_CHANNELS.STORE_GET, async (_event, key: string) => {
    try {
      const filePath = path.join(userDataPath, `${key}.json`)
      const data = await fs.readFile(filePath, 'utf-8')
      return JSON.parse(data)
    } catch {
      return null
    }
  })

  ipcMain.handle(IPC_CHANNELS.STORE_SET, async (_event, key: string, value: unknown) => {
    try {
      const filePath = path.join(userDataPath, `${key}.json`)
      await fs.mkdir(userDataPath, { recursive: true })
      await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf-8')
    } catch (err) {
      console.error(`store:set failed for key "${key}":`, err)
    }
  })
}
