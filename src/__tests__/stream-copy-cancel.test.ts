import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Readable, PassThrough } from 'stream'
import { PluginManager } from '../main/plugins/plugin-manager'
import type { BrowsePlugin, PluginManifest } from '../shared/types'

function makeSlowSourcePlugin(bytes: number, chunkDelayMs = 20): BrowsePlugin {
  const manifest: PluginManifest = {
    id: 'slow-source',
    name: 'Slow Source',
    version: '1.0.0',
    description: 'test',
    schemes: [],
    capabilities: {
      canWrite: false,
      canDelete: false,
      canRename: false,
      canCreateDirectory: false,
      canCopy: false,
      canMove: false,
      canSearch: false,
      canCalculateSize: false
    }
  }
  return {
    manifest,
    initialize: async () => true,
    dispose: async () => {},
    readDirectory: async () => ({ entries: [], location: '', parentId: null, extraColumns: [] }),
    resolveLocation: async () => null,
    getSupportedOperations: () => [],
    executeOperation: async () => ({ success: true }),
    createReadStream: async () => {
      let remaining = bytes
      const chunk = 64 * 1024
      return new Readable({
        read() {
          if (remaining <= 0) {
            this.push(null)
            return
          }
          const size = Math.min(chunk, remaining)
          remaining -= size
          setTimeout(() => {
            this.push(Buffer.alloc(size, 0xab))
          }, chunkDelayMs)
        }
      })
    }
  }
}

function makeSlowDestPlugin(): BrowsePlugin & { written: number } {
  const manifest: PluginManifest = {
    id: 'slow-dest',
    name: 'Slow Dest',
    version: '1.0.0',
    description: 'test',
    schemes: [],
    capabilities: {
      canWrite: true,
      canDelete: false,
      canRename: false,
      canCreateDirectory: false,
      canCopy: false,
      canMove: false,
      canSearch: false,
      canCalculateSize: false
    }
  }
  const plugin: BrowsePlugin & { written: number } = {
    written: 0,
    manifest,
    initialize: async () => true,
    dispose: async () => {},
    readDirectory: async () => ({ entries: [], location: '', parentId: null, extraColumns: [] }),
    resolveLocation: async () => null,
    getSupportedOperations: () => [],
    executeOperation: async () => ({ success: true }),
    writeFromStream: async (_dest, _name, stream) => {
      return new Promise((resolve) => {
        let bytesWritten = 0
        let settled = false
        const done = (result: { success: boolean; bytesWritten: number; error?: string }): void => {
          if (settled) return
          settled = true
          plugin.written = bytesWritten
          resolve(result)
        }
        stream.on('data', (chunk: Buffer) => {
          bytesWritten += chunk.length
        })
        stream.on('error', (err) => {
          done({ success: false, bytesWritten, error: String(err) })
        })
        // Drain into a PassThrough that we never end ourselves — cancel must settle us
        const sink = new PassThrough()
        sink.resume()
        stream.pipe(sink)
        sink.on('finish', () => done({ success: true, bytesWritten }))
        sink.on('error', (err) => done({ success: false, bytesWritten, error: String(err) }))
      })
    }
  }
  return plugin
}

describe('streamCopyFile cancel', () => {
  let manager: PluginManager
  let dest: ReturnType<typeof makeSlowDestPlugin>

  beforeEach(() => {
    manager = new PluginManager()
    dest = makeSlowDestPlugin()
    manager.register(makeSlowSourcePlugin(50 * 1024 * 1024, 30))
    manager.register(dest)
  })

  afterEach(() => {
    // nothing
  })

  it('cancelStreamCopy aborts an in-flight transfer and resolves', async () => {
    const transferId = 'test-xfer-1'
    const copyPromise = manager.streamCopyFile(
      'slow-source',
      '/big.bin',
      'slow-dest',
      '/dest',
      'big.bin',
      undefined,
      transferId
    )

    // Let a few chunks flow, then cancel
    await new Promise((r) => setTimeout(r, 80))
    manager.cancelStreamCopy(transferId)

    const result = await copyPromise
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Cancel/i)
    // Must not have written the full 50MB
    expect(result.bytesWritten).toBeLessThan(50 * 1024 * 1024)
  }, 10000)

  it('cancel before register is honored (pending cancel)', async () => {
    const transferId = 'test-xfer-early'
    manager.cancelStreamCopy(transferId)
    const result = await manager.streamCopyFile(
      'slow-source',
      '/big.bin',
      'slow-dest',
      '/dest',
      'big.bin',
      undefined,
      transferId
    )
    expect(result.success).toBe(false)
    expect(result.error).toBe('Cancelled')
  })

  it('reports progress multiple times during a multi-megabyte copy', async () => {
    const progress: number[] = []
    // Replace source with a large slow stream
    manager = new PluginManager()
    dest = makeSlowDestPlugin()
    manager.register(makeSlowSourcePlugin(4 * 1024 * 1024, 15))
    manager.register(dest)

    const result = await manager.streamCopyFile(
      'slow-source',
      '/big.bin',
      'slow-dest',
      '/dest',
      'big.bin',
      (n) => progress.push(n)
    )

    expect(result.success).toBe(true)
    expect(result.bytesWritten).toBe(4 * 1024 * 1024)
    // Must see intermediate progress, not only a single final report
    expect(progress.length).toBeGreaterThan(2)
    expect(progress[0]).toBeLessThan(progress[progress.length - 1])
    expect(progress[progress.length - 1]).toBe(4 * 1024 * 1024)
  }, 15000)
})
