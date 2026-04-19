import React, { useEffect, useRef } from 'react'
import styles from '../../styles/dialogs.module.css'

interface ModalProps {
  onClose: () => void
  title?: string
  width?: number | string
  wide?: boolean
  closeOnOverlayClick?: boolean
  closeOnEscape?: boolean
  children: React.ReactNode
  footer?: React.ReactNode
  bodyStyle?: React.CSSProperties
  dialogStyle?: React.CSSProperties
}

export function Modal({
  onClose,
  title,
  width,
  wide,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  children,
  footer,
  bodyStyle,
  dialogStyle
}: ModalProps): React.JSX.Element {
  const previouslyFocused = useRef<Element | null>(null)

  useEffect(() => {
    previouslyFocused.current = document.activeElement
    return () => {
      const prev = previouslyFocused.current as HTMLElement | null
      if (prev && typeof prev.focus === 'function') prev.focus()
    }
  }, [])

  useEffect(() => {
    if (!closeOnEscape) return
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [closeOnEscape, onClose])

  const mergedDialogStyle: React.CSSProperties = { ...dialogStyle }
  if (width !== undefined) mergedDialogStyle.width = width

  return (
    <div
      className={styles.overlay}
      onClick={closeOnOverlayClick ? onClose : undefined}
    >
      <div
        className={`${styles.dialog} ${wide ? styles.dialogWide : ''}`}
        style={mergedDialogStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {title !== undefined && <div className={styles.dialogTitle}>{title}</div>}
        <div className={styles.dialogBody} style={bodyStyle}>
          {children}
        </div>
        {footer && <div className={styles.dialogFooter}>{footer}</div>}
      </div>
    </div>
  )
}
