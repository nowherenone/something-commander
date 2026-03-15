import React, { useEffect, useState, useCallback } from 'react'
import { formatSize } from '../../utils/format'
import styles from '../../styles/dialogs.module.css'

interface FileViewerProps {
  filePath: string
  fileName: string
  onClose: () => void
}

type ViewMode = 'text' | 'hex'

export function FileViewer({ filePath, fileName, onClose }: FileViewerProps): React.JSX.Element {
  const [content, setContent] = useState('')
  const [isBinary, setIsBinary] = useState(false)
  const [totalSize, setTotalSize] = useState(0)
  const [truncated, setTruncated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('text')
  const [searchText, setSearchText] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    setIsLoading(true)
    window.api.util.readFileContent(filePath).then((result) => {
      if (result.error) {
        setError(result.error)
      } else {
        setContent(result.content)
        setIsBinary(result.isBinary)
        setTotalSize(result.totalSize)
        setTruncated(result.truncated)
        if (result.isBinary) setViewMode('hex')
      }
      setIsLoading(false)
    })
  }, [filePath])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose]
  )

  // Format hex content for display
  const hexContent = viewMode === 'hex' && content ? formatHex(content) : ''

  // Highlight search matches
  const displayContent = viewMode === 'text' ? content : hexContent

  return (
    <div className={styles.overlay} onClick={onClose} onKeyDown={handleKeyDown}>
      <div
        className={styles.dialog}
        style={{ width: '80vw', height: '80vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={styles.dialogTitle}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <span>
            [F3] View: {fileName}{' '}
            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
              ({formatSize(totalSize)}
              {truncated ? ' - truncated' : ''})
            </span>
          </span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              placeholder="Search (Ctrl+F)"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{
                width: 150,
                padding: '2px 6px',
                background: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: 3,
                fontSize: 11,
                fontFamily: 'var(--font-family)'
              }}
            />
            <button
              className={`${styles.btn} ${viewMode === 'text' ? styles.btnPrimary : styles.btnSecondary}`}
              style={{ padding: '2px 8px', fontSize: 11 }}
              onClick={() => setViewMode('text')}
            >
              Text
            </button>
            <button
              className={`${styles.btn} ${viewMode === 'hex' ? styles.btnPrimary : styles.btnSecondary}`}
              style={{ padding: '2px 8px', fontSize: 11 }}
              onClick={() => setViewMode('hex')}
            >
              Hex
            </button>
          </div>
        </div>
        <div
          className={styles.dialogBody}
          style={{
            padding: 0,
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            lineHeight: 1.5,
            background: 'var(--bg-primary)',
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            color: 'var(--text-secondary)'
          }}
        >
          {isLoading ? (
            <div style={{ padding: 16, color: 'var(--text-muted)' }}>Loading...</div>
          ) : error ? (
            <div style={{ padding: 16, color: 'var(--danger)' }}>{error}</div>
          ) : (
            <pre style={{ margin: 0, padding: 12 }}>{displayContent}</pre>
          )}
        </div>
        <div className={styles.dialogFooter}>
          <span style={{ color: 'var(--text-muted)', fontSize: 11, flex: 1 }}>
            {isBinary ? 'Binary file' : `${content.split('\n').length} lines`}
            {' | '}Esc to close
          </span>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function formatHex(hexString: string): string {
  const lines: string[] = []
  const bytesPerLine = 16
  for (let i = 0; i < hexString.length; i += bytesPerLine * 2) {
    const offset = (i / 2).toString(16).padStart(8, '0')
    const hexPart: string[] = []
    let asciiPart = ''
    for (let j = 0; j < bytesPerLine; j++) {
      const pos = i + j * 2
      if (pos < hexString.length) {
        const byte = hexString.slice(pos, pos + 2)
        hexPart.push(byte)
        const charCode = parseInt(byte, 16)
        asciiPart += charCode >= 32 && charCode <= 126 ? String.fromCharCode(charCode) : '.'
      } else {
        hexPart.push('  ')
        asciiPart += ' '
      }
    }
    lines.push(`${offset}  ${hexPart.join(' ')}  |${asciiPart}|`)
  }
  return lines.join('\n')
}
