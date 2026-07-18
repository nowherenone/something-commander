import * as path from 'path'
import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import * as os from 'os'
import tar from 'tar'
import type { ArchiveDriver, ArchiveEntry } from '../driver'
import type { SourceAccess } from '../plugin-reader'

// ─── Shared read logic ─────────────────────────────────────────────────────────

/** Read TAR entries by piping the source stream into tar.list(). */
async function tarReadEntries(source: SourceAccess): Promise<ArchiveEntry[]> {
  const entries: ArchiveEntry[] = []
  const listStream = tar.list({
    onentry: (entry) => {
      const isDir = entry.type === 'Directory' || entry.path.endsWith('/')
      const entryPath = isDir && !entry.path.endsWith('/') ? entry.path + '/' : entry.path
      entries.push({
        path: entryPath,
        size: entry.size ?? 0,
        modifiedAt: entry.mtime ?? new Date(),
        isDirectory: isDir
      })
    }
  })
  const readStream = source.createReadStream()
  await new Promise<void>((resolve, reject) => {
    readStream.pipe(listStream)
    listStream.on('end', resolve)
    listStream.on('error', reject)
    readStream.on('error', reject)
  })
  return entries
}

/** Full-archive extract cache so multi-file reads don't re-scan the tar each time. */
const tarExtractCache = new Map<string, { dir: string; expires: number }>()
const TAR_CACHE_TTL_MS = 5 * 60 * 1000

function tarCacheKey(source: SourceAccess): string {
  return source.localPath || `remote:${source.totalSize}`
}

async function getTarExtractCache(source: SourceAccess): Promise<string> {
  const key = tarCacheKey(source)
  const hit = tarExtractCache.get(key)
  if (hit && hit.expires > Date.now()) {
    hit.expires = Date.now() + TAR_CACHE_TTL_MS
    return hit.dir
  }
  if (hit) {
    await fs.rm(hit.dir, { recursive: true, force: true }).catch(() => {})
    tarExtractCache.delete(key)
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sc-tar-cache-'))
  const extractStream = tar.extract({ cwd: tmpDir })
  const readStream = source.createReadStream()
  await new Promise<void>((resolve, reject) => {
    readStream.pipe(extractStream)
    extractStream.on('end', resolve)
    extractStream.on('error', reject)
    readStream.on('error', reject)
  })
  tarExtractCache.set(key, { dir: tmpDir, expires: Date.now() + TAR_CACHE_TTL_MS })
  return tmpDir
}

/** Extract a single file from a TAR via full-archive cache (avoids N full rescans). */
async function tarCreateReadStream(source: SourceAccess, entryPath: string): Promise<NodeJS.ReadableStream | null> {
  try {
    const cacheDir = await getTarExtractCache(source)
    const extracted = path.join(cacheDir, ...entryPath.split('/').filter(Boolean))
    try {
      await fs.access(extracted)
    } catch {
      return null
    }
    return fsSync.createReadStream(extracted)
  } catch {
    return null
  }
}

/** Extract entries from a TAR to a local destination directory. */
async function tarExtract(
  source: SourceAccess,
  entryPath: string,
  destDir: string,
  onProgress?: (p: { currentFile: string; filesDone: number; bytesDone: number }) => void
): Promise<{ success: boolean; error?: string; count: number }> {
  try {
    await fs.mkdir(destDir, { recursive: true })
    const filter = entryPath
      ? entryPath.endsWith('/')
        ? (p: string): boolean => p.startsWith(entryPath)
        : (p: string): boolean => p === entryPath
      : undefined

    let count = 0
    let bytesDone = 0
    const extractStream = tar.extract({
      cwd: destDir,
      filter,
      onentry: (entry) => {
        const isDir = entry.type === 'Directory' || entry.path.endsWith('/')
        if (isDir) return
        count++
        bytesDone += entry.size ?? 0
        onProgress?.({
          currentFile: entry.path,
          filesDone: count,
          bytesDone
        })
      }
    })
    const readStream = source.createReadStream()
    await new Promise<void>((resolve, reject) => {
      readStream.pipe(extractStream)
      extractStream.on('end', resolve)
      extractStream.on('error', reject)
      readStream.on('error', reject)
    })

    return { success: true, count }
  } catch (err) {
    return { success: false, error: String(err), count: 0 }
  }
}

/** Collect all relative file paths under a directory (for tar.c). */
async function gatherRelativePaths(dir: string, base = dir): Promise<string[]> {
  const result: string[] = []
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      result.push(...await gatherRelativePaths(full, base))
    } else {
      result.push(path.relative(base, full).replace(/\\/g, '/'))
    }
  }
  return result
}

// ─── TarDriver (.tar, .tar.gz, .tgz) — writable ───────────────────────────────

export class TarDriver implements ArchiveDriver {
  readonly extensions = ['.tar', '.tar.gz', '.tgz'] as const
  readonly supportsWrite = true

  readEntries = tarReadEntries
  createReadStream = tarCreateReadStream
  extract = tarExtract

  async addFromStream(
    archivePath: string,
    entryPath: string,
    stream: NodeJS.ReadableStream
  ): Promise<{ success: boolean; bytesWritten: number; error?: string }> {
    const isGzip = archivePath.toLowerCase().endsWith('.tar.gz') || archivePath.toLowerCase().endsWith('.tgz')
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sc-taradd-'))
    try {
      // If archive already exists, extract its contents into tmpDir first
      const archiveExists = await fs.access(archivePath).then(() => true).catch(() => false)
      if (archiveExists) {
        await tar.extract({ file: archivePath, cwd: tmpDir })
      }

      // Write incoming stream to the correct path within tmpDir
      const destFile = path.join(tmpDir, ...entryPath.split('/').filter(Boolean))
      await fs.mkdir(path.dirname(destFile), { recursive: true })
      const bytesWritten = await new Promise<number>((resolve, reject) => {
        let bytes = 0
        const dest = fsSync.createWriteStream(destFile)
        stream.on('data', (chunk: Buffer) => { bytes += chunk.length })
        stream.on('error', reject)
        dest.on('error', reject)
        dest.on('finish', () => resolve(bytes))
        stream.pipe(dest)
      })

      // Rebuild the archive from tmpDir
      const relPaths = await gatherRelativePaths(tmpDir)
      if (relPaths.length > 0) {
        await tar.c({ file: archivePath, cwd: tmpDir, gzip: isGzip }, relPaths)
      }

      return { success: true, bytesWritten }
    } catch (err) {
      return { success: false, bytesWritten: 0, error: String(err) }
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
  }
}

// ─── TarReadOnlyDriver (.tar.bz2, .tar.xz, etc.) — read-only ─────────────────
// node-tar does not natively write bzip2 or xz compressed archives.

export class TarReadOnlyDriver implements ArchiveDriver {
  readonly extensions = ['.tar.bz2', '.tbz2', '.tar.xz', '.txz'] as const
  readonly supportsWrite = false

  readEntries = tarReadEntries
  createReadStream = tarCreateReadStream
  extract = tarExtract
}
