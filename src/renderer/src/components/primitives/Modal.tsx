import React, { useEffect, useRef } from 'react'
import { useOverlayStore } from '../../stores/overlay-store'
import styles from '../../styles/dialogs.module.css'

interface ModalProps {
  id?: string
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
  id,
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
  const overlayId = id || `modal-${Date.now()}`

  useEffect(() => {
    previouslyFocused.current = document.activeElement
    return () => {
      const prev = previouslyFocused.current as HTMLElement | null
      if (prev && typeof prev.focus === 'function') prev.focus()
    }
  }, [])

  useEffect(() => {
    if (!closeOnEscape) return
    const overlay = useOverlayStore.getState()
    overlay.push({ id: overlayId, onEscape: onClose })
    return () => {
      // Only pop if still top to avoid removing wrong one
      if (overlay.isTop(overlayId)) {
        overlay.pop()
      }
    }
  }, [closeOnEscape, onClose, overlayId])

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
