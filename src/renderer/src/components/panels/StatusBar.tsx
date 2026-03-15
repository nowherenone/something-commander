import React from 'react'
import type { Entry } from '@shared/types'
import { formatSize } from '../../utils/format'
import styles from '../../styles/panels.module.css'

interface StatusBarProps {
  entries: Entry[]
  selectedIds: Set<string>
}

export function StatusBar({ entries, selectedIds }: StatusBarProps): React.JSX.Element {
  const fileCount = entries.filter((e) => !e.isContainer).length
  const dirCount = entries.filter((e) => e.isContainer).length
  const selectedCount = selectedIds.size

  let selectedSize = 0
  if (selectedCount > 0) {
    for (const entry of entries) {
      if (selectedIds.has(entry.id) && entry.size > 0) {
        selectedSize += entry.size
      }
    }
  }

  return (
    <div className={styles.statusBar}>
      <span>
        {fileCount} file{fileCount !== 1 ? 's' : ''}, {dirCount} dir{dirCount !== 1 ? 's' : ''}
      </span>
      {selectedCount > 0 && (
        <span className={styles.statusSelected}>
          {selectedCount} selected ({formatSize(selectedSize)})
        </span>
      )}
    </div>
  )
}
