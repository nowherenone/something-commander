import React, { useEffect, useState, useCallback } from 'react'
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
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={`${styles.dialog} ${styles.dialogWide}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.dialogTitle}>Plugin Manager</div>
        <div className={styles.dialogBody}>
          {/* Built-in plugins */}
          <div className={styles.settingsGroup}>
            <div className={styles.settingsGroupTitle}>Built-in Plugins</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-secondary)' }}>Name</th>
                  <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-secondary)' }}>ID</th>
                  <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-secondary)' }}>Version</th>
                  <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-secondary)' }}>Schemes</th>
                </tr>
              </thead>
              <tbody>
                {registeredPlugins.map((p) => (
                  <tr key={p.id}>
                    <td style={{ padding: '3px 8px', color: 'var(--text-primary)' }}>{p.displayName}</td>
                    <td style={{ padding: '3px 8px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{p.id}</td>
                    <td style={{ padding: '3px 8px', color: 'var(--text-muted)' }}>{p.version}</td>
                    <td style={{ padding: '3px 8px', color: 'var(--accent)', fontSize: 11 }}>{p.schemes.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* External plugins */}
          <div className={styles.settingsGroup} style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className={styles.settingsGroupTitle}>External Plugins</div>
              <button
                className={`${styles.btn} ${styles.btnSecondary}`}
                style={{ fontSize: 10, padding: '2px 8px' }}
                onClick={handleOpenDir}
              >
                Open plugins folder
              </button>
            </div>

            {loading ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: 8 }}>Loading...</div>
            ) : externalPlugins.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: 8 }}>
                No external plugins found.
                <br />
                <span style={{ fontSize: 11 }}>
                  Place plugin folders in: <code style={{ color: 'var(--accent)' }}>{pluginsDir}</code>
                </span>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-secondary)' }}>Name</th>
                    <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-secondary)' }}>Version</th>
                    <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-secondary)' }}>Status</th>
                    <th style={{ textAlign: 'right', padding: '4px 8px', color: 'var(--text-secondary)' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {externalPlugins.map((p) => (
                    <tr key={p.id}>
                      <td style={{ padding: '3px 8px' }}>
                        <div style={{ color: 'var(--text-primary)' }}>{p.name}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>{p.description}</div>
                      </td>
                      <td style={{ padding: '3px 8px', color: 'var(--text-muted)' }}>{p.version}</td>
                      <td style={{ padding: '3px 8px' }}>
                        {p.enabled ? (
                          <span style={{ color: 'var(--success)' }}>Loaded</span>
                        ) : (
                          <span style={{ color: 'var(--danger)' }}>{p.error || 'Disabled'}</span>
                        )}
                      </td>
                      <td style={{ padding: '3px 8px', textAlign: 'right' }}>
                        {p.enabled ? (
                          <button
                            className={`${styles.btn} ${styles.btnSecondary}`}
                            style={{ fontSize: 10, padding: '2px 8px' }}
                            onClick={() => handleUnload(p.id)}
                          >
                            Unload
                          </button>
                        ) : (
                          <button
                            className={`${styles.btn} ${styles.btnPrimary}`}
                            style={{ fontSize: 10, padding: '2px 8px' }}
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
          <div className={styles.settingsGroup} style={{ marginTop: 16 }}>
            <div className={styles.settingsGroupTitle}>Creating a Plugin</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              <p>Create a folder in the plugins directory with:</p>
              <pre style={{
                background: 'var(--bg-tertiary)',
                padding: 8,
                borderRadius: 3,
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-primary)',
                overflow: 'auto'
              }}>{`my-plugin/
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
        </div>
        <div className={styles.dialogFooter}>
          <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={refresh}>Refresh</button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
