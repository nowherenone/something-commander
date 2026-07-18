import { Transform } from 'stream'
import type { BrowsePlugin, PluginManifest, ReadDirectoryResult } from '@shared/types'
import type { OperationRequest, OperationResult, PluginOperation } from '@shared/types'

export class PluginManager {
  private plugins: Map<string, BrowsePlugin> = new Map()
  /** Active stream copies — cancelStreamCopy(transferId) destroys their pipes. */
  private activeStreamCopies = new Map<string, () => void>()
  /** Cancels that arrived before the transfer registered its abort handler. */
  private pendingCancels = new Set<string>()

  register(plugin: BrowsePlugin): void {
    this.plugins.set(plugin.manifest.id, plugin)
  }

  /** Abort an in-flight streamCopyFile (renderer cancel). Safe if already finished. */
  cancelStreamCopy(transferId: string): void {
    const abort = this.activeStreamCopies.get(transferId)
    if (abort) {
      abort()
      return
    }
    // Not registered yet (still opening source / zip entry) — remember for later
    this.pendingCancels.add(transferId)
  }

  get(pluginId: string): BrowsePlugin | undefined {
    return this.plugins.get(pluginId)
  }

  unregister(pluginId: string): void {
    this.plugins.delete(pluginId)
  }

  resolveScheme(scheme: string): BrowsePlugin | undefined {
    for (const plugin of this.plugins.values()) {
      if (plugin.manifest.schemes.includes(scheme)) {
        return plugin
      }
    }
    return undefined
  }

  listPlugins(): PluginManifest[] {
    return Array.from(this.plugins.values()).map((p) => p.manifest)
  }

  async initializeAll(): Promise<void> {
    for (const plugin of this.plugins.values()) {
      const ok = await plugin.initialize()
      if (!ok) {
        console.error(`Plugin ${plugin.manifest.id} failed to initialize`)
      }
    }
  }

  async disposeAll(): Promise<void> {
    for (const plugin of this.plugins.values()) {
      await plugin.dispose()
    }
  }

  async readDirectory(pluginId: string, locationId: string | null): Promise<ReadDirectoryResult> {
    const plugin = this.get(pluginId)
    if (!plugin) throw new Error(`Unknown plugin: ${pluginId}`)
    return plugin.readDirectory(locationId)
  }

  async resolveLocation(pluginId: string, input: string): Promise<string | null> {
    const plugin = this.get(pluginId)
    if (!plugin) throw new Error(`Unknown plugin: ${pluginId}`)
    return plugin.resolveLocation(input)
  }

  getSupportedOperations(pluginId: string): PluginOperation[] {
    const plugin = this.get(pluginId)
    if (!plugin) throw new Error(`Unknown plugin: ${pluginId}`)
    return plugin.getSupportedOperations()
  }

  async executeOperation(pluginId: string, op: OperationRequest): Promise<OperationResult> {
    const plugin = this.get(pluginId)
    if (!plugin) throw new Error(`Unknown plugin: ${pluginId}`)
    return plugin.executeOperation(op)
  }

  async enumerateFiles(
    pluginId: string,
    entryIds: string[],
    destDir: string
  ): Promise<Array<{ sourcePath: string; destPath: string; size: number; isDirectory: boolean; relativePath: string }>> {
    const plugin = this.get(pluginId)
    if (!plugin) throw new Error(`Unknown plugin: ${pluginId}`)
    if (plugin.enumerateFiles) {
      return plugin.enumerateFiles(entryIds, destDir)
    }
    // Generic fallback using readDirectory recursion (works for plugins that implement readDirectory)
    return this.genericEnumerate(pluginId, entryIds, destDir)
  }

  private async genericEnumerate(
    pluginId: string,
    entryIds: string[],
    destDir: string
  ): Promise<Array<{ sourcePath: string; destPath: string; size: number; isDirectory: boolean; relativePath: string }>> {
    const result: Array<{ sourcePath: string; destPath: string; size: number; isDirectory: boolean; relativePath: string }> = []

    const walk = async (locId: string, destBase: string, relBase: string): Promise<void> => {
      try {
        const dir = await this.readDirectory(pluginId, locId)
        for (const entry of dir.entries) {
          const childDest = `${destBase}/${entry.name}`.replace(/\/+/, '/')
          const childRel = relBase ? `${relBase}/${entry.name}` : entry.name
          if (entry.isContainer) {
            result.push({ sourcePath: entry.id, destPath: childDest, size: 0, isDirectory: true, relativePath: childRel })
            await walk(entry.id, childDest, childRel)
          } else {
            result.push({ sourcePath: entry.id, destPath: childDest, size: entry.size || 0, isDirectory: false, relativePath: childRel })
          }
        }
      } catch {
        // skip
      }
    }

    for (const id of entryIds) {
      // try to get name
      const base = id.split(/[:/\\]/).pop() || 'item'
      const dBase = `${destDir}/${base}`.replace(/\/+/, '/')
      // heuristic: assume container unless we know
      result.push({ sourcePath: id, destPath: dBase, size: 0, isDirectory: true, relativePath: base })
      await walk(id, dBase, base)
    }
    return result
  }

  async readAt(pluginId: string, entryId: string, offset: number, length: number): Promise<Buffer> {
    const plugin = this.get(pluginId)
    if (!plugin) throw new Error(`Unknown plugin: ${pluginId}`)
    if (!plugin.readAt) throw new Error(`Plugin ${pluginId} does not support readAt`)
    return plugin.readAt(entryId, offset, length)
  }

  async getSize(pluginId: string, entryId: string): Promise<number> {
    const plugin = this.get(pluginId)
    if (!plugin) throw new Error(`Unknown plugin: ${pluginId}`)
    if (!plugin.getSize) throw new Error(`Plugin ${pluginId} does not support getSize`)
    return plugin.getSize(entryId)
  }

  async statEntry(pluginId: string, entryId: string): Promise<{ size: number; modifiedAt: number; isDirectory?: boolean } | null> {
    const plugin = this.get(pluginId)
    if (!plugin) return null
    if (plugin.statEntry) return plugin.statEntry(entryId)
    if (plugin.getSize) {
      try {
        const size = await plugin.getSize(entryId)
        return { size, modifiedAt: 0 }
      } catch { return null }
    }
    return null
  }

  async exists(pluginId: string, entryId: string): Promise<boolean> {
    const plugin = this.get(pluginId)
    if (!plugin) return false
    if (plugin.exists) return plugin.exists(entryId)
    // fallback try stat
    const s = await this.statEntry(pluginId, entryId)
    return !!s
  }

  /**
   * Unified content read for viewer/editor/quickview.
   * Uses readAt + getSize when available; falls back for local if needed.
   */
  async readEntryContent(
    pluginId: string,
    entryId: string,
    offset = 0,
    length?: number
  ): Promise<{ data: string | Buffer; totalSize: number; isBinary: boolean; error?: string }> {
    const plugin = this.get(pluginId)
    if (!plugin) return { data: '', totalSize: 0, isBinary: false, error: 'Unknown plugin' }

    try {
      let totalSize = 0
      if (plugin.getSize) {
        totalSize = await plugin.getSize(entryId)
      }

      const readLen = length ?? Math.min(512 * 1024, totalSize || 512 * 1024)
      let buf: Buffer
      if (plugin.readAt) {
        buf = await plugin.readAt(entryId, offset, readLen)
      } else if (plugin.createReadStream) {
        // fallback stream read for first chunk
        const stream = await plugin.createReadStream(entryId)
        if (!stream) throw new Error('No stream')
        const chunks: Buffer[] = []
        let got = 0
        await new Promise<void>((resolve, reject) => {
          stream.on('data', (c: Buffer) => {
            if (got < readLen) {
              const need = Math.min(readLen - got, c.length)
              chunks.push(c.slice(0, need))
              got += need
            }
          })
          stream.on('end', resolve)
          stream.on('error', reject)
        })
        buf = Buffer.concat(chunks)
      } else {
        throw new Error('No read method')
      }

      // detect binary
      let isBinary = false
      for (let i = 0; i < Math.min(buf.length, 8192); i++) {
        if (buf[i] === 0) { isBinary = true; break }
      }

      return {
        data: isBinary ? buf : buf.toString('utf-8'),
        totalSize: totalSize || buf.length,
        isBinary
      }
    } catch (err) {
      return { data: '', totalSize: 0, isBinary: false, error: String(err) }
    }
  }

  /**
   * Stream-copy a single file between any two plugins.
   * Returns bytes written. Sends progress via onProgress callback.
   * Pass transferId so the renderer can cancel via cancelStreamCopy (AbortSignal
   * cannot cross Electron IPC).
   */
  async streamCopyFile(
    sourcePluginId: string,
    sourceEntryId: string,
    destPluginId: string,
    destLocationId: string,
    destFileName: string,
    onProgress?: (bytesCopied: number) => void,
    transferId?: string
  ): Promise<{ success: boolean; bytesWritten: number; error?: string }> {
    type CopyResult = { success: boolean; bytesWritten: number; error?: string }

    const sourcePlugin = this.get(sourcePluginId)
    const destPlugin = this.get(destPluginId)
    if (!sourcePlugin) return { success: false, bytesWritten: 0, error: `Unknown source plugin: ${sourcePluginId}` }
    if (!destPlugin) return { success: false, bytesWritten: 0, error: `Unknown dest plugin: ${destPluginId}` }
    if (!sourcePlugin.createReadStream) {
      return { success: false, bytesWritten: 0, error: `Source plugin ${sourcePluginId} does not support streaming` }
    }
    if (!destPlugin.writeFromStream) {
      return { success: false, bytesWritten: 0, error: `Dest plugin ${destPluginId} does not support streaming` }
    }

    if (transferId && this.pendingCancels.has(transferId)) {
      this.pendingCancels.delete(transferId)
      return { success: false, bytesWritten: 0, error: 'Cancelled' }
    }

    let cancelled = false
    let bytesCopied = 0
    let lastReportBytes = 0
    let lastReportTime = 0
    let readStream: NodeJS.ReadableStream | null = null
    let progressStream: Transform | null = null
    let settleCancel: ((r: CopyResult) => void) | null = null
    const cancelRace = new Promise<CopyResult>((resolve) => {
      settleCancel = resolve
    })

    const REPORT_EVERY_BYTES = 256 * 1024
    const REPORT_EVERY_MS = 50

    const destroyStreams = (): void => {
      try {
        if (readStream && progressStream) {
          ;(readStream as NodeJS.ReadableStream & { unpipe?: (d?: unknown) => void }).unpipe?.(progressStream)
        }
      } catch { /* ignore */ }
      try {
        ;(readStream as { destroy?: (e?: Error) => void } | null)?.destroy?.(new Error('Cancelled'))
      } catch { /* ignore */ }
      try {
        progressStream?.destroy(new Error('Cancelled'))
      } catch { /* ignore */ }
    }

    const abort = (): void => {
      if (cancelled) return
      cancelled = true
      destroyStreams()
      settleCancel?.({ success: false, bytesWritten: bytesCopied, error: 'Cancelled' })
    }

    // Register cancel handle BEFORE any await so cancel during zip open works
    if (transferId) {
      this.activeStreamCopies.set(transferId, abort)
      if (this.pendingCancels.has(transferId)) {
        this.pendingCancels.delete(transferId)
        abort()
        this.activeStreamCopies.delete(transferId)
        return { success: false, bytesWritten: 0, error: 'Cancelled' }
      }
    }

    try {
      readStream = await sourcePlugin.createReadStream(sourceEntryId)
      if (cancelled) {
        ;(readStream as { destroy?: () => void } | null)?.destroy?.()
        return { success: false, bytesWritten: 0, error: 'Cancelled' }
      }
      if (!readStream) {
        return { success: false, bytesWritten: 0, error: `Could not open read stream for ${sourceEntryId}` }
      }

      // Progress transform: count bytes, report often, yield so cancel/IPC run mid-copy.
      // Zip inflate is often a tight sync loop — without setImmediate the UI freezes and
      // cancel never runs until the whole file is done.
      // yauzl often emits multi‑MB chunks in one transform call. Slice them so we
      // can report progress and honor cancel between pieces. Always yield via
      // setImmediate (never wait on 'drain' here — that deadlocks with pipe).
      const PIECE = 256 * 1024
      progressStream = new Transform({
        highWaterMark: PIECE,
        transform(this: Transform, chunk: Buffer, _enc, callback) {
          let offset = 0
          const pump = (): void => {
            if (cancelled) {
              callback(new Error('Cancelled'))
              return
            }
            if (offset >= chunk.length) {
              callback()
              return
            }
            const end = Math.min(offset + PIECE, chunk.length)
            const piece = chunk.subarray(offset, end)
            offset = end
            bytesCopied += piece.length
            const now = Date.now()
            const byBytes = bytesCopied - lastReportBytes >= REPORT_EVERY_BYTES
            const byTime = lastReportTime === 0 || now - lastReportTime >= REPORT_EVERY_MS
            if (onProgress && (byBytes || byTime)) {
              lastReportBytes = bytesCopied
              lastReportTime = now
              onProgress(bytesCopied)
            }
            this.push(piece)
            setImmediate(pump)
          }
          pump()
        }
      })

      const swallow = (): void => { /* cancel teardown */ }
      ;(readStream as NodeJS.EventEmitter).on('error', swallow)
      progressStream.on('error', swallow)

      // Destination first so the transform always has a consumer
      const writePromise = destPlugin.writeFromStream(destLocationId, destFileName, progressStream)
      readStream.pipe(progressStream)

      const result = await Promise.race([writePromise, cancelRace])

      if (cancelled || result.error === 'Cancelled' || String(result.error || '').includes('Cancelled')) {
        return { success: false, bytesWritten: bytesCopied || result.bytesWritten, error: 'Cancelled' }
      }
      if (onProgress) onProgress(result.bytesWritten || bytesCopied)
      return result
    } catch (err) {
      if (cancelled || String(err).includes('Cancelled')) {
        return { success: false, bytesWritten: bytesCopied, error: 'Cancelled' }
      }
      return { success: false, bytesWritten: bytesCopied, error: String(err) }
    } finally {
      if (transferId) {
        this.activeStreamCopies.delete(transferId)
        this.pendingCancels.delete(transferId)
      }
    }
  }
}


export const pluginManager = new PluginManager()
