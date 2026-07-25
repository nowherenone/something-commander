/**
 * Bulk ZipDriver.extract (Alt+F9 / whole-archive unpack) must report mid-file
 * progress for a single large entry — not only 0% then 100% after inflate.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import * as crypto from 'crypto'
import { ZipDriver } from '../main/plugins/archive/drivers/zip'
import type { SourceAccess } from '../main/plugins/archive/plugin-reader'
import type { ExtractProgress } from '../main/plugins/archive/driver'

function localSource(filePath: string): SourceAccess {
  let cachedSize: number | null = null
  return {
    localPath: filePath,
    async readAt(offset: number, length: number): Promise<Buffer> {
      const fd = await fs.open(filePath, 'r')
      try {
        const buf = Buffer.alloc(length)
        const { bytesRead } = await fd.read(buf, 0, length, offset)
        return bytesRead < length ? buf.subarray(0, bytesRead) : buf
      } finally {
        await fd.close()
      }
    },
    createReadStream(): NodeJS.ReadableStream {
      return fsSync.createReadStream(filePath, { highWaterMark: 256 * 1024 })
    },
    get totalSize(): number {
      if (cachedSize === null) {
        cachedSize = fsSync.statSync(filePath).size
      }
      return cachedSize
    }
  }
}

async function createLargeZip(
  tmpDir: string,
  entryName: string,
  sizeBytes: number
): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const yazl = require('yazl') as typeof import('yazl')
  const zipPath = path.join(tmpDir, 'payload.zip')
  const data = crypto.randomBytes(sizeBytes)
  const zip = new yazl.ZipFile()
  zip.addBuffer(data, entryName)
  zip.end()
  await new Promise<void>((resolve, reject) => {
    zip.outputStream.pipe(fsSync.createWriteStream(zipPath)).on('finish', resolve).on('error', reject)
  })
  return zipPath
}

describe('ZipDriver.extract single large file progress', () => {
  let tmpDir: string
  const driver = new ZipDriver()

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sc-zip-extract-prog-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('fires multiple mid-file progress events before extract resolves (16 MiB)', async () => {
    const FILE_SIZE = 16 * 1024 * 1024
    const zipPath = await createLargeZip(tmpDir, 'huge.bin', FILE_SIZE)
    const destDir = path.join(tmpDir, 'out')
    await fs.mkdir(destDir)

    type Sample = ExtractProgress & { extractStillRunning: boolean }
    const samples: Sample[] = []
    let resolved = false

    const extractPromise = driver.extract(localSource(zipPath), '', destDir, (p) => {
      samples.push({ ...p, extractStillRunning: !resolved })
    })

    // Simulate renderer IPC coalesce (setImmediate flush) while extract runs.
    const result = await extractPromise
    resolved = true

    expect(result.success).toBe(true)
    expect(result.count).toBe(1)

    const out = await fs.readFile(path.join(destDir, 'huge.bin'))
    expect(out.length).toBe(FILE_SIZE)

    // Must have intermediate reports, not a single final blip
    expect(samples.length).toBeGreaterThanOrEqual(4)

    // Progress while extract is still running (not only a post-resolve blip)
    const mid = samples.filter((s) => s.extractStillRunning && (s.currentFileBytes ?? 0) > 0)
    expect(mid.length).toBeGreaterThanOrEqual(2)

    const midBytes = mid.map((s) => s.currentFileBytes ?? 0)
    expect(Math.max(...midBytes)).toBeGreaterThan(midBytes[0])
    // At least one sample must be strictly partial (not only 0 then 100%)
    expect(midBytes.some((b) => b > 0 && b < FILE_SIZE)).toBe(true)

    // Final sample should show completion
    const last = samples[samples.length - 1]
    expect(last.filesDone).toBe(1)
    expect(last.currentFileBytes ?? 0).toBeGreaterThanOrEqual(FILE_SIZE * 0.99)
  }, 60000)

  it('reports currentFileSize so the UI can show a determinate bar', async () => {
    const FILE_SIZE = 2 * 1024 * 1024
    const zipPath = await createLargeZip(tmpDir, 'a.bin', FILE_SIZE)
    const destDir = path.join(tmpDir, 'out2')
    await fs.mkdir(destDir)

    const sizes: number[] = []
    await driver.extract(localSource(zipPath), '', destDir, (p) => {
      if (p.currentFileSize) sizes.push(p.currentFileSize)
    })

    expect(sizes.length).toBeGreaterThan(0)
    expect(sizes.every((s) => s === FILE_SIZE)).toBe(true)
  }, 30000)
})
