import React, { useCallback, useEffect, useRef, useState } from 'react'
import styles from '../styles/file-content.module.css'

const DEFAULT_LINE_HEIGHT = 18
const DEFAULT_VISIBLE_BUFFER = 50

interface FileContentViewProps {
  lines: string[]
  /** Estimated total line count (may exceed lines.length while loading) */
  totalLines?: number
  searchText?: string
  showLineNumbers?: boolean
  lineHeight?: number
  visibleBuffer?: number
  /** Called when the user scrolls within `loadAheadLines` of the end of loaded content */
  onNearEnd?: () => void
  loadAheadLines?: number
}

export function FileContentView({
  lines,
  totalLines,
  searchText,
  showLineNumbers = false,
  lineHeight = DEFAULT_LINE_HEIGHT,
  visibleBuffer = DEFAULT_VISIBLE_BUFFER,
  onNearEnd,
  loadAheadLines = 300
}: FileContentViewProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop)
  }, [])

  // Reset scroll when content changes (new file)
  const prevFirstLine = useRef(lines[0])
  useEffect(() => {
    if (lines[0] !== prevFirstLine.current) {
      prevFirstLine.current = lines[0]
      setScrollTop(0)
      if (containerRef.current) containerRef.current.scrollTop = 0
    }
  }, [lines])

  useEffect(() => {
    if (!onNearEnd) return
    const viewportHeight = containerRef.current?.clientHeight || 600
    const lastVisible = Math.ceil((scrollTop + viewportHeight) / lineHeight) + visibleBuffer
    if (lastVisible >= lines.length - loadAheadLines) {
      onNearEnd()
    }
  }, [scrollTop, lines.length, onNearEnd, lineHeight, visibleBuffer, loadAheadLines])

  const viewportHeight = containerRef.current?.clientHeight || 600
  const total = totalLines ?? lines.length
  const startLine = Math.max(0, Math.floor(scrollTop / lineHeight) - visibleBuffer)
  const endLine = Math.min(lines.length, Math.ceil((scrollTop + viewportHeight) / lineHeight) + visibleBuffer)
  const visibleLines = lines.slice(startLine, endLine)

  return (
    <div ref={containerRef} onScroll={handleScroll} className={styles.container}>
      <div className={styles.spacer} style={{ height: total * lineHeight }}>
        <div className={styles.slice} style={{ top: startLine * lineHeight, lineHeight: `${lineHeight}px` }}>
          {visibleLines.map((line, i) => {
            const lineNum = startLine + i + 1
            const highlight = !!searchText && line.toLowerCase().includes(searchText.toLowerCase())
            return (
              <div
                key={lineNum}
                className={`${styles.line} ${highlight ? styles.lineHighlight : ''}`}
                style={{ height: lineHeight }}
              >
                {showLineNumbers && (
                  <span className={styles.lineNumber}>{lineNum}</span>
                )}
                <span className={styles.lineText}>{line}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
