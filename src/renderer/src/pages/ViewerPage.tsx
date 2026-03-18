import React, { useEffect, useState, useCallback, useRef } from 'react'
import { formatSize } from '../utils/format'
import { formatHexLines } from '../utils/hex'
import { FileContentView } from '../components/FileContentView'
import styles from '../styles/viewer.module.css'
import panelStyles from '../styles/panels.module.css'

const INITIAL_CHUNK = 512 * 1024 // 512KB for fast initial display
const LOAD_CHUNK = 1024 * 1024 // 1MB per on-demand load
const LINE_HEIGHT = 18

interface ViewerPageProps {
  filePath: string
  fileName: string
}

type ViewMode = 'text' | 'hex'

export function ViewerPage({ filePath, fileName }: ViewerPageProps): React.JSX.Element {
  const [fileSize, setFileSize] = useState(0)
  const [lines, setLines] = useState<string[]>([])
  const [estimatedTotalLines, setEstimatedTotalLines] = useState(0)
  const [viewMode, setViewMode] = useState<ViewMode>('text')
  const [searchText, setSearchText] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isBinary, setIsBinary] = useState(false)

  // Mutable refs to avoid stale closures in async callbacks
  const linesRef = useRef<string[]>([])
  const loadedBytesRef = useRef(0)
  const loadingMoreRef = useRef(false)
  const allLoadedRef = useRef(false)
  const fileSizeRef = useRef(0)
  const isBinaryRef = useRef(false)

  useEffect(() => {
    linesRef.current = []
    loadedBytesRef.current = 0
    loadingMoreRef.current = false
    allLoadedRef.current = false

    async function loadFile(): Promise<void> {
      setLoading(true)
      setLines([])
      setEstimatedTotalLines(0)
      setError(null)

      try {
        const size = await window.api.util.getFileSize(filePath)
        setFileSize(size)
        fileSizeRef.current = size

        const result = await window.api.util.readFileContent(filePath, INITIAL_CHUNK)

        if (result.error) {
          setError(result.error)
          setLoading(false)
          return
        }

        isBinaryRef.current = result.isBinary
        setIsBinary(result.isBinary)

        if (result.isBinary) {
          setViewMode('hex')
          const hexResult = await window.api.util.readFileContent(filePath, Math.min(size, 512 * 1024))
          const hexLines = formatHexLines(hexResult.content)
          linesRef.current = hexLines
          allLoadedRef.current = true
          setLines(hexLines)
          setEstimatedTotalLines(hexLines.length)
        } else {
          const textLines = result.content.split('\n')
          linesRef.current = textLines
          loadedBytesRef.current = Math.min(size, INITIAL_CHUNK)

          if (loadedBytesRef.current >= size) {
            allLoadedRef.current = true
            setEstimatedTotalLines(textLines.length)
          } else {
            const lineRate = textLines.length / loadedBytesRef.current
            setEstimatedTotalLines(Math.ceil(lineRate * size))
          }

          setLines(textLines)
        }
      } catch (err) {
        setError(String(err))
      }
      setLoading(false)
    }

    loadFile()
  }, [filePath])

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || allLoadedRef.current || isBinaryRef.current) return

    loadingMoreRef.current = true
    try {
      const offset = loadedBytesRef.current
      const remaining = fileSizeRef.current - offset
      if (remaining <= 0) {
        allLoadedRef.current = true
        setEstimatedTotalLines(linesRef.current.length)
        return
      }

      const result = await window.api.util.readFileChunk(filePath, offset, Math.min(LOAD_CHUNK, remaining))
      if (result.error || result.bytesRead === 0) {
        allLoadedRef.current = true
        setEstimatedTotalLines(linesRef.current.length)
        return
      }

      const newLines = result.data.split('\n')
      const current = linesRef.current
      if (current.length > 0) {
        current[current.length - 1] += newLines[0]
        linesRef.current = [...current, ...newLines.slice(1)]
      } else {
        linesRef.current = [...newLines]
      }

      loadedBytesRef.current = offset + result.bytesRead

      if (loadedBytesRef.current >= fileSizeRef.current) {
        allLoadedRef.current = true
        setEstimatedTotalLines(linesRef.current.length)
      } else {
        const lineRate = linesRef.current.length / loadedBytesRef.current
        setEstimatedTotalLines(Math.ceil(lineRate * fileSizeRef.current))
      }

      setLines([...linesRef.current])
    } finally {
      loadingMoreRef.current = false
    }
  }, [filePath])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') window.close()
    if (e.ctrlKey && e.key === 'f') {
      e.preventDefault()
      document.querySelector<HTMLInputElement>('[data-search-input]')?.focus()
    }
  }, [])

  return (
    <div className={styles.root} onKeyDown={handleKeyDown} tabIndex={0}>
      <div className={styles.toolbar}>
        <span className={styles.toolbarName}>{fileName}</span>
        <span className={styles.toolbarInfo}>
          {formatSize(fileSize, 'short')}
          {estimatedTotalLines > 0 && ` | ${allLoadedRef.current ? '' : '~'}${estimatedTotalLines.toLocaleString()} lines`}
          {isBinary ? ' | Binary' : ''}
        </span>
        <input
          data-search-input
          placeholder="Search (Ctrl+F)"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          className={styles.searchInput}
        />
        <button
          onClick={() => setViewMode('text')}
          className={`${styles.modeBtn} ${viewMode === 'text' ? styles.modeBtnActive : ''}`}
        >
          Text
        </button>
        <button
          onClick={() => setViewMode('hex')}
          className={`${styles.modeBtn} ${viewMode === 'hex' ? styles.modeBtnActive : ''}`}
        >
          Hex
        </button>
      </div>

      {loading ? (
        <div className={panelStyles.loading}>Loading...</div>
      ) : error ? (
        <div className={panelStyles.error}>{error}</div>
      ) : (
        <FileContentView
          lines={lines}
          totalLines={estimatedTotalLines || undefined}
          searchText={searchText}
          showLineNumbers={true}
          lineHeight={LINE_HEIGHT}
          onNearEnd={loadMore}
        />
      )}

      <div className={styles.statusBar}>
        <span>{filePath}</span>
        <span>Esc to close</span>
      </div>
    </div>
  )
}
