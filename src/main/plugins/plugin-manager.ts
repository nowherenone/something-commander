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
    if (!plugin.enumerateFiles) {
      throw new Error(`Plugin ${pluginId} does not support file enumeration`)
    }
    return plugin.enumerateFiles(entryIds, destDir)
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
    onProgress?: (bytesCopied: number) => void
  ): Promise<{ success: boolean; bytesWritten: number; error?: string }> {
    const sourcePlugin = this.get(sourcePluginId)
    const destPlugin = this.get(destPluginId)
    if (!sourcePlugin) return { success: false, bytesWritten: 0, error: `Unknown source plugin: ${sourcePluginId}` }
    if (!destPlugin) return { success: false, bytesWritten: 0, error: `Unknown dest plugin: ${destPluginId}` }
    if (!sourcePlugin.createReadStream) return { success: false, bytesWritten: 0, error: `Source plugin ${sourcePluginId} does not support streaming` }
    if (!destPlugin.writeFromStream) return { success: false, bytesWritten: 0, error: `Dest plugin ${destPluginId} does not support streaming` }

    const readStream = await sourcePlugin.createReadStream(sourceEntryId)
    if (!readStream) return { success: false, bytesWritten: 0, error: `Could not open read stream for ${sourceEntryId}` }

    // Track progress
    let bytesCopied = 0
    let lastReport = 0
    readStream.on('data', (chunk: Buffer) => {
      bytesCopied += chunk.length
      const now = Date.now()
      if (onProgress && now - lastReport >= 250) {
        onProgress(bytesCopied)
        lastReport = now
      }
    })

    const result = await destPlugin.writeFromStream(destLocationId, destFileName, readStream)
    if (onProgress) onProgress(result.bytesWritten)
    return result
  }
}

export const pluginManager = new PluginManager()
