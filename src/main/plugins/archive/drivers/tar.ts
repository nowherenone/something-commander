import * as path from 'path'
import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import * as os from 'os'
import tar from 'tar'
import type { ArchiveDriver, ArchiveEntry } from '../driver'

// ─── Shared read logic ─────────────────────────────────────────────────────────

async function tarReadEntries(archivePath: string): Promise<ArchiveEntry[]> {
  const entries: ArchiveEntry[] = []
  await tar.list({
    file: archivePath,
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
  return entries
}

async function tarCreateReadStream(archivePath: string, entryPath: string): Promise<NodeJS.ReadableStream | null> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sc-tar-'))
  try {
    await tar.extract({ file: archivePath, cwd: tmpDir, filter: (p) => p === entryPath })
    const extracted = path.join(tmpDir, ...entryPath.split('/').filter(Boolean))
    try { await fs.access(extracted) } catch {
      await fs.rm(tmpDir, { recursive: true, force: true })
      return null
    }
    const stream = fsSync.createReadStream(extracted)
    stream.on('close', () => { fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {}) })
    return stream
  } catch {
    await fs.rm(tmpDir, { recursive: true, force: true })
    return null
  }
}

async function tarExtract(
  archivePath: string,
  entryPath: string,
  destDir: string
): Promise<{ success: boolean; error?: string; count: number }> {
  try {
    await fs.mkdir(destDir, { recursive: true })
    if (!entryPath) {
      await tar.extract({ file: archivePath, cwd: destDir })
      const all = await tarReadEntries(archivePath)
      return { success: true, count: all.filter((e) => !e.isDirectory).length }
    }
    if (entryPath.endsWith('/')) {
      await tar.extract({ file: archivePath, cwd: destDir, filter: (p) => p.startsWith(entryPath) })
      const all = await tarReadEntries(archivePath)
      return { success: true, count: all.filter((e) => !e.isDirectory && e.path.startsWith(entryPath)).length }
    }
    await tar.extract({ file: archivePath, cwd: destDir, filter: (p) => p === entryPath })
    return { success: true, count: 1 }
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
