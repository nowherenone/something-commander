import React, { useEffect, useState, useCallback, useRef } from 'react'
import { formatSize } from '../utils/format'
import { formatHexLines } from '../utils/hex'
import { FileContentView } from '../components/FileContentView'
import { useEscapeKey } from '../hooks/useEscapeKey'
import styles from '../styles/viewer.module.css'
import panelStyles from '../styles/panels.module.css'

const INITIAL_CHUNK = 512 * 1024 // 512KB for fast initial display
const LOAD_CHUNK = 1024 * 1024 // 1MB per on-demand load
const LINE_HEIGHT = 18

interface ViewerPageProps {
  filePath: string // may be 'pluginId|entryId' or legacy path
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

      // Support new plugin-aware: filePath as 'pluginId|entryId'
      const parts = filePath.split('|')
      const usePlugin = parts.length === 2
      const pluginId = usePlugin ? parts[0] : ''
      const entryId = usePlugin ? parts[1] : filePath

      try {
        let size = 0
        let initial: any
        if (usePlugin) {
          initial = await window.api.util.readEntryContent(pluginId, entryId, 0, INITIAL_CHUNK)
          size = initial.totalSize || 0
        } else {
          size = await window.api.util.getFileSize(filePath)
          initial = await window.api.util.readFileContent(filePath, INITIAL_CHUNK)
        }
        setFileSize(size)
        fileSizeRef.current = size

        if (initial.error) {
          setError(initial.error)
          setLoading(false)
          return
        }

        const isBin = initial.isBinary
        isBinaryRef.current = isBin
        setIsBinary(isBin)

        if (isBin) {
          setViewMode('hex')
          let hexContent = initial.data || ''
          if (usePlugin) {
            const hexRes = await window.api.util.readEntryContent(pluginId, entryId, 0, Math.min(size, 512*1024))
            hexContent = hexRes.data || ''
          } else {
            const hexRes = await window.api.util.readFileContent(filePath, Math.min(size, 512 * 1024))
            hexContent = hexRes.content
          }
          const hexLines = formatHexLines(typeof hexContent === 'string' ? hexContent : hexContent.toString('hex'))
          linesRef.current = hexLines
          allLoadedRef.current = true
          setLines(hexLines)
          setEstimatedTotalLines(hexLines.length)
        } else {
          const textContent = typeof initial.data === 'string' ? initial.data : initial.content || ''
          const textLines = textContent.split('\n')
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

      const parts = filePath.split('|')
      const usePlugin = parts.length === 2
      const pluginId = usePlugin ? parts[0] : ''
      const entryId = usePlugin ? parts[1] : filePath

      let result: any
      if (usePlugin) {
        result = await window.api.util.readEntryContent(pluginId, entryId, offset, Math.min(LOAD_CHUNK, remaining))
        const chunkData = typeof result.data === 'string' ? result.data : (result.data ? result.data.toString('utf-8') : '')
        if (result.error || !chunkData) {
          allLoadedRef.current = true
          setEstimatedTotalLines(linesRef.current.length)
          return
        }
        const newLines = chunkData.split('\n')
        const current = linesRef.current
        if (current.length > 0) {
          current[current.length - 1] += newLines[0]
          linesRef.current = [...current, ...newLines.slice(1)]
        } else {
          linesRef.current = [...newLines]
        }
        loadedBytesRef.current = offset + Math.min(LOAD_CHUNK, remaining)
      } else {
        result = await window.api.util.readFileChunk(filePath, offset, Math.min(LOAD_CHUNK, remaining))
        if (result.error || result.bytesRead === 0) {
          allLoadedRef.current = true
          setEstimatedTotalLines(linesRef.current.length)
          return
        }
        const raw = result.encoding === 'base64' ? Buffer.from(result.data, 'base64').toString('utf-8') : result.data
        const newLines = raw.split('\n')
        const current = linesRef.current
        if (current.length > 0) {
          current[current.length - 1] += newLines[0]
          linesRef.current = [...current, ...newLines.slice(1)]
        } else {
          linesRef.current = [...newLines]
        }
        loadedBytesRef.current = offset + result.bytesRead
      }

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

  const rootRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // Always close viewer on Escape (blur search first if focused)
  useEscapeKey(() => {
    window.close()
  }, { capture: true })

  // Focus root on mount so Escape works without clicking
  useEffect(() => {
    // Small delay to let content render
    const t = setTimeout(() => {
      rootRef.current?.focus()
    }, 0)
    return () => clearTimeout(t)
  }, [])

  // Keyboard navigation for viewer (arrows, PageUp/Down, Home/End)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Handle Ctrl+F to focus search from anywhere
      if (e.ctrlKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        document.querySelector<HTMLInputElement>('[data-search-input]')?.focus()
        return
      }

      // Don't interfere with search input or other focused inputs for navigation
      const active = document.activeElement
      if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        (active as HTMLElement)?.isContentEditable
      ) {
        return
      }

      const container = scrollRef.current
      if (!container) return

      const lineH = LINE_HEIGHT
      const vh = container.clientHeight || 600
      let delta = 0
      let handled = true

      switch (e.key) {
        case 'ArrowDown':
          delta = lineH
          break
        case 'ArrowUp':
          delta = -lineH
          break
        case 'PageDown':
          delta = vh * 0.85
          break
        case 'PageUp':
          delta = -vh * 0.85
          break
        case 'Home':
          container.scrollTop = 0
          e.preventDefault()
          return
        case 'End':
          container.scrollTop = container.scrollHeight
          e.preventDefault()
          return
        default:
          handled = false
      }

      if (handled && delta !== 0) {
        e.preventDefault()
        container.scrollTop = Math.max(0, Math.min(
          container.scrollHeight - container.clientHeight,
          container.scrollTop + delta
        ))
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div
      ref={rootRef}
      className={styles.root}
      tabIndex={0}
    >
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
          scrollRef={scrollRef}
        />
      )}

      <div className={styles.statusBar}>
        <span>{filePath}</span>
        <span>Esc to close</span>
      </div>
    </div>
  )
}
