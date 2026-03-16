import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { exec } from 'child_process'
import type {
  BrowsePlugin,
  PluginManifest,
  ReadDirectoryResult,
  Entry,
  PluginOperation,
  OperationRequest,
  OperationResult
} from '@shared/types'

export class LocalFilesystemPlugin implements BrowsePlugin {
  readonly manifest: PluginManifest = {
    id: 'local-filesystem',
    displayName: 'Local Filesystem',
    version: '1.0.0',
    iconHint: 'hard-drive',
    schemes: ['file']
  }

  async initialize(): Promise<boolean> {
    return true
  }

  async dispose(): Promise<void> {
    // nothing to clean up
  }

  async readDirectory(locationId: string | null): Promise<ReadDirectoryResult> {
    if (locationId === null) {
      return this.listRoots()
    }

    const normalizedPath = path.resolve(locationId)
    const dirents = await fs.readdir(normalizedPath, { withFileTypes: true })

    const entries: Entry[] = []
    for (const dirent of dirents) {
      try {
        entries.push(await this.direntToEntry(normalizedPath, dirent))
      } catch {
        // Skip entries we can't stat (permission denied, etc.)
      }
    }

    const parentDir = path.dirname(normalizedPath)
    const parentId = parentDir !== normalizedPath ? parentDir : null

    return {
      entries,
      location: normalizedPath,
      parentId
    }
  }

  async resolveLocation(input: string): Promise<string | null> {
    try {
      const resolved = path.resolve(input)
      await fs.access(resolved)
      return resolved
    } catch {
      return null
    }
  }

  getSupportedOperations(): PluginOperation[] {
    return ['copy', 'move', 'delete', 'rename', 'createDirectory']
  }

  async executeOperation(op: OperationRequest): Promise<OperationResult> {
    try {
      switch (op.op) {
        case 'createDirectory':
          await fs.mkdir(path.join(op.parentLocationId, op.name), { recursive: true })
          return { success: true }

        case 'rename': {
          const dir = path.dirname(op.entry.id)
          await fs.rename(op.entry.id, path.join(dir, op.newName))
          return { success: true }
        }

        case 'delete': {
          const errors: Array<{ entryId: string; message: string }> = []
          for (const entry of op.entries) {
            try {
              await fs.rm(entry.id, { recursive: true })
            } catch (err) {
              errors.push({ entryId: entry.id, message: String(err) })
            }
          }
          return { success: errors.length === 0, errors: errors.length > 0 ? errors : undefined }
        }

        case 'copy': {
          const errors: Array<{ entryId: string; message: string }> = []
          for (const entry of op.sourceEntries) {
            try {
              const destPath = path.join(op.destinationLocationId, entry.name)
              if (entry.isContainer) {
                await this.copyDir(entry.id, destPath)
              } else {
                await fs.copyFile(entry.id, destPath)
              }
            } catch (err) {
              errors.push({ entryId: entry.id, message: String(err) })
            }
          }
          return { success: errors.length === 0, errors: errors.length > 0 ? errors : undefined }
        }

        case 'move': {
          const errors: Array<{ entryId: string; message: string }> = []
          for (const entry of op.sourceEntries) {
            try {
              const destPath = path.join(op.destinationLocationId, entry.name)
              try {
                await fs.rename(entry.id, destPath)
              } catch (err: unknown) {
                // Cross-device move: copy then delete
                if ((err as NodeJS.ErrnoException).code === 'EXDEV') {
                  if (entry.isContainer) {
                    await this.copyDir(entry.id, destPath)
                  } else {
                    await fs.copyFile(entry.id, destPath)
                  }
                  await fs.rm(entry.id, { recursive: true })
                } else {
                  throw err
                }
              }
            } catch (err) {
              errors.push({ entryId: entry.id, message: String(err) })
            }
          }
          return { success: errors.length === 0, errors: errors.length > 0 ? errors : undefined }
        }

        default:
          return { success: false, errors: [{ entryId: '', message: 'Unknown operation' }] }
      }
    } catch (err) {
      return { success: false, errors: [{ entryId: '', message: String(err) }] }
    }
  }

  private async direntToEntry(parentPath: string, dirent: import('fs').Dirent): Promise<Entry> {
    const fullPath = path.join(parentPath, dirent.name)
    const stat = await fs.stat(fullPath)
    const ext = dirent.isDirectory() ? '' : path.extname(dirent.name).slice(1).toLowerCase()

    return {
      id: fullPath,
      name: dirent.name,
      isContainer: dirent.isDirectory(),
      size: dirent.isDirectory() ? -1 : stat.size,
      modifiedAt: stat.mtimeMs,
      mimeType: dirent.isDirectory() ? 'inode/directory' : '',
      iconHint: dirent.isDirectory() ? 'folder' : this.getIconHint(ext),
      meta: { extension: ext },
      attributes: {
        readonly: false,
        hidden: dirent.name.startsWith('.'),
        symlink: dirent.isSymbolicLink()
      }
    }
  }

  private getIconHint(ext: string): string {
    const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp', 'ico']
    const archiveExts = ['zip', 'tar', 'gz', 'bz2', '7z', 'rar', 'xz']
    const codeExts = ['ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'go', 'java', 'c', 'cpp', 'h']
    const docExts = ['md', 'txt', 'pdf', 'doc', 'docx', 'rtf']

    if (imageExts.includes(ext)) return 'image'
    if (archiveExts.includes(ext)) return 'archive'
    if (codeExts.includes(ext)) return 'code'
    if (docExts.includes(ext)) return 'document'
    return 'file'
  }

  private async listRoots(): Promise<ReadDirectoryResult> {
    if (process.platform === 'win32') {
      return this.listWindowsDrives()
    }
    if (process.platform === 'darwin') {
      return this.listMacRoots()
    }
    return this.listLinuxRoots()
  }

  private async listLinuxRoots(): Promise<ReadDirectoryResult> {
    const entries: Entry[] = []

    const makeEntry = (id: string, name: string, icon: string): Entry => ({
      id,
      name,
      isContainer: true,
      size: -1,
      modifiedAt: 0,
      mimeType: 'inode/directory',
      iconHint: icon,
      meta: {},
      attributes: { readonly: false, hidden: false, symlink: false }
    })

    // Root filesystem
    entries.push(makeEntry('/', '/ (root)', 'drive'))

    // Home directory
    entries.push(makeEntry(os.homedir(), `~ (${os.userInfo().username})`, 'folder'))

    // Mount points from /mnt/
    try {
      const mntEntries = await fs.readdir('/mnt', { withFileTypes: true })
      for (const d of mntEntries) {
        if (d.isDirectory()) {
          entries.push(makeEntry(`/mnt/${d.name}`, `/mnt/${d.name}`, 'drive'))
        }
      }
    } catch { /* /mnt may not exist */ }

    // Media mount points from /media/$USER/
    try {
      const user = os.userInfo().username
      const mediaEntries = await fs.readdir(`/media/${user}`, { withFileTypes: true })
      for (const d of mediaEntries) {
        if (d.isDirectory()) {
          entries.push(makeEntry(`/media/${user}/${d.name}`, d.name, 'drive'))
        }
      }
    } catch { /* /media/$USER may not exist */ }

    // /run/media/$USER/ (Arch, Fedora)
    try {
      const user = os.userInfo().username
      const runMediaEntries = await fs.readdir(`/run/media/${user}`, { withFileTypes: true })
      for (const d of runMediaEntries) {
        if (d.isDirectory()) {
          entries.push(makeEntry(`/run/media/${user}/${d.name}`, d.name, 'drive'))
        }
      }
    } catch { /* may not exist */ }

    return { entries, location: 'Filesystems', parentId: null }
  }

  private async listMacRoots(): Promise<ReadDirectoryResult> {
    const entries: Entry[] = []

    const makeEntry = (id: string, name: string, icon: string): Entry => ({
      id,
      name,
      isContainer: true,
      size: -1,
      modifiedAt: 0,
      mimeType: 'inode/directory',
      iconHint: icon,
      meta: {},
      attributes: { readonly: false, hidden: false, symlink: false }
    })

    // Root
    entries.push(makeEntry('/', '/ (Macintosh HD)', 'drive'))
    // Home
    entries.push(makeEntry(os.homedir(), `~ (${os.userInfo().username})`, 'folder'))

    // Volumes
    try {
      const volumes = await fs.readdir('/Volumes', { withFileTypes: true })
      for (const v of volumes) {
        if (v.isDirectory() && v.name !== 'Macintosh HD') {
          entries.push(makeEntry(`/Volumes/${v.name}`, v.name, 'drive'))
        }
      }
    } catch { /* /Volumes may not exist */ }

    return { entries, location: 'Filesystems', parentId: null }
  }

  private async listWindowsDrives(): Promise<ReadDirectoryResult> {
    const entries: Entry[] = []

    // Get drive letters with labels via PowerShell
    const driveInfo = await this.getWindowsDriveInfo()
    for (const drive of driveInfo) {
      const label = drive.label ? ` [${drive.label}]` : ''
      entries.push({
        id: `${drive.letter}:\\`,
        name: `${drive.letter}:${label}`,
        isContainer: true,
        size: -1,
        modifiedAt: 0,
        mimeType: 'inode/directory',
        iconHint: 'drive',
        meta: { driveLabel: drive.label },
        attributes: { readonly: false, hidden: false, symlink: false }
      })
    }

    // WSL distributions
    const wslDistros = await this.listWslDistros()
    for (const distro of wslDistros) {
      entries.push({
        id: `//wsl.localhost/${distro}/`,
        name: `WSL: ${distro}`,
        isContainer: true,
        size: -1,
        modifiedAt: 0,
        mimeType: 'inode/directory',
        iconHint: 'network',
        meta: { wsl: true, distro },
        attributes: { readonly: false, hidden: false, symlink: false }
      })
    }

    return {
      entries,
      location: 'My Computer',
      parentId: null
    }
  }

  private getWindowsDriveInfo(): Promise<Array<{ letter: string; label: string }>> {
    return new Promise((resolve) => {
      exec(
        'powershell -Command "Get-PSDrive -PSProvider FileSystem | Select-Object Name,Description | ConvertTo-Json"',
        { timeout: 5000 },
        (err, stdout) => {
          if (err) {
            resolve(this.scanDriveLettersFallback())
            return
          }
          try {
            let data = JSON.parse(stdout.trim())
            if (!Array.isArray(data)) data = [data]
            const drives = data
              .filter((d: { Name: string }) => d.Name && d.Name.length === 1)
              .map((d: { Name: string; Description: string }) => ({
                letter: d.Name,
                label: d.Description || ''
              }))
              .sort((a: { letter: string }, b: { letter: string }) => a.letter.localeCompare(b.letter))
            resolve(drives)
          } catch {
            resolve(this.scanDriveLettersFallback())
          }
        }
      )
    })
  }

  private async scanDriveLettersFallback(): Promise<Array<{ letter: string; label: string }>> {
    const drives: Array<{ letter: string; label: string }> = []
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    for (const letter of letters) {
      try {
        await fs.access(`${letter}:\\`)
        drives.push({ letter, label: '' })
      } catch { /* skip */ }
    }
    return drives
  }

  private listWslDistros(): Promise<string[]> {
    return new Promise((resolve) => {
      exec('wsl --list --quiet', { timeout: 3000 }, (err, stdout) => {
        if (err) {
          resolve([])
          return
        }
        // wsl --list outputs UTF-16 with extra null bytes, clean it up
        const cleaned = stdout.replace(/\0/g, '').trim()
        const distros = cleaned
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
        resolve(distros)
      })
    })
  }

  private async copyDir(src: string, dest: string): Promise<void> {
    await fs.mkdir(dest, { recursive: true })
    const dirents = await fs.readdir(src, { withFileTypes: true })
    for (const dirent of dirents) {
      const srcPath = path.join(src, dirent.name)
      const destPath = path.join(dest, dirent.name)
      if (dirent.isDirectory()) {
        await this.copyDir(srcPath, destPath)
      } else {
        await fs.copyFile(srcPath, destPath)
      }
    }
  }

  static getDefaultLocation(): string {
    return os.homedir()
  }
}
