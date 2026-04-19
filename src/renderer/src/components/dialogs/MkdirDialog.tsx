import React, { useState } from 'react'
import { Modal } from '../primitives/Modal'
import styles from '../../styles/dialogs.module.css'

interface MkdirDialogProps {
  onClose: () => void
  onSubmit: (name: string) => void | Promise<void>
}

export function MkdirDialog({ onClose, onSubmit }: MkdirDialogProps): React.JSX.Element {
  const [name, setName] = useState('')

  const submit = (): void => {
    const trimmed = name.trim()
    if (!trimmed) return
    onSubmit(trimmed)
  }

  return (
    <Modal
      onClose={onClose}
      title="Create Directory"
      width={360}
      bodyStyle={{ padding: 20 }}
      footer={
        <>
          <button
            className={`${styles.btn} ${styles.btnSecondary}`}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={submit}
            disabled={!name.trim()}
          >
            Create
          </button>
        </>
      }
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
          if (e.key === 'Escape') onClose()
        }}
        placeholder="Directory name"
        className={styles.settingsInput}
        style={{ width: '100%', boxSizing: 'border-box' }}
      />
    </Modal>
  )
}
