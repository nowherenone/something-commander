import React, { useState, useEffect, useRef } from 'react'
import styles from '../../styles/dialogs.module.css'

interface SelectGroupDialogProps {
  mode: 'select' | 'unselect'
  onConfirm: (pattern: string) => void
  onCancel: () => void
}

export function SelectGroupDialog({ mode, onConfirm, onCancel }: SelectGroupDialogProps): React.JSX.Element {
  const [pattern, setPattern] = useState('*.*')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.select()
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        if (pattern.trim()) onConfirm(pattern.trim())
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
  }, [pattern, onConfirm, onCancel])

  const title = mode === 'select' ? 'Select Group' : 'Unselect Group'

  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.dialog} style={{ width: 340 }} onClick={(e) => e.stopPropagation()}>
        <div className={styles.dialogTitle}>{title}</div>
        <div className={styles.dialogBody} style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
            Enter file mask (e.g. *.txt, file*, *.js):
          </div>
          <input
            ref={inputRef}
            autoFocus
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            style={{
              width: '100%',
              padding: '4px 8px',
              background: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-focus)',
              borderRadius: 3,
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              boxSizing: 'border-box'
            }}
          />
        </div>
        <div className={styles.dialogFooter}>
          <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={onCancel}>
            Cancel
          </button>
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={() => pattern.trim() && onConfirm(pattern.trim())}
          >
            OK (Enter)
          </button>
        </div>
      </div>
    </div>
  )
}
