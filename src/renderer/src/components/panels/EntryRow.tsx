import React from 'react'
import type { Entry } from '@shared/types'
import { formatSize, formatDate } from '../../utils/format'
import { getIconForHint } from '../../utils/icon-map'
import styles from '../../styles/file-list.module.css'

interface EntryRowProps {
  entry: Entry
  isCursor: boolean
  isSelected: boolean
  isCalculating?: boolean
  onClick: () => void
  onDoubleClick: () => void
}

export const EntryRow = React.memo(function EntryRow({
  entry,
  isCursor,
  isSelected,
  isCalculating,
  onClick,
  onDoubleClick
}: EntryRowProps): React.JSX.Element {
  const classNames = [
    styles.entryRow,
    isCursor ? styles.cursor : '',
    isSelected ? styles.selected : '',
    entry.isContainer ? styles.container : ''
  ]
    .filter(Boolean)
    .join(' ')

  const renderSize = (): React.ReactNode => {
    if (entry.isContainer) {
      if (isCalculating) {
        return <span className={styles.sizeLoading}>...</span>
      }
      return entry.size > 0 ? formatSize(entry.size) : ''
    }
    return formatSize(entry.size)
  }

  return (
    <div className={classNames} onClick={onClick} onDoubleClick={onDoubleClick}>
      <div className={styles.colName}>
        <span className={styles.icon}>{getIconForHint(entry.iconHint)}</span>
        <span className={styles.fileName}>{entry.name}</span>
      </div>
      <div className={styles.colExt}>
        {entry.isContainer ? '<DIR>' : ((entry.meta.extension as string) || '')}
      </div>
      <div className={styles.colSize}>{renderSize()}</div>
      <div className={styles.colDate}>{formatDate(entry.modifiedAt)}</div>
    </div>
  )
})
