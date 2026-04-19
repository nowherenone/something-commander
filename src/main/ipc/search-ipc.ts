import { ipcMain } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'
import { IPC_CHANNELS } from '@shared/types/ipc-channels'

async function calcFolderSize(dirPath: string): Promise<number> {
  let total = 0
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)
      if (entry.isDirectory()) {
        total += await calcFolderSize(fullPath)
      } else {
        try {
          const stat = await fs.stat(fullPath)
          total += stat.size
        } catch { /* skip files we can't stat */ }
      }
    }
  } catch { /* skip dirs we can't read */ }
  return total
}

interface SearchResult {
  path: string
  name: string
  isDirectory: boolean
  size: number
}

async function searchFiles(
  rootPath: string,
  pattern: string,
  contentPattern: string,
  maxResults: number
): Promise<SearchResult[]> {
  const results: SearchResult[] = []
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
          try {
            if (contentRegex) {
              const content = await fs.readFile(fullPath, 'utf-8')
              if (!contentRegex.test(content)) continue
            }
            const stat = await fs.stat(fullPath)
            results.push({ path: fullPath, name: entry.name, isDirectory: false, size: stat.size })
          } catch { /* skip unreadable */ }
        }
      }
    } catch { /* skip dirs we can't read */ }
  }

  await walk(rootPath)
  return results
}

/** Local-filesystem search + folder-size handlers. */
export function registerSearchIPC(): void {
  ipcMain.handle(IPC_CHANNELS.CALC_FOLDER_SIZE, (_event, folderPath: string) =>
    calcFolderSize(folderPath)
  )

  ipcMain.handle(
    IPC_CHANNELS.SEARCH_FILES,
    (
      _event,
      rootPath: string,
      pattern: string,
      contentPattern: string,
      maxResults: number = 500
    ) => searchFiles(rootPath, pattern, contentPattern, maxResults)
  )
}
