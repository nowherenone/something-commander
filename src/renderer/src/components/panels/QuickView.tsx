import React, { useEffect, useState, useRef } from 'react'
import { formatSize } from '../../utils/format'
import type { Entry } from '@shared/types'

interface QuickViewProps {
  /** The entry from the OPPOSITE panel's cursor */
  entry: Entry | null
}

const LINE_HEIGHT = 16

export function QuickView({ entry }: QuickViewProps): React.JSX.Element {
  const [content, setContent] = useState('')
  const [isBinary, setIsBinary] = useState(false)
  const [fileSize, setFileSize] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!entry || entry.isContainer) {
      setContent('')
      setIsBinary(false)
      setFileSize(0)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    window.api.util.readFileContent(entry.id, 256 * 1024).then((result) => {
      if (result.error) {
        setError(result.error)
      } else {
        setContent(result.isBinary ? formatHex(result.content) : result.content)
        setIsBinary(result.isBinary)
        setFileSize(result.totalSize)
      }
      setLoading(false)
    })
  }, [entry?.id])

  if (!entry) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
        No file selected in opposite panel
      </div>
    )
  }

  if (entry.isContainer) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12, gap: 4 }}>
        <span style={{ fontSize: 24 }}>{'\uD83D\uDCC1'}</span>
        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{entry.name}</span>
        <span>Directory</span>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '4px 8px',
        background: 'var(--bg-header)',
        borderBottom: '1px solid var(--border-color)',
        fontSize: 11,
        display: 'flex',
        justifyContent: 'space-between',
        color: 'var(--text-muted)',
        flexShrink: 0
      }}>
        <span style={{ color: 'var(--text-primary)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {entry.name}
        </span>
        <span>{formatSize(fileSize)}{isBinary ? ' (binary)' : ''}</span>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
          Loading...
        </div>
      ) : error ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--danger)', padding: 16 }}>
          {error}
        </div>
      ) : (
        <div
          ref={containerRef}
          style={{
            flex: 1,
            overflow: 'auto',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            lineHeight: `${LINE_HEIGHT}px`,
            color: 'var(--text-secondary)',
            padding: '4px 8px',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all'
          }}
        >
          {content}
        </div>
      )}
    </div>
  )
}

function formatHex(hexString: string): string {
  const lines: string[] = []
  const bytesPerLine = 16
  for (let i = 0; i < hexString.length && lines.length < 500; i += bytesPerLine * 2) {
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
      }
    }
    lines.push(`${offset}  ${hexPart.join(' ')}  |${asciiPart}|`)
  }
  return lines.join('\n')
}
