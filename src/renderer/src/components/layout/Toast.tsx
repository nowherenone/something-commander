import React, { useState, useCallback, useEffect, useRef } from 'react'
import styles from '../../styles/toast.module.css'

export type ToastVariant = 'info' | 'success' | 'error' | 'warning'

export interface ShowToastOptions {
  duration?: number
  variant?: ToastVariant
  /** If set, replaces any existing toast with the same key (prevents duplicates). */
  dedupeKey?: string
  /** Show a copy-to-clipboard control (default: only for error). */
  showCopy?: boolean
}

interface ToastMessage {
  id: number
  text: string
  duration: number
  variant: ToastVariant
  dedupeKey?: string
  showCopy: boolean
}

let toastCounter = 0
let addToastGlobal: ((text: string, opts?: ShowToastOptions) => void) | null = null

function normalizeOpts(
  durationOrOpts?: number | ShowToastOptions
): Required<Pick<ShowToastOptions, 'duration' | 'variant'>> &
  Pick<ShowToastOptions, 'dedupeKey' | 'showCopy'> {
  if (typeof durationOrOpts === 'number') {
    return { duration: durationOrOpts, variant: 'info' }
  }
  return {
    duration: durationOrOpts?.duration ?? 4000,
    variant: durationOrOpts?.variant ?? 'info',
    dedupeKey: durationOrOpts?.dedupeKey,
    showCopy: durationOrOpts?.showCopy
  }
}

/**
 * Show a toast from anywhere.
 * `showToast('msg')` or `showToast('msg', 5000)` or `showToast('msg', { variant: 'error' })`.
 */
export function showToast(text: string, durationOrOpts?: number | ShowToastOptions): void {
  const opts = normalizeOpts(durationOrOpts)
  addToastGlobal?.(text, opts)
}

function CopyIcon(): React.JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="2" />
      <path
        d="M7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  )
}

interface ToastItemProps {
  toast: ToastMessage
  onDismiss: () => void
}

function ToastItem({ toast, onDismiss }: ToastItemProps): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const dismiss = useCallback(() => {
    if (leaving) return
    setLeaving(true)
    leaveTimer.current = setTimeout(onDismiss, 120)
  }, [leaving, onDismiss])

  useEffect(() => {
    const t = setTimeout(dismiss, toast.duration)
    return () => {
      clearTimeout(t)
      if (leaveTimer.current) clearTimeout(leaveTimer.current)
    }
  }, [toast.duration, dismiss])

  const handleCopy = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation()
      try {
        await navigator.clipboard.writeText(toast.text)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1000)
      } catch {
        /* ignore */
      }
    },
    [toast.text]
  )

  const variantClass =
    toast.variant === 'success'
      ? styles.success
      : toast.variant === 'error'
        ? styles.error
        : toast.variant === 'warning'
          ? styles.warning
          : styles.info

  return (
    <div
      className={`${styles.toast} ${variantClass}${leaving ? ` ${styles.leaving}` : ''}`}
      onClick={dismiss}
      role="status"
    >
      <div className={styles.toastBody}>{toast.text}</div>
      {toast.showCopy && (
        <button
          type="button"
          className={`${styles.actionBtn}${copied ? ` ${styles.actionBtnActive}` : ''}`}
          onClick={handleCopy}
          title={copied ? 'Copied' : 'Copy'}
          aria-label={copied ? 'Copied' : 'Copy to clipboard'}
        >
          <CopyIcon />
        </button>
      )}
      <button
        type="button"
        className={styles.closeBtn}
        onClick={(e) => {
          e.stopPropagation()
          dismiss()
        }}
        aria-label="Dismiss"
        title="Dismiss"
      >
        ×
      </button>
    </div>
  )
}

export function ToastContainer(): React.JSX.Element {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const addToast = useCallback((text: string, opts?: ShowToastOptions) => {
    const duration = opts?.duration ?? 4000
    const variant = opts?.variant ?? 'info'
    const dedupeKey = opts?.dedupeKey
    const showCopy = opts?.showCopy ?? variant === 'error'
    const id = ++toastCounter

    setToasts((prev) => {
      const withoutDup = dedupeKey
        ? prev.filter((t) => t.dedupeKey !== dedupeKey && t.text !== text)
        : prev.filter((t) => t.text !== text)
      const next = [...withoutDup, { id, text, duration, variant, dedupeKey, showCopy }]
      return next.slice(-3)
    })
  }, [])

  useEffect(() => {
    addToastGlobal = addToast
    return () => {
      if (addToastGlobal === addToast) addToastGlobal = null
    }
  }, [addToast])

  return (
    <div className={styles.container} aria-live="polite">
      {toasts.map((t) => (
        <ToastItem
          key={t.id}
          toast={t}
          onDismiss={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
        />
      ))}
    </div>
  )
}
