import React, { useState, useCallback } from 'react'
import styles from '../../styles/toast.module.css'

interface ToastMessage {
  id: number
  text: string
  duration: number
}

let toastCounter = 0
let addToastGlobal: ((text: string, duration?: number) => void) | null = null

/** Show a toast from anywhere */
export function showToast(text: string, duration = 7000): void {
  addToastGlobal?.(text, duration)
}

function CopyIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1"
        stroke="currentColor"
        strokeWidth="1.75"
      />
    </svg>
  )
}

interface ToastItemProps {
  text: string
  duration: number
  onDismiss: () => void
}

function ToastItem({ text, duration, onDismiss }: ToastItemProps): React.JSX.Element {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation()
      try {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1500)
      } catch {
        showToast('Could not copy to clipboard', 3000)
      }
    },
    [text]
  )

  return (
    <div
      className={styles.toast}
      style={{ animationDuration: `0.2s, ${duration}ms` }}
      onClick={onDismiss}
      role="status"
    >
      <div className={styles.toastBody}>{text}</div>
      <button
        type="button"
        className={`${styles.copyBtn}${copied ? ` ${styles.copyBtnCopied}` : ''}`}
        onClick={handleCopy}
        title={copied ? 'Copied' : 'Copy to clipboard'}
        aria-label={copied ? 'Copied' : 'Copy to clipboard'}
      >
        <CopyIcon />
      </button>
    </div>
  )
}

export function ToastContainer(): React.JSX.Element {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const addToast = useCallback((text: string, duration = 7000) => {
    const id = ++toastCounter
    setToasts((prev) => [...prev, { id, text, duration }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, duration)
  }, [])

  addToastGlobal = addToast

  return (
    <div className={styles.container}>
      {toasts.map((t) => (
        <ToastItem
          key={t.id}
          text={t.text}
          duration={t.duration}
          onDismiss={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
        />
      ))}
    </div>
  )
}