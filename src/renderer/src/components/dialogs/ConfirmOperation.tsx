import React, { useState, useEffect, useRef } from 'react'
import type { Entry } from '@shared/types'
import { formatSize } from '../../utils/format'
import { useOverlayStore } from '../../stores/overlay-store'
import styles from '../../styles/dialogs.module.css'

interface ArchiveFormat {
  label: string
  extensions: string[]
  primaryExtension: string
  supportsWrite: boolean
}

interface ConfirmOperationProps {
  type: 'copy' | 'move' | 'delete' | 'pack' | 'unpack'
  entries: Entry[]
  sourceDir: string
  destDir: string
  onConfirm: (destDir: string) => void
  onCancel: () => void
}

export function ConfirmOperation({
  type,
  entries,
  sourceDir,
  destDir,
  onConfirm,
  onCancel
}: ConfirmOperationProps): React.JSX.Element {
  const [editDest, setEditDest] = useState(destDir)
  const [writableFormats, setWritableFormats] = useState<ArchiveFormat[]>([])
  const [selectedFormat, setSelectedFormat] = useState<string>('')
  const destInputRef = useRef<HTMLInputElement>(null)

  const totalSize = entries.reduce((sum, e) => sum + (e.size > 0 ? e.size : 0), 0)
  const fileCount = entries.filter((e) => !e.isContainer).length
  const dirCount = entries.filter((e) => e.isContainer).length
  const isSingleFileRename =
    (type === 'copy' || type === 'move') && entries.length === 1 && !entries[0].isContainer

  useEffect(() => {
    if (type !== 'pack') return
    window.api.util.getArchiveFormats().then((formats) => {
      const writable = formats.filter((f) => f.supportsWrite)
      setWritableFormats(writable)
      const current = writable.find((f) =>
        f.extensions.some((ext) => editDest.toLowerCase().endsWith(ext))
      )
      setSelectedFormat(current?.primaryExtension ?? writable[0]?.primaryExtension ?? '.zip')
    })
  }, [type]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleFormatChange = (primaryExt: string): void => {
    setSelectedFormat(primaryExt)
    const allExts = writableFormats.flatMap((f) => f.extensions)
    const matchedExt = allExts.find((ext) => editDest.toLowerCase().endsWith(ext))
    if (matchedExt) {
      setEditDest(editDest.slice(0, editDest.length - matchedExt.length) + primaryExt)
    } else {
      setEditDest(editDest + primaryExt)
    }
  }

  const typeLabel =
    type === 'copy'
      ? 'Copy'
      : type === 'move'
        ? 'Move'
        : type === 'delete'
          ? 'Delete'
          : type === 'pack'
            ? 'Pack'
            : 'Unpack'
  const destLabel =
    type === 'pack'
      ? 'Archive:'
      : type === 'unpack'
        ? 'Extract to:'
        : isSingleFileRename
          ? 'To (path or file name):'
          : 'To:'

  useEffect(() => {
    if (!isSingleFileRename) return
    const el = destInputRef.current
    if (!el) return
    const v = el.value
    const slash = Math.max(v.lastIndexOf('/'), v.lastIndexOf('\\'))
    const start = slash >= 0 ? slash + 1 : 0
    const dot = v.lastIndexOf('.')
    const end = dot > start ? dot : v.length
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start, end)
    })
  }, [isSingleFileRename])

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        onConfirm(editDest)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onCancel()
      } else if (!(document.activeElement instanceof HTMLInputElement)) {
        e.stopPropagation()
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [editDest, onConfirm, onCancel])

  useEffect(() => {
    const overlayId = 'confirm-op'
    useOverlayStore.getState().push({ id: overlayId, onEscape: onCancel })
    return () => {
      const o = useOverlayStore.getState()
      if (o.isTop(overlayId)) o.pop()
    }
  }, [onCancel])

  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div
        className={`${styles.dialog} ${styles.confirmDialog}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.dialogTitle}>{typeLabel}</div>
        <div className={styles.dialogBody}>
          <div className={styles.confirmSection}>
            <div className={styles.confirmMeta}>
              {type === 'pack' ? 'Pack' : type === 'unpack' ? 'Unpack' : typeLabel}{' '}
              {entries.length} item{entries.length !== 1 ? 's' : ''}
              {fileCount > 0 && ` (${fileCount} file${fileCount !== 1 ? 's' : ''}`}
              {dirCount > 0 && `${fileCount > 0 ? ', ' : ' ('}${dirCount} folder${dirCount !== 1 ? 's' : ''}`}
              {(fileCount > 0 || dirCount > 0) && ')'}
              {totalSize > 0 && ` — ${formatSize(totalSize)}`}
            </div>
            <div className={styles.confirmList}>
              {entries.slice(0, 20).map((e) => (
                <div key={e.id}>
                  {e.isContainer ? '\uD83D\uDCC1 ' : '\uD83D\uDCC4 '}
                  {e.name}
                </div>
              ))}
              {entries.length > 20 && (
                <div>...and {entries.length - 20} more</div>
              )}
            </div>
          </div>

          {type !== 'delete' && (
            <div className={styles.confirmSection}>
              <div className={styles.confirmFieldLabel}>From</div>
              <div className={styles.confirmPath}>{sourceDir}</div>
            </div>
          )}

          {type === 'pack' && writableFormats.length > 1 && (
            <div className={styles.confirmSection}>
              <div className={styles.confirmFieldLabel}>Format</div>
              <div className={styles.chipRow}>
                {writableFormats.map((fmt) => (
                  <button
                    key={fmt.primaryExtension}
                    type="button"
                    className={`${styles.chip}${selectedFormat === fmt.primaryExtension ? ` ${styles.chipActive}` : ''}`}
                    onClick={() => handleFormatChange(fmt.primaryExtension)}
                  >
                    {fmt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {type !== 'delete' && (
            <div className={styles.confirmSection}>
              <div className={styles.confirmFieldLabel}>{destLabel}</div>
              <input
                ref={destInputRef}
                autoFocus
                className={styles.confirmInput}
                value={editDest}
                onChange={(e) => setEditDest(e.target.value)}
              />
              {isSingleFileRename && (
                <p className={styles.settingsHint} style={{ marginTop: 'var(--space-2)' }}>
                  Edit the file name to copy/move under a new name (same folder is fine).
                </p>
              )}
            </div>
          )}

          {type === 'delete' && (
            <div className={styles.confirmDanger}>This action cannot be undone.</div>
          )}
        </div>
        <div className={styles.dialogFooter}>
          <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={onCancel}>
            Cancel
          </button>
          <button
            className={`${styles.btn} ${type === 'delete' ? styles.btnDanger : styles.btnPrimary}`}
            onClick={() => onConfirm(editDest)}
            autoFocus={type === 'delete'}
          >
            {typeLabel} (Enter)
          </button>
        </div>
      </div>
    </div>
  )
}
