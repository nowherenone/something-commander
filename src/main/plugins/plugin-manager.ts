import type { BrowsePlugin, PluginManifest, ReadDirectoryResult } from '@shared/types'
import type { OperationRequest, OperationResult, PluginOperation } from '@shared/types'

export class PluginManager {
  private plugins: Map<string, BrowsePlugin> = new Map()

  register(plugin: BrowsePlugin): void {
    this.plugins.set(plugin.manifest.id, plugin)
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
   */
  async streamCopyFile(
    sourcePluginId: string,
    sourceEntryId: string,
    destPluginId: string,
    destLocationId: string,
    destFileName: string,
    onProgress?: (bytesCopied: number) => void,
    signal?: AbortSignal
  ): Promise<{ success: boolean; bytesWritten: number; error?: string }> {
    const sourcePlugin = this.get(sourcePluginId)
    const destPlugin = this.get(destPluginId)
    if (!sourcePlugin) return { success: false, bytesWritten: 0, error: `Unknown source plugin: ${sourcePluginId}` }
    if (!destPlugin) return { success: false, bytesWritten: 0, error: `Unknown dest plugin: ${destPluginId}` }
    if (!sourcePlugin.createReadStream) return { success: false, bytesWritten: 0, error: `Source plugin ${sourcePluginId} does not support streaming` }
    if (!destPlugin.writeFromStream) return { success: false, bytesWritten: 0, error: `Dest plugin ${destPluginId} does not support streaming` }

    const readStream = await sourcePlugin.createReadStream(sourceEntryId)
    if (!readStream) return { success: false, bytesWritten: 0, error: `Could not open read stream for ${sourceEntryId}` }

    if (signal?.aborted) {
      ;(readStream as any).destroy?.()
      return { success: false, bytesWritten: 0, error: 'Cancelled' }
    }

    // Track progress
    let bytesCopied = 0
    let lastReport = 0
    const onData = (chunk: Buffer) => {
      bytesCopied += chunk.length
      const now = Date.now()
      if (onProgress && now - lastReport >= 250) {
        onProgress(bytesCopied)
        lastReport = now
      }
    }
    readStream.on('data', onData)

    const abortHandler = () => {
      ;(readStream as any).destroy?.()
    }
    if (signal) signal.addEventListener('abort', abortHandler, { once: true })

    const result = await destPlugin.writeFromStream(destLocationId, destFileName, readStream)
    if (signal) signal.removeEventListener('abort', abortHandler)
    if (onProgress) onProgress(result.bytesWritten)
    if (signal?.aborted) return { success: false, bytesWritten: result.bytesWritten, error: 'Cancelled' }
    return result
  }
}

export const pluginManager = new PluginManager()
