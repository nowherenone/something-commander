import React, { useCallback, useRef } from 'react'
import { useAppStore } from '../../stores/app-store'

export function Splitter(): React.JSX.Element {
  const setSplitRatio = useAppStore((s) => s.setSplitRatio)
  const isDragging = useRef(false)

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      isDragging.current = true
      const container = (e.target as HTMLElement).parentElement!

      const onMouseMove = (e: MouseEvent): void => {
        if (!isDragging.current) return
        const rect = container.getBoundingClientRect()
        const ratio = (e.clientX - rect.left) / rect.width
        setSplitRatio(ratio)
      }

      const onMouseUp = (): void => {
        isDragging.current = false
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    [setSplitRatio]
  )

  return (
    <div
      onMouseDown={onMouseDown}
      style={{
        width: 'var(--splitter-width)',
        cursor: 'col-resize',
        background: 'var(--border-color)',
        flexShrink: 0,
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => ((e.target as HTMLElement).style.background = 'var(--accent)')}
      onMouseLeave={(e) => ((e.target as HTMLElement).style.background = 'var(--border-color)')}
    />
  )
}
