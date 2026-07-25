/**
 * Transfer progress poll must update the op store while a zip→local stream
 * copy runs — independent of flaky webContents.send progress events.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  shouldUseBulkArchiveExtract,
  startTransferProgressPoll,
  BULK_EXTRACT_MAX_FILE_BYTES
} from '../renderer/src/services/file-operation-service'
import { useOperationsStore, type FileItem } from '../renderer/src/stores/operations-store'
import type { Entry } from '../shared/types'
import { PluginManager } from '../main/plugins/plugin-manager'
import { LocalFilesystemPlugin } from '../main/plugins/local-filesystem'
import { ArchivePlugin } from '../main/plugins/archive'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import * as crypto from 'crypto'

function makeEntry(id: string, name = id): Entry {
  return {
    id,
    name,
    isContainer: false,
    size: 0,
    modifiedAt: 0,
    mimeType: '',
    iconHint: 'file',
    meta: {},
    attributes: { readonly: false, hidden: false, symlink: false }
  }
}

function fileItem(partial: Partial<FileItem> & Pick<FileItem, 'sourcePath' | 'destPath' | 'size'>): FileItem {
  return {
    isDirectory: false,
    relativePath: partial.relativePath || 'f.bin',
    ...partial
  }
}

describe('shouldUseBulkArchiveExtract', () => {
  it('rejects single-file archives (must use stream + poll)', () => {
    expect(
      shouldUseBulkArchiveExtract([
        fileItem({ sourcePath: 'a.zip::big.bin', destPath: '/out/big.bin', size: 500 * 1024 * 1024 })
      ])
    ).toBe(false)
  })

  it('rejects any archive that contains a large file', () => {
    expect(
      shouldUseBulkArchiveExtract([
        fileItem({ sourcePath: 'a.zip::a.txt', destPath: '/out/a.txt', size: 100, relativePath: 'a.txt' }),
        fileItem({
          sourcePath: 'a.zip::big.bin',
          destPath: '/out/big.bin',
          size: BULK_EXTRACT_MAX_FILE_BYTES,
          relativePath: 'big.bin'
        })
      ])
    ).toBe(false)
  })

  it('allows bulk for many small files', () => {
    const list = Array.from({ length: 20 }, (_, i) =>
      fileItem({
        sourcePath: `a.zip::f${i}.txt`,
        destPath: `/out/f${i}.txt`,
        size: 1024,
        relativePath: `f${i}.txt`
      })
    )
    expect(shouldUseBulkArchiveExtract(list)).toBe(true)
  })
})

describe('startTransferProgressPoll', () => {
  beforeEach(() => {
    useOperationsStore.setState({ operations: [], showDialog: false })
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.mocked(window.api.util.getStreamCopyProgress).mockReset()
    vi.mocked(window.api.util.getStreamCopyProgress).mockResolvedValue(0)
    vi.mocked(window.api.util.getFileInfo).mockReset()
    vi.mocked(window.api.util.getFileInfo).mockResolvedValue({
      size: 100,
      modifiedAt: 1000,
      isDirectory: false
    })
  })

  it('updates currentFileCopied from getStreamCopyProgress (not events)', async () => {
    const opId = useOperationsStore.getState().enqueue({
      type: 'copy',
      sourceEntries: [makeEntry('/src/big.bin')],
      sourcePluginId: 'archive',
      destinationDisplay: '/out',
      destinationLocationId: '/out',
      destinationPluginId: 'local-filesystem'
    })
    useOperationsStore.getState().updateOperation(opId, {
      status: 'running',
      currentFile: 'big.bin',
      currentFileSize: 1000,
      currentFileCopied: 0,
      totalBytes: 1000,
      totalFiles: 1
    })

    let bytes = 0
    vi.mocked(window.api.util.getStreamCopyProgress).mockImplementation(async () => bytes)

    const stop = startTransferProgressPoll(opId, {
      transferId: 'xfer-1',
      destPath: '/out/big.bin',
      expectedSize: 1000,
      intervalMs: 50
    })

    bytes = 250
    await vi.advanceTimersByTimeAsync(60)
    await Promise.resolve()
    await Promise.resolve()
    expect(useOperationsStore.getState().operations[0].currentFileCopied).toBe(250)

    bytes = 800
    await vi.advanceTimersByTimeAsync(60)
    await Promise.resolve()
    await Promise.resolve()
    expect(useOperationsStore.getState().operations[0].currentFileCopied).toBe(800)
    expect(useOperationsStore.getState().operations[0].currentFileSize).toBe(1000)

    stop()
  })
})

describe('PluginManager transferBytes during zip→local copy', () => {
  let tmpDir: string
  let manager: PluginManager

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sc-xfer-poll-'))
    manager = new PluginManager()
    const local = new LocalFilesystemPlugin()
    const archive = new ArchivePlugin({
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
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('getStreamCopyProgress increases mid-copy for a large zip member', async () => {
    const FILE_SIZE = 12 * 1024 * 1024
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const yazl = require('yazl') as typeof import('yazl')
    const zipPath = path.join(tmpDir, 'payload.zip')
    const data = crypto.randomBytes(FILE_SIZE)
    const zip = new yazl.ZipFile()
    zip.addBuffer(data, 'huge.bin')
    zip.end()
    await new Promise<void>((resolve, reject) => {
      zip.outputStream.pipe(fsSync.createWriteStream(zipPath)).on('finish', resolve).on('error', reject)
    })
    const destDir = path.join(tmpDir, 'out')
    await fs.mkdir(destDir)

    const transferId = 'zip-big-1'
    const samples: number[] = []

    const copyPromise = manager.streamCopyFile(
      'archive',
      `${zipPath}::huge.bin`,
      'local-filesystem',
      destDir,
      'huge.bin',
      undefined,
      transferId
    )

    // Poll like the renderer does — must see mid-copy growth
    await new Promise<void>((resolve, reject) => {
      const start = Date.now()
      const tick = (): void => {
        const n = manager.getStreamCopyProgress(transferId)
        if (n > 0) samples.push(n)
        if (samples.length >= 3 && samples[samples.length - 1] > samples[0]) {
          resolve()
          return
        }
        if (Date.now() - start > 20000) {
          reject(new Error(`Timed out; samples=${JSON.stringify(samples)}`))
          return
        }
        setTimeout(tick, 10)
      }
      tick()
    })

    const result = await copyPromise
    expect(result.success).toBe(true)
    expect(Math.max(...samples)).toBeGreaterThan(256 * 1024)
    expect(Math.max(...samples)).toBeLessThanOrEqual(FILE_SIZE)
    expect(samples.some((s) => s > 0 && s < FILE_SIZE)).toBe(true)
  }, 60000)
})
