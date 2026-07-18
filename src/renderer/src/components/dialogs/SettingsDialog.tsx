import React, { useState } from 'react'
import {
  useSettingsStore,
  COLOR_OVERRIDE_META,
  type ColorOverrideKey,
  type ThemeName
} from '../../stores/settings-store'
import { Modal } from '../primitives/Modal'
import { showToast } from '../layout/Toast'
import { usePanelStore } from '../../stores/panel-store'
import { runUpdateCheck } from '../../utils/update-notifications'
import { cssColorToHex } from '../../utils/css-color'
import styles from '../../styles/dialogs.module.css'

interface SettingsDialogProps {
  onClose: () => void
}

/** Leaner surface: essentials only (store keys for removed UI remain for compat). */
const TABS = [
  { id: 'general', label: 'General' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'behavior', label: 'Behavior' },
  { id: 'keyboard', label: 'Keyboard' }
] as const

type TabId = (typeof TABS)[number]['id']

const KEYBOARD_SHORTCUTS: ReadonlyArray<readonly [string, string]> = [
  ['Tab', 'Switch panel'],
  ['Enter', 'Open / navigate into'],
  ['Backspace', 'Go to parent'],
  ['Space', 'Select/deselect + calc folder size'],
  ['Insert', 'Toggle select + move down'],
  ['F2', 'Rename'],
  ['F3 / F4', 'View / Edit'],
  ['F5 / F6', 'Copy / Move'],
  ['F7 / F8', 'New folder / Delete'],
  ['F9', 'Settings'],
  ['Ctrl+T / W', 'New / close tab'],
  ['Ctrl+H', 'Toggle hidden files'],
  ['Ctrl+L', 'Focus address bar'],
  ['Alt+F7', 'Search']
]

/** Effective color currently applied to the document for the given variable. */
function currentColor(key: ColorOverrideKey): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(key)
  return cssColorToHex(raw)
}

export function SettingsDialog({ onClose }: SettingsDialogProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('general')
  const settings = useSettingsStore()
  const update = useSettingsStore((s) => s.updateSettings)
  const reset = useSettingsStore((s) => s.resetSettings)
  const setColorOverride = useSettingsStore((s) => s.setColorOverride)
  const resetColorOverrides = useSettingsStore((s) => s.resetColorOverrides)

  return (
    <Modal
      id="settings"
      onClose={onClose}
      title="Settings"
      wide
      footer={
        <>
          <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={reset}>
            Reset Defaults
          </button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={onClose}>
            Done
          </button>
        </>
      }
    >
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
          {activeTab === 'general' && (
            <>
              <div className={styles.settingsGroup}>
                <div className={styles.settingsGroupTitle}>Theme</div>
                <div className={styles.settingsRow}>
                  <span className={styles.settingsLabel}>Color theme</span>
                  <select
                    className={styles.settingsSelect}
                    value={settings.theme}
                    onChange={(e) => update({ theme: e.target.value as ThemeName })}
                  >
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                    <option value="monokai">Monokai</option>
                    <option value="classic">Classic (Norton)</option>
                  </select>
                </div>
              </div>

              <div className={styles.settingsGroup}>
                <div className={styles.settingsGroupTitle}>Files</div>
                <label className={styles.settingsCheckbox}>
                  <input
                    type="checkbox"
                    checked={settings.showHiddenFiles}
                    onChange={(e) => {
                      update({ showHiddenFiles: e.target.checked })
                      usePanelStore.getState().refreshAllPanels()
                    }}
                  />
                  <span className={styles.settingsLabel}>Show hidden files</span>
                </label>
                <div className={styles.settingsRow}>
                  <span className={styles.settingsLabel}>Size format</span>
                  <select
                    className={styles.settingsSelect}
                    value={settings.sizeFormat}
                    onChange={(e) => update({ sizeFormat: e.target.value as 'full' | 'short' })}
                  >
                    <option value="full">Full (1,234,567)</option>
                    <option value="short">Short (1 MB)</option>
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
                <div className={styles.settingsGroupTitle}>Chrome</div>
                <div className={styles.settingsRow}>
                  <span className={styles.settingsLabel}>Bottom bar</span>
                  <select
                    className={styles.settingsSelect}
                    value={settings.bottomBar}
                    onChange={(e) =>
                      update({ bottomBar: e.target.value as 'fnkeys' | 'status' | 'none' })
                    }
                  >
                    <option value="fnkeys">Function keys</option>
                    <option value="status">None (panel status only)</option>
                    <option value="none">Hidden</option>
                  </select>
                </div>
                <label className={styles.settingsCheckbox}>
                  <input
                    type="checkbox"
                    checked={settings.showCommandLine}
                    onChange={(e) => update({ showCommandLine: e.target.checked })}
                  />
                  <span className={styles.settingsLabel}>Show command line</span>
                </label>
              </div>
            </>
          )}

          {activeTab === 'appearance' && (
            <>
              <div className={styles.settingsGroup}>
                <div className={styles.settingsGroupTitle}>List typography</div>
                <div className={styles.settingsRow}>
                  <span className={styles.settingsLabel}>Font size</span>
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
                  <span className={styles.settingsLabel}>Row height</span>
                  <input
                    type="number"
                    className={styles.settingsInput}
                    value={settings.rowHeight}
                    min={18}
                    max={40}
                    onChange={(e) => update({ rowHeight: Number(e.target.value) })}
                  />
                </div>
                <div className={styles.settingsRow}>
                  <span className={styles.settingsLabel}>List font</span>
                  <select
                    className={`${styles.settingsSelect} ${styles.inputWide}`}
                    value={settings.fontFamily}
                    onChange={(e) => update({ fontFamily: e.target.value })}
                  >
                    <option value="'SF Mono', 'Cascadia Code', 'Menlo', 'Consolas', 'Fira Code', ui-monospace, monospace">
                      Mono (default)
                    </option>
                    <option value="'Cascadia Code', 'Consolas', monospace">Cascadia Code</option>
                    <option value="'JetBrains Mono', monospace">JetBrains Mono</option>
                    <option value="-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif">
                      System UI
                    </option>
                  </select>
                </div>
              </div>

              <div className={styles.settingsGroup}>
                <div className={styles.settingsGroupTitle}>Color overrides</div>
                <p className={styles.settingsHint}>
                  Optional. Layers on the active theme; clear a swatch to restore the theme default.
                </p>
                {COLOR_OVERRIDE_META.map(({ key, label }) => {
                  const override = settings.colorOverrides[key]
                  const displayColor = override ?? currentColor(key)
                  return (
                    <div key={key} className={styles.settingsRow}>
                      <span className={styles.settingsLabel}>{label}</span>
                      <div className={styles.colorPickerRow}>
                        <input
                          type="color"
                          className={styles.colorSwatch}
                          aria-label={label}
                          value={displayColor}
                          onChange={(e) => setColorOverride(key, e.target.value)}
                        />
                        <span
                          className={`${styles.colorHex}${override ? ` ${styles.colorHexActive}` : ''}`}
                        >
                          {displayColor}
                        </span>
                        <button
                          type="button"
                          className={`${styles.btn} ${styles.btnSecondary} ${styles.btnCompact}`}
                          disabled={!override}
                          onClick={() => setColorOverride(key, null)}
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                  )
                })}
                <div className={styles.settingsActions}>
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnSecondary}`}
                    onClick={resetColorOverrides}
                    disabled={Object.keys(settings.colorOverrides).length === 0}
                  >
                    Reset colors
                  </button>
                </div>
              </div>
            </>
          )}

          {activeTab === 'behavior' && (
            <>
              <div className={styles.settingsGroup}>
                <div className={styles.settingsGroupTitle}>Confirmations</div>
                <label className={styles.settingsCheckbox}>
                  <input
                    type="checkbox"
                    checked={settings.confirmDelete}
                    onChange={(e) => update({ confirmDelete: e.target.checked })}
                  />
                  <span className={styles.settingsLabel}>Confirm before delete</span>
                </label>
                <label className={styles.settingsCheckbox}>
                  <input
                    type="checkbox"
                    checked={settings.confirmOverwrite}
                    onChange={(e) => update({ confirmOverwrite: e.target.checked })}
                  />
                  <span className={styles.settingsLabel}>Confirm before overwrite</span>
                </label>
              </div>

              <div className={styles.settingsGroup}>
                <div className={styles.settingsGroupTitle}>Command line</div>
                <div className={styles.settingsRow}>
                  <span className={styles.settingsLabel}>Shell</span>
                  <input
                    className={`${styles.settingsInput} ${styles.inputWide}`}
                    value={settings.shell}
                    onChange={(e) => update({ shell: e.target.value })}
                  />
                </div>
              </div>

              <div className={styles.settingsGroup}>
                <div className={styles.settingsGroupTitle}>Updates</div>
                <label className={styles.settingsCheckbox}>
                  <input
                    type="checkbox"
                    checked={settings.autoCheckForUpdates}
                    onChange={(e) => update({ autoCheckForUpdates: e.target.checked })}
                  />
                  <span className={styles.settingsLabel}>Check for updates on startup</span>
                </label>
                <label className={styles.settingsCheckbox}>
                  <input
                    type="checkbox"
                    checked={settings.autoDownloadUpdates}
                    onChange={(e) => update({ autoDownloadUpdates: e.target.checked })}
                  />
                  <span className={styles.settingsLabel}>
                    Pre-download in background (install via the Update badge next to the version)
                  </span>
                </label>
                <p className={styles.settingsHint}>
                  When an update is available, a badge appears beside the version in the menu bar.
                  Click it to install and restart — no toast spam.
                </p>
                <div className={styles.settingsActions} style={{ justifyContent: 'flex-start' }}>
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnPrimary}`}
                    onClick={async () => {
                      const api = (window as any).api
                      if (!api?.update?.checkForUpdates) {
                        showToast('Update system not available', { variant: 'warning' })
                        return
                      }
                      try {
                        await runUpdateCheck({
                          announceCurrent: true,
                          autoDownload: settings.autoDownloadUpdates
                        })
                      } catch {
                        showToast('Failed to check for updates', {
                          duration: 8000,
                          variant: 'error'
                        })
                      }
                    }}
                  >
                    Check now
                  </button>
                </div>
              </div>
            </>
          )}

          {activeTab === 'keyboard' && (
            <div className={styles.settingsGroup}>
              <div className={styles.settingsGroupTitle}>Shortcuts</div>
              <p className={styles.settingsHint}>Read-only reference. Custom binding editor is not exposed here.</p>
              <table className={styles.dataTable}>
                <tbody>
                  {KEYBOARD_SHORTCUTS.map(([key, desc]) => (
                    <tr key={key}>
                      <td style={{ width: '38%', fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>
                        {key}
                      </td>
                      <td className={styles.mutedText}>{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
