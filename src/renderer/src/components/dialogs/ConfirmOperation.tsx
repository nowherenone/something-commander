import React, { useState, useEffect } from 'react'
import type { Entry } from '@shared/types'
import { formatSize } from '../../utils/format'
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

  const totalSize = entries.reduce((sum, e) => sum + (e.size > 0 ? e.size : 0), 0)
  const fileCount = entries.filter((e) => !e.isContainer).length
  const dirCount = entries.filter((e) => e.isContainer).length

  // Load writable archive formats for the pack dialog
  useEffect(() => {
    if (type !== 'pack') return
    window.api.util.getArchiveFormats().then((formats) => {
      const writable = formats.filter((f) => f.supportsWrite)
      setWritableFormats(writable)
      // Detect which format the current path uses, or default to first writable
      const current = writable.find((f) => f.extensions.some((ext) => editDest.toLowerCase().endsWith(ext)))
      setSelectedFormat(current?.primaryExtension ?? writable[0]?.primaryExtension ?? '.zip')
    })
  }, [type]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleFormatChange = (primaryExt: string): void => {
    setSelectedFormat(primaryExt)
    // Swap the extension in the current path
    const allExts = writableFormats.flatMap((f) => f.extensions)
    const matchedExt = allExts.find((ext) => editDest.toLowerCase().endsWith(ext))
    if (matchedExt) {
      setEditDest(editDest.slice(0, editDest.length - matchedExt.length) + primaryExt)
    } else {
      // No known extension — append the new one
      setEditDest(editDest + primaryExt)
    }
  }

  const typeLabel = type === 'copy' ? 'Copy'
    : type === 'move' ? 'Move'
    : type === 'delete' ? 'Delete'
    : type === 'pack' ? 'Pack'
    : 'Unpack'
  const destLabel = type === 'pack' ? 'Archive:' : type === 'unpack' ? 'Extract to:' : 'To:'

  // Capture keyboard: Enter confirms, Escape cancels, block everything else from panels
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
      } else {
        if (!(document.activeElement instanceof HTMLInputElement)) {
          e.stopPropagation()
        }
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [editDest, onConfirm, onCancel])

  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.dialog} style={{ width: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className={styles.dialogTitle}>{typeLabel}</div>
        <div className={styles.dialogBody} style={{ padding: '12px 16px' }}>
          {/* What */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
              {type === 'pack' ? 'Pack' : type === 'unpack' ? 'Unpack' : typeLabel}{' '}
              {entries.length} item{entries.length !== 1 ? 's' : ''}
              {fileCount > 0 && ` (${fileCount} file${fileCount !== 1 ? 's' : ''}`}
              {dirCount > 0 && `, ${dirCount} folder${dirCount !== 1 ? 's' : ''}`}
              {(fileCount > 0 || dirCount > 0) && ')'}
              {totalSize > 0 && ` — ${formatSize(totalSize)}`}
            </div>
            <div style={{
              maxHeight: 80,
              overflow: 'auto',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-muted)',
              background: 'var(--bg-tertiary)',
              borderRadius: 3,
              padding: '4px 8px'
            }}>
              {entries.slice(0, 20).map((e) => (
                <div key={e.id}>{e.isContainer ? '\uD83D\uDCC1 ' : '\uD83D\uDCC4 '}{e.name}</div>
              ))}
              {entries.length > 20 && (
                <div style={{ color: 'var(--text-muted)' }}>...and {entries.length - 20} more</div>
              )}
            </div>
          </div>

          {/* From */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>From:</div>
            <div style={{
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-secondary)',
              padding: '3px 8px',
              background: 'var(--bg-tertiary)',
              borderRadius: 3,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {sourceDir}
            </div>
          </div>

          {/* Format selector (pack only) */}
          {type === 'pack' && writableFormats.length > 1 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Format:</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {writableFormats.map((fmt) => (
                  <button
                    key={fmt.primaryExtension}
                    onClick={() => handleFormatChange(fmt.primaryExtension)}
                    style={{
                      padding: '2px 10px',
                      background: selectedFormat === fmt.primaryExtension ? 'var(--accent)' : 'var(--bg-tertiary)',
                      color: selectedFormat === fmt.primaryExtension ? 'white' : 'var(--text-secondary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 3,
                      fontSize: 11,
                      cursor: 'pointer'
                    }}
                  >
                    {fmt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Destination (editable for copy/move/pack/unpack) */}
          {type !== 'delete' && (
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{destLabel}</div>
              <input
                autoFocus
                value={editDest}
                onChange={(e) => setEditDest(e.target.value)}
                style={{
                  width: '100%',
                  padding: '4px 8px',
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-focus)',
                  borderRadius: 3,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12
                }}
              />
            </div>
          )}

          {type === 'delete' && (
            <div style={{
              color: 'var(--danger)',
              fontSize: 12,
              padding: '8px 0'
            }}>
              This action cannot be undone.
            </div>
          )}
        </div>
        <div className={styles.dialogFooter}>
          <button
            className={`${styles.btn} ${styles.btnSecondary}`}
            onClick={onCancel}
          >
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
