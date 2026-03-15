import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
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
    // On macOS/Linux, just return the root
    return this.readDirectory('/')
  }

  private async listWindowsDrives(): Promise<ReadDirectoryResult> {
    const entries: Entry[] = []
    // Check common drive letters
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    for (const letter of letters) {
      const drivePath = `${letter}:\\`
      try {
        await fs.access(drivePath)
        entries.push({
          id: drivePath,
          name: `${letter}:`,
          isContainer: true,
          size: -1,
          modifiedAt: 0,
          mimeType: 'inode/directory',
          iconHint: 'drive',
          meta: {},
          attributes: { readonly: false, hidden: false, symlink: false }
        })
      } catch {
        // Drive doesn't exist or isn't accessible
      }
    }
    return {
      entries,
      location: 'My Computer',
      parentId: null
    }
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
