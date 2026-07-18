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
    duration: durationOrOpts?.duration ?? 4500,
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

function Icon({ variant }: { variant: ToastVariant }): React.JSX.Element {
  const common = {
    width: 16,
    height: 16,
    viewBox: '0 0 16 16',
    fill: 'none',
    'aria-hidden': true as const
  }
  if (variant === 'success') {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
        <path d="M4.5 8.2L7 10.5L11.5 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (variant === 'error') {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5.5 5.5L10.5 10.5M10.5 5.5L5.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    )
  }
  if (variant === 'warning') {
    return (
      <svg {...common}>
        <path
          d="M8 2.5L14 13.5H2L8 2.5Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path d="M8 6.5V9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="8" cy="11.5" r="0.75" fill="currentColor" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 7.2V11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="5" r="0.85" fill="currentColor" />
    </svg>
  )
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
    leaveTimer.current = setTimeout(onDismiss, 180)
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
        window.setTimeout(() => setCopied(false), 1200)
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
      <span className={styles.icon} aria-hidden>
        <Icon variant={toast.variant} />
      </span>
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
    const duration = opts?.duration ?? 4500
    const variant = opts?.variant ?? 'info'
    const dedupeKey = opts?.dedupeKey
    const showCopy = opts?.showCopy ?? variant === 'error'
    const id = ++toastCounter

    setToasts((prev) => {
      const withoutDup = dedupeKey
        ? prev.filter((t) => t.dedupeKey !== dedupeKey && t.text !== text)
        : prev.filter((t) => t.text !== text)
      // Cap stack so the corner doesn't explode
      const next = [...withoutDup, { id, text, duration, variant, dedupeKey, showCopy }]
      return next.slice(-4)
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
