import React from 'react'
import { Modal } from '../primitives/Modal'
import styles from '../../styles/dialogs.module.css'

declare const __APP_VERSION__: string

/**
 * About + Help. Doubles as the F1 "Help" surface from the function-key bar:
 * the shortcut table answers "what can I do here" for newcomers (the app's
 * only in-product help), so it lives here rather than in a separate dialog.
 */
const HELP_SHORTCUTS: ReadonlyArray<readonly [string, string]> = [
  ['F5 / F6', 'Copy / Move to other panel'],
  ['F7 / F8', 'New folder / Delete'],
  ['F2', 'Rename'],
  ['F3 / F4', 'View / Edit file'],
  ['Tab', 'Switch panel'],
  ['Space / Insert', 'Select files'],
  ['Ctrl+C', 'Copy selected names'],
  ['Alt+F7', 'Search']
]

interface AboutDialogProps {
  onClose: () => void
}

export function AboutDialog({ onClose }: AboutDialogProps): React.JSX.Element {
  return (
    <Modal
      id="about"
      onClose={onClose}
      title="About"
      width={420}
      footer={
        <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={onClose} data-testid="about-close">
          Close
        </button>
      }
    >
      <div data-testid="about-dialog">
        <div className={styles.aboutHeader}>
          <div className={styles.aboutName}>Something Commander</div>
          <div className={styles.aboutVersion} data-testid="about-version">Version {__APP_VERSION__}</div>
          <p className={styles.aboutTagline}>
            A modern orthodox two-panel file manager.
          </p>
        </div>

        <div className={styles.settingsGroup}>
          <div className={styles.settingsGroupTitle}>Shortcuts</div>
          <table className={styles.dataTable}>
            <tbody>
              {HELP_SHORTCUTS.map(([key, desc]) => (
                <tr key={key}>
                  <td className={styles.aboutKey}>{key}</td>
                  <td className={styles.mutedText}>{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={styles.settingsHint}>
            The full list lives in Settings ▸ Keyboard. Every action is also in the menus.
          </p>
        </div>

        <p className={styles.aboutLinks}>
          <a
            href="https://github.com/nowherenone/something-commander/releases"
            target="_blank"
            rel="noreferrer noopener"
          >
            Releases
          </a>
          <span aria-hidden="true"> · </span>
          <a
            href="https://github.com/nowherenone/something-commander"
            target="_blank"
            rel="noreferrer noopener"
          >
            Project page
          </a>
        </p>
        <p className={styles.aboutLicense}>MIT License · Something Commander Contributors</p>
      </div>
    </Modal>
  )
}
