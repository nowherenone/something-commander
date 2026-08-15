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

/** Extract a single file from a TAR (not the whole archive) then stream it. */
async function tarCreateReadStream(source: SourceAccess, entryPath: string): Promise<NodeJS.ReadableStream | null> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sc-tar-one-'))
  try {
    const result = await tarExtract(source, entryPath, tmpDir)
    if (!result.success) {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
      return null
    }
    const extracted = path.join(tmpDir, ...entryPath.split('/').filter(Boolean))
    try {
      await fs.access(extracted)
    } catch {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
      return null
    }
    const stream = fsSync.createReadStream(extracted, { highWaterMark: 256 * 1024 })
    const cleanup = (): void => {
      void fs.rm(tmpDir, { recursive: true, force: true })
    }
    stream.on('close', cleanup)
    stream.on('error', cleanup)
    return stream
  } catch {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
    return null
  }
}

/** Extract entries from a TAR to a local destination directory. */
async function tarExtract(
  source: SourceAccess,
  entryPath: string,
  destDir: string,
  onProgress?: (p: {
    currentFile: string
    filesDone: number
    bytesDone: number
    currentFileBytes?: number
    currentFileSize?: number
  }) => void,
  signal?: AbortSignal
): Promise<{ success: boolean; error?: string; count: number }> {
  try {
    if (signal?.aborted) return { success: false, error: 'Cancelled', count: 0 }
    await fs.mkdir(destDir, { recursive: true })
    const filter = entryPath
      ? entryPath.endsWith('/')
        ? (p: string): boolean => p.startsWith(entryPath)
        : (p: string): boolean => p === entryPath
      : undefined

    const isSingleFile = !!entryPath && !entryPath.endsWith('/')
    const destFile = isSingleFile
      ? path.join(destDir, ...entryPath.replace(/\\/g, '/').split('/').filter(Boolean))
      : ''

    let count = 0
    let bytesDone = 0
    let currentFileSize = 0
    let pollTimer: ReturnType<typeof setInterval> | null = null
    if (onProgress && isSingleFile) {
      pollTimer = setInterval(() => {
        void fs.stat(destFile).then(
          (st) => {
            onProgress({
              currentFile: entryPath,
              filesDone: count,
              bytesDone,
              currentFileBytes: st.size,
              currentFileSize: currentFileSize || st.size
            })
          },
          () => {
            /* not created yet */
          }
        )
      }, 80)
    }

    const extractStream = tar.extract({
      cwd: destDir,
      filter,
      onentry: (entry) => {
        const isDir = entry.type === 'Directory' || entry.path.endsWith('/')
        if (isDir) return
        currentFileSize = entry.size ?? 0
        if (!isSingleFile) {
          count++
          bytesDone += currentFileSize
        }
        onProgress?.({
          currentFile: entry.path,
          filesDone: isSingleFile ? 0 : count,
          bytesDone,
          currentFileBytes: 0,
          currentFileSize
        })
      }
    })
    const readStream = source.createReadStream()
    const abortTar = (): void => {
      try {
        ;(readStream as { destroy?: (e?: Error) => void }).destroy?.(new Error('Cancelled'))
      } catch { /* ignore */ }
      try {
        ;(extractStream as { destroy?: (e?: Error) => void }).destroy?.(new Error('Cancelled'))
      } catch { /* ignore */ }
    }
    if (signal) {
      if (signal.aborted) abortTar()
      else signal.addEventListener('abort', abortTar, { once: true })
    }
    try {
      await new Promise<void>((resolve, reject) => {
        readStream.pipe(extractStream)
        extractStream.on('end', resolve)
        extractStream.on('error', reject)
        readStream.on('error', reject)
      })
    } finally {
      if (pollTimer) clearInterval(pollTimer)
    }
    if (signal?.aborted) return { success: false, error: 'Cancelled', count }

    if (isSingleFile) {
      let written = 0
      try {
        written = (await fs.stat(destFile)).size
      } catch {
        written = currentFileSize
      }
      count = 1
      bytesDone = written
      onProgress?.({
        currentFile: entryPath,
        filesDone: 1,
        bytesDone: written,
        currentFileBytes: written,
        currentFileSize: currentFileSize || written
      })
    }

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
