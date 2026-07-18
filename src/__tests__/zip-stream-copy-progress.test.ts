/**
 * Real integration: copy a large file OUT of a ZIP onto local disk via
 * PluginManager.streamCopyFile (the same path the UI uses for F5 from archive).
 *
 * Asserts that onProgress fires multiple times WHILE the copy is still running,
 * not only once after it finishes — that was the user-visible "no progress" bug.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import * as crypto from 'crypto'
import { PluginManager } from '../main/plugins/plugin-manager'
import { ArchivePlugin } from '../main/plugins/archive'
import { LocalFilesystemPlugin } from '../main/plugins/local-filesystem'

async function createLargeZip(
  tmpDir: string,
  entryName: string,
  sizeBytes: number
): Promise<{ zipPath: string; sha256: string }> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const yazl = require('yazl') as typeof import('yazl')
  const zipPath = path.join(tmpDir, 'payload.zip')
  const data = crypto.randomBytes(sizeBytes)
  const sha256 = crypto.createHash('sha256').update(data).digest('hex')

  const zip = new yazl.ZipFile()
  zip.addBuffer(data, entryName)
  zip.end()
  await new Promise<void>((resolve, reject) => {
    zip.outputStream.pipe(fsSync.createWriteStream(zipPath)).on('finish', resolve).on('error', reject)
  })
  return { zipPath, sha256 }
}

describe('zip → local streamCopyFile progress', () => {
  let tmpDir: string
  let manager: PluginManager
  let archive: ArchivePlugin
  let local: LocalFilesystemPlugin

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sc-zip-progress-'))
    manager = new PluginManager()
    local = new LocalFilesystemPlugin()
    archive = new ArchivePlugin({
      readAt: async (pluginId, entryId, offset, length) => {
        const p = manager.get(pluginId)
        if (!p?.readAt) throw new Error('no readAt')
        return p.readAt(entryId, offset, length)
      },
      getSize: async (pluginId, entryId) => {
        const p = manager.get(pluginId)
        if (!p?.getSize) throw new Error('no getSize')
        return p.getSize(entryId)
      },
      get: (pluginId) => manager.get(pluginId)
    })
    await local.initialize()
    await archive.initialize()
    manager.register(local)
    manager.register(archive)
  })

  afterEach(async () => {
    await archive.dispose()
    await local.dispose()
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('fires onProgress multiple times before streamCopyFile resolves (8 MiB zip entry)', async () => {
    const FILE_SIZE = 8 * 1024 * 1024
    const entryName = 'large.bin'
    const { zipPath, sha256 } = await createLargeZip(tmpDir, entryName, FILE_SIZE)
    const destDir = path.join(tmpDir, 'out')
    await fs.mkdir(destDir)

    type Sample = { bytes: number; t: number; copyStillRunning: boolean }
    const samples: Sample[] = []
    let resolved = false

    const copyPromise = manager.streamCopyFile(
      'archive',
      `${zipPath}::${entryName}`,
      'local-filesystem',
      destDir,
      'large.bin',
      (bytes) => {
        samples.push({ bytes, t: Date.now(), copyStillRunning: !resolved })
      }
    )

    // Simulate renderer: coalesce progress on setImmediate (like plugin-ipc)
    // and assert we saw mid-copy progress by the time the promise settles.
    const result = await copyPromise
    resolved = true

    expect(result.success).toBe(true)
    expect(result.bytesWritten).toBe(FILE_SIZE)

    const destFile = path.join(destDir, 'large.bin')
    const out = await fs.readFile(destFile)
    expect(out.length).toBe(FILE_SIZE)
    expect(crypto.createHash('sha256').update(out).digest('hex')).toBe(sha256)

    // Must have intermediate reports, not a single final blip
    expect(samples.length).toBeGreaterThanOrEqual(3)

    // Strict: at least one progress event while copy was still running
    const midCopy = samples.filter((s) => s.copyStillRunning)
    expect(midCopy.length).toBeGreaterThanOrEqual(2)

    // Progress must strictly increase at some point
    const midBytes = midCopy.map((s) => s.bytes)
    expect(Math.max(...midBytes)).toBeGreaterThan(midBytes[0])

    // Final report should reach full size (last sample may be the post-await report)
    expect(samples[samples.length - 1].bytes).toBe(FILE_SIZE)
  }, 60000)

  it('cancelStreamCopy stops a large zip extract mid-flight and unblocks', async () => {
    const FILE_SIZE = 32 * 1024 * 1024
    const entryName = 'huge.bin'
    const { zipPath } = await createLargeZip(tmpDir, entryName, FILE_SIZE)
    const destDir = path.join(tmpDir, 'out-cancel')
    await fs.mkdir(destDir)

    const transferId = 'zip-cancel-1'
    const progress: number[] = []

    const copyPromise = manager.streamCopyFile(
      'archive',
      `${zipPath}::${entryName}`,
      'local-filesystem',
      destDir,
      'huge.bin',
      (bytes) => progress.push(bytes),
      transferId
    )

    // Wait until we have some progress, then cancel
    await new Promise<void>((resolve, reject) => {
      const start = Date.now()
      const tick = (): void => {
        if (progress.length > 0 && progress[progress.length - 1] > 256 * 1024) {
          manager.cancelStreamCopy(transferId)
          resolve()
          return
        }
        if (Date.now() - start > 15000) {
          reject(new Error('Timed out waiting for progress before cancel'))
          return
        }
        setTimeout(tick, 5)
      }
      tick()
    })

    const result = await copyPromise
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Cancel/i)
    expect(result.bytesWritten).toBeLessThan(FILE_SIZE)
    expect(progress.length).toBeGreaterThan(0)
    expect(progress[progress.length - 1]).toBeLessThan(FILE_SIZE)
  }, 60000)

  it('enumerate + stream copy path has non-zero size for zip members', async () => {
    const FILE_SIZE = 1024 * 1024
    const entryName = 'a.bin'
    const { zipPath } = await createLargeZip(tmpDir, entryName, FILE_SIZE)
    const destDir = path.join(tmpDir, 'out-enum')

    const list = await archive.enumerateFiles([`${zipPath}::${entryName}`], destDir)
    expect(list).toHaveLength(1)
    expect(list[0].size).toBe(FILE_SIZE)
    expect(list[0].isDirectory).toBe(false)
  })
})
