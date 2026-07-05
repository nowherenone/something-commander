import * as path from 'path'
import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import * as os from 'os'
import { pipeline } from 'stream/promises'
import _7z from '7zip-min'
import type { ListItem } from '7zip-min'
import type { ArchiveDriver, ArchiveEntry } from '../driver'
import type { SourceAccess } from '../plugin-reader'

interface ResolvedArchive {
  path: string
  cleanup: () => Promise<void>
}

/** Ensure the archive is available as a local file path for 7za. */
async function resolveLocalArchive(source: SourceAccess): Promise<ResolvedArchive> {
  if (source.localPath) {
    return { path: source.localPath, cleanup: async () => {} }
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sc-7z-'))
  const archivePath = path.join(tmpDir, 'archive.7z')
  await pipeline(source.createReadStream(), fsSync.createWriteStream(archivePath))
  return {
    path: archivePath,
    cleanup: async () => { await fs.rm(tmpDir, { recursive: true, force: true }) }
  }
}

function isDirectoryItem(item: ListItem): boolean {
  return item.attr?.includes('D') === true || item.name.endsWith('/')
}

function parseModifiedAt(item: ListItem): Date {
  if (item.date && item.time) {
    const parsed = new Date(`${item.date}T${item.time}`)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  return new Date(0)
}

function normalizeEntryPath(name: string, isDirectory: boolean): string {
  const normalized = name.replace(/\\/g, '/')
  if (isDirectory && !normalized.endsWith('/')) return normalized + '/'
  return normalized
}

function listItemToArchiveEntry(item: ListItem): ArchiveEntry {
  const isDirectory = isDirectoryItem(item)
  return {
    path: normalizeEntryPath(item.name, isDirectory),
    size: isDirectory ? 0 : Number.parseInt(item.size ?? '0', 10) || 0,
    modifiedAt: parseModifiedAt(item),
    isDirectory
  }
}

async function sevenZReadEntries(source: SourceAccess): Promise<ArchiveEntry[]> {
  const resolved = await resolveLocalArchive(source)
  try {
    const items = await _7z.list(resolved.path)
    return items.map(listItemToArchiveEntry)
  } finally {
    await resolved.cleanup()
  }
}

async function sevenZCreateReadStream(
  source: SourceAccess,
  entryPath: string
): Promise<NodeJS.ReadableStream | null> {
  const resolved = await resolveLocalArchive(source)
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sc-7zread-'))
  try {
    const internalPath = entryPath.replace(/\\/g, '/')
    await _7z.unpackSome(resolved.path, [internalPath], tmpDir)

    const extracted = path.join(tmpDir, ...internalPath.split('/').filter(Boolean))
    try {
      await fs.access(extracted)
    } catch {
      return null
    }

    const stream = fsSync.createReadStream(extracted)
    stream.on('close', () => {
      fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
    })
    return stream
  } catch {
    await fs.rm(tmpDir, { recursive: true, force: true })
    return null
  } finally {
    await resolved.cleanup()
  }
}

async function sevenZExtract(
  source: SourceAccess,
  entryPath: string,
  destDir: string
): Promise<{ success: boolean; error?: string; count: number }> {
  const resolved = await resolveLocalArchive(source)
  try {
    await fs.mkdir(destDir, { recursive: true })
    const prefix = entryPath ? entryPath.replace(/\\/g, '/') : ''
    const isExactFile = prefix !== '' && !prefix.endsWith('/')

    if (!prefix) {
      await _7z.unpack(resolved.path, destDir)
    } else {
      await _7z.unpackSome(resolved.path, [prefix], destDir)
    }

    const items = await _7z.list(resolved.path)
    const entries = items.map(listItemToArchiveEntry)
    const matchingFiles = isExactFile
      ? entries.filter((e) => !e.isDirectory && e.path === prefix)
      : prefix
        ? entries.filter((e) => !e.isDirectory && e.path.startsWith(prefix))
        : entries.filter((e) => !e.isDirectory)

    return { success: true, count: matchingFiles.length }
  } catch (err) {
    return { success: false, error: String(err), count: 0 }
  } finally {
    await resolved.cleanup()
  }
}

/** Read-only driver for .7z archives via bundled 7za binary. */
export class SevenZDriver implements ArchiveDriver {
  readonly extensions = ['.7z'] as const
  readonly supportsWrite = false

  readEntries = sevenZReadEntries
  createReadStream = sevenZCreateReadStream
  extract = sevenZExtract
}