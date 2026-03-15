import React, { useEffect, useState, useCallback, useRef } from 'react'
import { formatSize } from '../utils/format'

const CHUNK_SIZE = 64 * 1024 // 64KB per chunk
const LINE_HEIGHT = 18
const VISIBLE_BUFFER = 50 // extra lines above/below viewport

interface ViewerPageProps {
  filePath: string
  fileName: string
}

type ViewMode = 'text' | 'hex'

export function ViewerPage({ filePath, fileName }: ViewerPageProps): React.JSX.Element {
  const [fileSize, setFileSize] = useState(0)
  const [lines, setLines] = useState<string[]>([])
  const [totalLines, setTotalLines] = useState(0)
  const [viewMode, setViewMode] = useState<ViewMode>('text')
  const [searchText, setSearchText] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isBinary, setIsBinary] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)

  // Load file metadata and initial content
  useEffect(() => {
    async function loadFile(): Promise<void> {
      setLoading(true)
      try {
        const size = await window.api.util.getFileSize(filePath)
        setFileSize(size)

        // Read first chunk to detect binary and get initial content
        const maxInitial = Math.min(size, 2 * 1024 * 1024) // 2MB initial
        const result = await window.api.util.readFileContent(filePath, maxInitial)

        if (result.error) {
          setError(result.error)
          setLoading(false)
          return
        }

        setIsBinary(result.isBinary)

        if (result.isBinary) {
          setViewMode('hex')
          // For hex, we need to re-read as hex
          const hexResult = await window.api.util.readFileContent(filePath, Math.min(size, 512 * 1024))
          const hexLines = formatHexLines(hexResult.content)
          setLines(hexLines)
          setTotalLines(hexLines.length)
        } else {
          const textLines = result.content.split('\n')
          setLines(textLines)
          setTotalLines(textLines.length)

          // For very large files, load more in background
          if (size > maxInitial) {
            loadRemainingText(maxInitial, size)
          }
        }
      } catch (err) {
        setError(String(err))
      }
      setLoading(false)
    }

    loadFile()
  }, [filePath])

  async function loadRemainingText(offset: number, totalSize: number): Promise<void> {
    let currentOffset = offset
    let allLines = [...lines]

    while (currentOffset < totalSize) {
      const chunkSize = Math.min(CHUNK_SIZE * 16, totalSize - currentOffset) // 1MB chunks
      const result = await window.api.util.readFileChunk(filePath, currentOffset, chunkSize)
      if (result.error || result.bytesRead === 0) break

      const newLines = result.data.split('\n')
      // Merge last line of existing with first line of new chunk
      if (allLines.length > 0 && newLines.length > 0) {
        allLines[allLines.length - 1] += newLines[0]
        allLines.push(...newLines.slice(1))
      } else {
        allLines.push(...newLines)
      }

      currentOffset += result.bytesRead
      setLines([...allLines])
      setTotalLines(allLines.length)
    }
  }

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop)
  }, [])

  // Virtualized rendering
  const viewportHeight = containerRef.current?.clientHeight || 600
  const startLine = Math.max(0, Math.floor(scrollTop / LINE_HEIGHT) - VISIBLE_BUFFER)
  const endLine = Math.min(totalLines, Math.ceil((scrollTop + viewportHeight) / LINE_HEIGHT) + VISIBLE_BUFFER)
  const visibleLines = lines.slice(startLine, endLine)

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') window.close()
    if (e.ctrlKey && e.key === 'f') {
      e.preventDefault()
      document.querySelector<HTMLInputElement>('[data-search-input]')?.focus()
    }
  }, [])

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-primary)' }}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-color)',
        flexShrink: 0
      }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {fileName}
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
          {formatSize(fileSize)} | {totalLines.toLocaleString()} lines
          {isBinary ? ' | Binary' : ''}
        </span>
        <input
          data-search-input
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
          onClick={() => setViewMode('text')}
          style={{
            padding: '2px 8px',
            background: viewMode === 'text' ? 'var(--accent)' : 'var(--bg-tertiary)',
            color: viewMode === 'text' ? 'white' : 'var(--text-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: 3,
            fontSize: 11,
            cursor: 'pointer'
          }}
        >
          Text
        </button>
        <button
          onClick={() => setViewMode('hex')}
          style={{
            padding: '2px 8px',
            background: viewMode === 'hex' ? 'var(--accent)' : 'var(--bg-tertiary)',
            color: viewMode === 'hex' ? 'white' : 'var(--text-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: 3,
            fontSize: 11,
            cursor: 'pointer'
          }}
        >
          Hex
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
          Loading...
        </div>
      ) : error ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--danger)' }}>
          {error}
        </div>
      ) : (
        <div
          ref={containerRef}
          onScroll={handleScroll}
          style={{
            flex: 1,
            overflow: 'auto',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            lineHeight: `${LINE_HEIGHT}px`,
            color: 'var(--text-secondary)',
            position: 'relative'
          }}
        >
          <div style={{ height: totalLines * LINE_HEIGHT, position: 'relative' }}>
            <div style={{
              position: 'absolute',
              top: startLine * LINE_HEIGHT,
              left: 0,
              right: 0,
              padding: '0 12px'
            }}>
              {visibleLines.map((line, i) => {
                const lineNum = startLine + i + 1
                const highlight = searchText && line.toLowerCase().includes(searchText.toLowerCase())
                return (
                  <div
                    key={lineNum}
                    style={{
                      height: LINE_HEIGHT,
                      display: 'flex',
                      whiteSpace: 'pre',
                      background: highlight ? 'rgba(45, 114, 210, 0.2)' : 'transparent'
                    }}
                  >
                    <span style={{
                      width: 60,
                      textAlign: 'right',
                      paddingRight: 12,
                      color: 'var(--text-muted)',
                      fontSize: 10,
                      flexShrink: 0,
                      userSelect: 'none'
                    }}>
                      {lineNum}
                    </span>
                    <span style={{ overflow: 'visible' }}>{line}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Status bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '4px 12px',
        background: 'var(--bg-secondary)',
        borderTop: '1px solid var(--border-color)',
        fontSize: 11,
        color: 'var(--text-muted)',
        flexShrink: 0
      }}>
        <span>{filePath}</span>
        <span>Esc to close</span>
      </div>
    </div>
  )
}

function formatHexLines(hexString: string): string[] {
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
  return lines
}
