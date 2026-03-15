import React from 'react'
import type { SortConfig, SortField } from '../../utils/sort'
import styles from '../../styles/file-list.module.css'

interface ColumnHeadersProps {
  sortConfig: SortConfig
  onSort: (field: SortField) => void
}

const COLUMNS: Array<{ field: SortField; label: string; className: string }> = [
  { field: 'name', label: 'Name', className: styles.colName },
  { field: 'extension', label: 'Ext', className: styles.colExt },
  { field: 'size', label: 'Size', className: styles.colSize },
  { field: 'modifiedAt', label: 'Date', className: styles.colDate }
]

export function ColumnHeaders({ sortConfig, onSort }: ColumnHeadersProps): React.JSX.Element {
  return (
    <div className={styles.headerRow}>
      {COLUMNS.map((col) => (
        <div
          key={col.field}
          className={`${col.className} ${styles.headerCell}`}
          onClick={() => onSort(col.field)}
        >
          {col.label}
          {sortConfig.field === col.field && (
            <span className={styles.sortArrow}>
              {sortConfig.direction === 'asc' ? ' \u25B2' : ' \u25BC'}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}
