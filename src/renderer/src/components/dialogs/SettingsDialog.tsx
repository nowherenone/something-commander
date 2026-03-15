import React, { useState } from 'react'
import { useSettingsStore } from '../../stores/settings-store'
import styles from '../../styles/dialogs.module.css'

interface SettingsDialogProps {
  onClose: () => void
}

const TABS = [
  { id: 'display', label: 'Display' },
  { id: 'layout', label: 'Layout' },
  { id: 'operations', label: 'Operations' },
  { id: 'keyboard', label: 'Keyboard' }
] as const

type TabId = (typeof TABS)[number]['id']

export function SettingsDialog({ onClose }: SettingsDialogProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('display')
  const settings = useSettingsStore()
  const update = useSettingsStore((s) => s.updateSettings)
  const reset = useSettingsStore((s) => s.resetSettings)

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={`${styles.dialog} ${styles.dialogWide}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.dialogTitle}>Configuration</div>
        <div className={styles.dialogBody}>
          <div className={styles.settingsLayout}>
            <div className={styles.settingsSidebar}>
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  className={`${styles.settingsTab} ${activeTab === tab.id ? styles.settingsTabActive : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className={styles.settingsContent}>
              {activeTab === 'display' && (
                <>
                  <div className={styles.settingsGroup}>
                    <div className={styles.settingsGroupTitle}>Appearance</div>
                    <div className={styles.settingsRow}>
                      <span className={styles.settingsLabel}>Theme</span>
                      <select
                        className={styles.settingsSelect}
                        value={settings.theme}
                        onChange={(e) => update({ theme: e.target.value as 'dark' | 'light' })}
                      >
                        <option value="dark">Dark (BlueprintJS)</option>
                        <option value="light">Light</option>
                        <option value="classic">Classic Blue (NC)</option>
                      </select>
                    </div>
                    <div className={styles.settingsRow}>
                      <span className={styles.settingsLabel}>Date format</span>
                      <select
                        className={styles.settingsSelect}
                        value={settings.dateFormat}
                        onChange={(e) => update({ dateFormat: e.target.value })}
                      >
                        <option value="yyyy-MM-dd HH:mm">2024-03-15 14:30</option>
                        <option value="dd.MM.yyyy HH:mm">15.03.2024 14:30</option>
                        <option value="MM/dd/yyyy hh:mm a">03/15/2024 02:30 PM</option>
                        <option value="dd MMM yyyy HH:mm">15 Mar 2024 14:30</option>
                      </select>
                    </div>
                  </div>
                  <div className={styles.settingsGroup}>
                    <div className={styles.settingsGroupTitle}>Files</div>
                    <label className={styles.settingsCheckbox}>
                      <input
                        type="checkbox"
                        checked={settings.showHiddenFiles}
                        onChange={(e) => update({ showHiddenFiles: e.target.checked })}
                      />
                      <span className={styles.settingsLabel}>Show hidden files</span>
                    </label>
                  </div>
                </>
              )}

              {activeTab === 'layout' && (
                <>
                  <div className={styles.settingsGroup}>
                    <div className={styles.settingsGroupTitle}>Font</div>
                    <div className={styles.settingsRow}>
                      <span className={styles.settingsLabel}>Font size (px)</span>
                      <input
                        type="number"
                        className={styles.settingsInput}
                        value={settings.fontSize}
                        min={10}
                        max={20}
                        onChange={(e) => update({ fontSize: Number(e.target.value) })}
                      />
                    </div>
                    <div className={styles.settingsRow}>
                      <span className={styles.settingsLabel}>Font family</span>
                      <select
                        className={styles.settingsSelect}
                        value={settings.fontFamily}
                        onChange={(e) => update({ fontFamily: e.target.value })}
                      >
                        <option value="'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif">
                          System (Segoe UI)
                        </option>
                        <option value="'Cascadia Code', 'Consolas', monospace">
                          Monospace (Cascadia)
                        </option>
                        <option value="'Inter', 'Helvetica', sans-serif">Inter</option>
                        <option value="'JetBrains Mono', monospace">JetBrains Mono</option>
                      </select>
                    </div>
                  </div>
                  <div className={styles.settingsGroup}>
                    <div className={styles.settingsGroupTitle}>Rows</div>
                    <div className={styles.settingsRow}>
                      <span className={styles.settingsLabel}>Row height (px)</span>
                      <input
                        type="number"
                        className={styles.settingsInput}
                        value={settings.rowHeight}
                        min={18}
                        max={40}
                        onChange={(e) => update({ rowHeight: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'operations' && (
                <div className={styles.settingsGroup}>
                  <div className={styles.settingsGroupTitle}>Confirmations</div>
                  <label className={styles.settingsCheckbox}>
                    <input
                      type="checkbox"
                      checked={settings.confirmDelete}
                      onChange={(e) => update({ confirmDelete: e.target.checked })}
                    />
                    <span className={styles.settingsLabel}>Confirm before delete (F8)</span>
                  </label>
                  <label className={styles.settingsCheckbox}>
                    <input
                      type="checkbox"
                      checked={settings.confirmOverwrite}
                      onChange={(e) => update({ confirmOverwrite: e.target.checked })}
                    />
                    <span className={styles.settingsLabel}>Confirm before overwrite</span>
                  </label>
                  <div className={styles.settingsGroupTitle} style={{ marginTop: 12 }}>
                    Shell
                  </div>
                  <div className={styles.settingsRow}>
                    <span className={styles.settingsLabel}>Command shell</span>
                    <input
                      className={styles.settingsInput}
                      value={settings.shell}
                      onChange={(e) => update({ shell: e.target.value })}
                      style={{ width: 180 }}
                    />
                  </div>
                </div>
              )}

              {activeTab === 'keyboard' && (
                <div className={styles.settingsGroup}>
                  <div className={styles.settingsGroupTitle}>Keyboard Shortcuts</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                      {[
                        ['Tab', 'Switch panel'],
                        ['Enter', 'Open / navigate into'],
                        ['Backspace', 'Go to parent'],
                        ['Space', 'Select/deselect + calc folder size'],
                        ['Insert', 'Toggle select + move down'],
                        ['Shift+Up/Down', 'Extend selection'],
                        ['Ctrl+A', 'Select all'],
                        ['Ctrl+D', 'Deselect all'],
                        ['Ctrl+I', 'Invert selection'],
                        ['F5', 'Copy'],
                        ['F6', 'Move / Rename'],
                        ['F7', 'Create directory'],
                        ['F8 / Delete', 'Delete'],
                        ['Ctrl+T', 'New tab'],
                        ['Ctrl+W', 'Close tab'],
                        ['Ctrl+H', 'Toggle hidden files'],
                        ['Ctrl+L', 'Focus address bar'],
                        ['F9', 'Settings']
                      ].map(([key, desc]) => (
                        <tr key={key}>
                          <td
                            style={{
                              padding: '4px 8px',
                              color: 'var(--accent)',
                              fontFamily: 'var(--font-mono)',
                              fontSize: 'var(--font-size-small)',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {key}
                          </td>
                          <td
                            style={{
                              padding: '4px 8px',
                              color: 'var(--text-secondary)',
                              fontSize: 'var(--font-size-small)'
                            }}
                          >
                            {desc}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className={styles.dialogFooter}>
          <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={reset}>
            Reset Defaults
          </button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
