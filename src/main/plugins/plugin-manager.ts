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
}

export const pluginManager = new PluginManager()
