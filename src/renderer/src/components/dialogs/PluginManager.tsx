import React, { useEffect, useState, useCallback } from 'react'
import { Modal } from '../primitives/Modal'
import styles from '../../styles/dialogs.module.css'

interface PluginInfo {
  id: string
  name: string
  version: string
  description: string
  path: string
  enabled: boolean
  error?: string
}

interface RegisteredPlugin {
  id: string
  displayName: string
  version: string
  iconHint: string
  schemes: string[]
}

interface PluginManagerProps {
  onClose: () => void
}

export function PluginManagerDialog({ onClose }: PluginManagerProps): React.JSX.Element {
  const [externalPlugins, setExternalPlugins] = useState<PluginInfo[]>([])
  const [registeredPlugins, setRegisteredPlugins] = useState<RegisteredPlugin[]>([])
  const [pluginsDir, setPluginsDir] = useState('')
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    const [external, registered, dir] = await Promise.all([
      window.api.util.pluginScan(),
      window.api.plugins.list(),
      window.api.util.pluginGetDir()
    ])
    setExternalPlugins(external)
    setRegisteredPlugins(registered)
    setPluginsDir(dir)
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const handleLoad = useCallback(async (pluginPath: string) => {
    const result = await window.api.util.pluginLoad(pluginPath)
    if (!result.success) {
      alert(`Failed to load plugin: ${result.error}`)
    }
    refresh()
  }, [refresh])

  const handleUnload = useCallback(async (pluginId: string) => {
    await window.api.util.pluginUnload(pluginId)
    refresh()
  }, [refresh])

  const handleOpenDir = useCallback(() => {
    window.api.util.openFile(pluginsDir)
  }, [pluginsDir])

  return (
    <Modal
      onClose={onClose}
      title="Plugin Manager"
      wide
      footer={
        <>
          <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={refresh}>Refresh</button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={onClose}>Close</button>
        </>
      }
    >
          {/* Built-in plugins */}
          <div className={styles.settingsGroup}>
            <div className={styles.settingsGroupTitle}>Built-in Plugins</div>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>ID</th>
                  <th>Version</th>
                  <th>Schemes</th>
                </tr>
              </thead>
              <tbody>
                {registeredPlugins.map((p) => (
                  <tr key={p.id}>
                    <td>{p.displayName}</td>
                    <td className={styles.tinyText} style={{ fontFamily: 'var(--font-mono)' }}>{p.id}</td>
                    <td className={styles.mutedText}>{p.version}</td>
                    <td style={{ color: 'var(--accent)' }}>{p.schemes.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* External plugins */}
          <div className={styles.settingsGroup} style={{ marginTop: 'var(--space-6)' }}>
            <div className={styles.formRow} style={{ justifyContent: 'space-between' }}>
              <div className={styles.settingsGroupTitle}>External Plugins</div>
              <button
                className={`${styles.btn} ${styles.btnSecondary} ${styles.btnCompact}`}
                onClick={handleOpenDir}
              >
                Open plugins folder
              </button>
            </div>

            {loading ? (
              <div className={styles.mutedText} style={{ padding: 'var(--space-4)' }}>Loading...</div>
            ) : externalPlugins.length === 0 ? (
              <div className={styles.mutedText} style={{ padding: 'var(--space-4)' }}>
                No external plugins found.
                <br />
                <span className={styles.tinyText}>
                  Place plugin folders in: <code style={{ color: 'var(--accent)' }}>{pluginsDir}</code>
                </span>
              </div>
            ) : (
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Version</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {externalPlugins.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <div>{p.name}</div>
                        <div className={styles.tinyText}>{p.description}</div>
                      </td>
                      <td className={styles.mutedText}>{p.version}</td>
                      <td>
                        {p.enabled ? (
                          <span style={{ color: 'var(--success)' }}>Loaded</span>
                        ) : (
                          <span style={{ color: 'var(--danger)' }}>{p.error || 'Disabled'}</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {p.enabled ? (
                          <button
                            className={`${styles.btn} ${styles.btnSecondary} ${styles.btnCompact}`}
                            onClick={() => handleUnload(p.id)}
                          >
                            Unload
                          </button>
                        ) : (
                          <button
                            className={`${styles.btn} ${styles.btnPrimary} ${styles.btnCompact}`}
                            onClick={() => handleLoad(p.path)}
                          >
                            Load
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* How to create a plugin */}
          <div className={styles.settingsGroup} style={{ marginTop: 'var(--space-6)' }}>
            <div className={styles.settingsGroupTitle}>Creating a Plugin</div>
            <div className={styles.mutedText} style={{ lineHeight: 1.6 }}>
              <p>Create a folder in the plugins directory with:</p>
              <pre className={styles.codeBlock}>{`my-plugin/
  package.json   // "main": "index.js"
  index.js       // module.exports = class MyPlugin {
                 //   manifest = { id, displayName, version, iconHint, schemes }
                 //   async initialize() { return true }
                 //   async dispose() {}
                 //   async readDirectory(locationId) { ... }
                 //   async resolveLocation(input) { ... }
                 //   getSupportedOperations() { return [] }
                 //   async executeOperation(op) { ... }
                 // }`}</pre>
            </div>
          </div>
    </Modal>
  )
}
