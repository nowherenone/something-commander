import * as fs from 'fs/promises'
import * as path from 'path'
import { app } from 'electron'
import type { BrowsePlugin } from '@shared/types'
import { pluginManager } from './plugin-manager'

export interface ExternalPluginInfo {
  id: string
  name: string
  version: string
  description: string
  path: string
  enabled: boolean
  error?: string
}

function getPluginsDir(): string {
  return path.join(app.getPath('userData'), 'plugins')
}

export async function ensurePluginsDir(): Promise<string> {
  const dir = getPluginsDir()
  await fs.mkdir(dir, { recursive: true })
  return dir
}

/**
 * Scan the plugins directory for external plugins.
 * Each subdirectory with a package.json is treated as a potential plugin.
 */
export async function scanPlugins(): Promise<ExternalPluginInfo[]> {
  const dir = await ensurePluginsDir()
  const results: ExternalPluginInfo[] = []

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      const pluginDir = path.join(dir, entry.name)
      const pkgPath = path.join(pluginDir, 'package.json')

      try {
        const pkgContent = await fs.readFile(pkgPath, 'utf-8')
        const pkg = JSON.parse(pkgContent)

        results.push({
          id: pkg.name || entry.name,
          name: pkg.displayName || pkg.name || entry.name,
          version: pkg.version || '0.0.0',
          description: pkg.description || '',
          path: pluginDir,
          enabled: true
        })
      } catch {
        results.push({
          id: entry.name,
          name: entry.name,
          version: '?',
          description: 'Invalid plugin (missing or invalid package.json)',
          path: pluginDir,
          enabled: false,
          error: 'Invalid package.json'
        })
      }
    }
  } catch {
    // plugins dir doesn't exist or can't be read
  }

  return results
}

/**
 * Load and register a single external plugin.
 * The plugin must export a default class that implements BrowsePlugin.
 */
export async function loadPlugin(pluginDir: string): Promise<{ success: boolean; error?: string }> {
  try {
    const pkgPath = path.join(pluginDir, 'package.json')
    const pkgContent = await fs.readFile(pkgPath, 'utf-8')
    const pkg = JSON.parse(pkgContent)
    const mainFile = pkg.main || 'index.js'
    const entryPath = path.join(pluginDir, mainFile)

    // Check entry file exists
    await fs.access(entryPath)

    // Dynamic import
    const mod = require(entryPath)
    const PluginClass = mod.default || mod

    if (typeof PluginClass !== 'function') {
      return { success: false, error: 'Plugin does not export a class' }
    }

    const instance: BrowsePlugin = new PluginClass()

    // Validate it has the required interface
    if (!instance.manifest || !instance.manifest.id) {
      return { success: false, error: 'Plugin missing manifest.id' }
    }
    if (typeof instance.readDirectory !== 'function') {
      return { success: false, error: 'Plugin missing readDirectory method' }
    }
    if (typeof instance.initialize !== 'function') {
      return { success: false, error: 'Plugin missing initialize method' }
    }

    // Check for ID conflicts with built-in plugins
    if (pluginManager.get(instance.manifest.id)) {
      return { success: false, error: `Plugin ID "${instance.manifest.id}" conflicts with existing plugin` }
    }

    // Initialize and register
    const ok = await instance.initialize()
    if (!ok) {
      return { success: false, error: 'Plugin initialize() returned false' }
    }

    pluginManager.register(instance)
    console.log(`[Plugin] Loaded external plugin: ${instance.manifest.id} (${instance.manifest.displayName})`)

    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/**
 * Load all external plugins from the plugins directory.
 */
export async function loadAllPlugins(): Promise<ExternalPluginInfo[]> {
  const plugins = await scanPlugins()
  const results: ExternalPluginInfo[] = []

  for (const info of plugins) {
    if (!info.enabled || info.error) {
      results.push(info)
      continue
    }

    const result = await loadPlugin(info.path)
    results.push({
      ...info,
      enabled: result.success,
      error: result.error
    })
  }

  return results
}

/**
 * Unload a plugin by ID.
 */
export async function unloadPlugin(pluginId: string): Promise<void> {
  const plugin = pluginManager.get(pluginId)
  if (plugin) {
    await plugin.dispose()
    pluginManager.unregister(pluginId)
  }
}
