import React, { useEffect, useState } from 'react'
import type { Entry } from '@shared/types'
import { formatSize, formatDate } from '../../utils/format'
import { getIconForHint } from '../../utils/icon-map'
import styles from '../../styles/file-list.module.css'

function DriveSizeBar({ driveId }: { driveId: string }): React.JSX.Element | null {
  const [space, setSpace] = useState<{ free: number; total: number } | null>(null)

  useEffect(() => {
    window.api.util.getDiskSpace(driveId).then(setSpace)
  }, [driveId])

  if (!space || space.total <= 0) return null

  const usedPct = Math.round(((space.total - space.free) / space.total) * 100)

  return (
    <span className={styles.driveBar}>
      <span className={styles.driveBarFill} style={{ width: `${usedPct}%`, display: 'block', height: '100%' }} />
    </span>
  )
}

interface EntryRowProps {
  entry: Entry
  isCursor: boolean
  isPanelActive?: boolean
  isSelected: boolean
  isCalculating?: boolean
  isError?: boolean
  onClick: () => void
  onDoubleClick: () => void
  onContextMenu?: (e: React.MouseEvent) => void
}

export const EntryRow = React.memo(function EntryRow({
  entry,
  isCursor,
  isPanelActive = true,
  isSelected,
  isCalculating,
  isError,
  onClick,
  onDoubleClick,
  onContextMenu
}: EntryRowProps): React.JSX.Element {
  const classNames = [
    styles.entryRow,
    isCursor ? (isPanelActive ? styles.cursor : styles.cursorInactive) : '',
    isSelected ? styles.selected : '',
    entry.isContainer ? styles.container : '',
    isError ? styles.errorEntry : ''
  ]
    .filter(Boolean)
    .join(' ')

  const isDrive = entry.iconHint === 'drive' || entry.iconHint === 'network'

  const renderSize = (): React.ReactNode => {
    if (isDrive) {
      return <DriveSizeBar driveId={entry.id} />
    }
    if (entry.isContainer) {
      if (isCalculating) {
        return <span className={styles.sizeLoading}>...</span>
      }
      return entry.size > 0 ? formatSize(entry.size) : ''
    }
    return formatSize(entry.size)
  }

  return (
    <div className={classNames} onClick={onClick} onDoubleClick={onDoubleClick} onContextMenu={onContextMenu}>
      <div className={styles.colName}>
        <span className={styles.icon}>{getIconForHint(entry.iconHint)}</span>
        <span className={styles.fileName}>{entry.name}</span>
      </div>
      <div className={styles.colExt}>
        {entry.isContainer ? (isDrive ? '' : '<DIR>') : ((entry.meta.extension as string) || '')}
      </div>
      <div className={styles.colSize}>{renderSize()}</div>
      <div className={styles.colDate}>{formatDate(entry.modifiedAt)}</div>
    </div>
  )
})
