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

export function ToastContainer(): React.JSX.Element {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const addToast = useCallback((text: string, duration = 7000) => {
    const id = ++toastCounter
    setToasts((prev) => [...prev, { id, text, duration }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, duration)
  }, [])

  // Register global access
  addToastGlobal = addToast

  return (
    <div className={styles.container}>
      {toasts.map((t) => (
        <div
          key={t.id}
          className={styles.toast}
          style={{ animationDuration: `0.2s, ${t.duration}ms` }}
          onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
        >
          {t.text}
        </div>
      ))}
    </div>
  )
}
