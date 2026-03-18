import React, { useEffect, useState } from 'react'
import { formatSize } from '../../utils/format'
import { formatHexLines } from '../../utils/hex'
import { FileContentView } from '../FileContentView'
import type { Entry } from '@shared/types'
import styles from '../../styles/quickview.module.css'
import panelStyles from '../../styles/panels.module.css'

interface QuickViewProps {
  /** The entry from the OPPOSITE panel's cursor */
  entry: Entry | null
}

const PREVIEW_LIMIT = 256 * 1024

export function QuickView({ entry }: QuickViewProps): React.JSX.Element {
  const [lines, setLines] = useState<string[]>([])
  const [isBinary, setIsBinary] = useState(false)
  const [fileSize, setFileSize] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

    window.api.util.readFileContent(entry.id, PREVIEW_LIMIT).then((result) => {
      if (result.error) {
        setError(result.error)
      } else {
        const newLines = result.isBinary
          ? formatHexLines(result.content)
          : result.content.split('\n')
        setLines(newLines)
        setIsBinary(result.isBinary)
        setFileSize(result.totalSize)
      }
      setLoading(false)
    })
  }, [entry?.id])

  if (!entry) {
    return <div className={styles.empty}>No file selected in opposite panel</div>
  }

  if (entry.isContainer) {
    return (
      <div className={styles.dirState}>
        <span className={styles.dirIcon}>{'\uD83D\uDCC1'}</span>
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
          {formatSize(fileSize)}{isBinary ? ' (binary)' : ''}{isTruncated ? ' (preview)' : ''}
        </span>
      </div>

      {loading ? (
        <div className={panelStyles.loading}>Loading...</div>
      ) : error ? (
        <div className={panelStyles.error}>{error}</div>
      ) : (
        <FileContentView lines={lines} lineHeight={16} />
      )}
    </div>
  )
}
