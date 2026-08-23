import React, { useEffect, useState, useRef } from 'react'
import { formatSize } from '../../utils/format'
import { useSizeFormat } from '../../stores/settings-store'
import { formatHexLines } from '../../utils/hex'
import { FileContentView } from '../FileContentView'
import { EntryIcon } from '../icons'
import type { Entry } from '@shared/types'
import styles from '../../styles/quickview.module.css'
import panelStyles from '../../styles/panels.module.css'

interface QuickViewProps {
  /** The entry from the OPPOSITE panel's cursor */
  entry: Entry | null
  /** Plugin owning the opposite panel's location */
  pluginId: string
}

const PREVIEW_LIMIT = 256 * 1024

export function QuickView({ entry, pluginId }: QuickViewProps): React.JSX.Element {
  const sizeFormat = useSizeFormat()
  const [lines, setLines] = useState<string[]>([])
  const [isBinary, setIsBinary] = useState(false)
  const [fileSize, setFileSize] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!entry || entry.isContainer) {
      setLines([])
      setIsBinary(false)
      setFileSize(0)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    // Always plugin-scoped content read
    void window.api.util
      .readEntryContent(pluginId || 'local-filesystem', entry.id, 0, PREVIEW_LIMIT)
      .then((result) => {
        if (result.error) {
          setError(result.error)
        } else {
          const raw =
            typeof result.data === 'string'
              ? result.data
              : Buffer.from(result.data).toString(result.isBinary ? 'hex' : 'utf-8')
          const newLines = result.isBinary ? formatHexLines(raw) : raw.split('\n')
          setLines(newLines)
          setIsBinary(result.isBinary)
          setFileSize(result.totalSize)
        }
        setLoading(false)
      })
  }, [entry?.id, pluginId])

  useEffect(() => {
    if (!contentRef.current) return
    const t = setTimeout(() => contentRef.current?.focus(), 10)
    return () => clearTimeout(t)
  }, [entry?.id])

  if (!entry) {
    return <div className={styles.empty}>No file selected in opposite panel</div>
  }

  if (entry.isContainer) {
    return (
      <div className={styles.dirState}>
        <span className={styles.dirIcon} aria-hidden="true"><EntryIcon hint="folder" /></span>
        <span className={styles.dirName}>{entry.name}</span>
        <span>Directory</span>
      </div>
    )
  }

  const isTruncated = fileSize > PREVIEW_LIMIT

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.headerName}>{entry.name}</span>
        <span className={styles.headerMeta}>
          {formatSize(fileSize, sizeFormat)}{isBinary ? ' (binary)' : ''}{isTruncated ? ' (preview)' : ''}
        </span>
      </div>

      {loading ? (
        <div className={panelStyles.loading}>Loading...</div>
      ) : error ? (
        <div className={panelStyles.error}>{error}</div>
      ) : (
        <FileContentView lines={lines} lineHeight={16} scrollRef={contentRef} />
      )}
    </div>
  )
}
