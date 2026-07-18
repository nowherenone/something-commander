import * as path from 'path'
import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import * as os from 'os'
import { pipeline } from 'stream/promises'
import _7z from '7zip-min'
import type { ListItem } from '7zip-min'
import type { ArchiveDriver, ArchiveEntry } from '../driver'
import type { SourceAccess } from '../plugin-reader'
import { ensure7zaExecutable, resolve7zaBinaryPath } from '../sevenz-binary'

const sevenZBinaryPath = resolve7zaBinaryPath()
ensure7zaExecutable(sevenZBinaryPath)
_7z.config({ binaryPath: sevenZBinaryPath })

interface ResolvedArchive {
  path: string
  cleanup: () => Promise<void>
}

const SEVENZ_MAGIC = Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])

function formatSevenZError(err: unknown, archivePath: string): Error {
  const message = err instanceof Error ? err.message : String(err)
  if (message.startsWith('Cannot open ')) {
    return err instanceof Error ? err : new Error(message)
  }
  const name = path.basename(archivePath)
  if (message.includes('ENOTDIR') || message.includes('ENOENT')) {
    return new Error(`Cannot open ${name}: 7-Zip binary is unavailable`)
  }
  const stderr =
    err && typeof err === 'object' && 'stderr' in err
      ? String((err as { stderr?: string }).stderr ?? '')
      : ''
  if (stderr.includes('Is not archive') || stderr.includes('Cannot open the file as [7z]')) {
    return new Error(`Cannot open ${name}: file is not a valid 7z archive`)
  }
  return new Error(`Cannot open ${name}: ${message}`)
}

async function assertSevenZSignature(filePath: string): Promise<void> {
  const fd = await fs.open(filePath, 'r')
  try {
    const header = Buffer.alloc(SEVENZ_MAGIC.length)
    const { bytesRead } = await fd.read(header, 0, header.length, 0)
    if (bytesRead < SEVENZ_MAGIC.length || !header.equals(SEVENZ_MAGIC)) {
      throw new Error(`Cannot open ${path.basename(filePath)}: file is not a valid 7z archive`)
    }
  } finally {
    await fd.close()
  }
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
    await assertSevenZSignature(resolved.path)
    const items = await _7z.list(resolved.path)
    return items.map(listItemToArchiveEntry)
  } catch (err) {
    throw formatSevenZError(err, resolved.path)
  } finally {
    await resolved.cleanup()
  }
}

/** Full-archive extract cache so multi-file reads don't re-run 7za per file. */
const sevenZExtractCache = new Map<string, { dir: string; expires: number }>()
const SEVENZ_CACHE_TTL_MS = 5 * 60 * 1000

function sevenZCacheKey(archivePath: string): string {
  return archivePath
}

async function getSevenZExtractCache(archivePath: string): Promise<string> {
  const key = sevenZCacheKey(archivePath)
  const hit = sevenZExtractCache.get(key)
  if (hit && hit.expires > Date.now()) {
    hit.expires = Date.now() + SEVENZ_CACHE_TTL_MS
    return hit.dir
  }
  if (hit) {
    await fs.rm(hit.dir, { recursive: true, force: true }).catch(() => {})
    sevenZExtractCache.delete(key)
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sc-7z-cache-'))
  await _7z.unpack(archivePath, tmpDir)
  sevenZExtractCache.set(key, { dir: tmpDir, expires: Date.now() + SEVENZ_CACHE_TTL_MS })
  return tmpDir
}

async function sevenZCreateReadStream(
  source: SourceAccess,
  entryPath: string
): Promise<NodeJS.ReadableStream | null> {
  const resolved = await resolveLocalArchive(source)
  try {
    const cacheDir = await getSevenZExtractCache(resolved.path)
    const internalPath = entryPath.replace(/\\/g, '/')
    const extracted = path.join(cacheDir, ...internalPath.split('/').filter(Boolean))
    try {
      await fs.access(extracted)
    } catch {
      return null
    }
    return fsSync.createReadStream(extracted)
  } catch {
    return null
  } finally {
    await resolved.cleanup()
  }
}

async function sevenZExtract(
  source: SourceAccess,
  entryPath: string,
  destDir: string,
  onProgress?: (p: { currentFile: string; filesDone: number; bytesDone: number }) => void
): Promise<{ success: boolean; error?: string; count: number }> {
  const resolved = await resolveLocalArchive(source)
  try {
    await fs.mkdir(destDir, { recursive: true })
    const prefix = entryPath ? entryPath.replace(/\\/g, '/') : ''
    const isExactFile = prefix !== '' && !prefix.endsWith('/')

    const items = await _7z.list(resolved.path)
    const entries = items.map(listItemToArchiveEntry)
    const matchingFiles = isExactFile
      ? entries.filter((e) => !e.isDirectory && e.path === prefix)
      : prefix
        ? entries.filter((e) => !e.isDirectory && e.path.startsWith(prefix))
        : entries.filter((e) => !e.isDirectory)

    // When a progress callback is provided, extract file-by-file so the UI can
    // advance between entries. Bulk unpack is used when no progress is needed.
    if (onProgress && matchingFiles.length > 0 && !isExactFile) {
      let filesDone = 0
      let bytesDone = 0
      onProgress({
        currentFile: matchingFiles[0].path,
        filesDone: 0,
        bytesDone: 0
      })
      for (const file of matchingFiles) {
        await _7z.unpackSome(resolved.path, [file.path], destDir)
        filesDone++
        bytesDone += file.size
        onProgress({ currentFile: file.path, filesDone, bytesDone })
      }
      return { success: true, count: matchingFiles.length }
    }

    if (!prefix) {
      await _7z.unpack(resolved.path, destDir)
    } else {
      await _7z.unpackSome(resolved.path, [prefix], destDir)
    }

    const totalBytes = matchingFiles.reduce((s, e) => s + e.size, 0)
    onProgress?.({
      currentFile: matchingFiles[matchingFiles.length - 1]?.path || path.basename(resolved.path),
      filesDone: matchingFiles.length,
      bytesDone: totalBytes
    })
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