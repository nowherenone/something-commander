import React, { useEffect, useState } from 'react'
import type { Entry } from '@shared/types'
import { formatSize } from '../../utils/format'
import styles from '../../styles/panels.module.css'

interface StatusBarProps {
  entries: Entry[]
  selectedIds: Set<string>
  locationId: string | null
}

export function StatusBar({ entries, selectedIds, locationId }: StatusBarProps): React.JSX.Element {
  const [diskSpace, setDiskSpace] = useState<{ free: number; total: number } | null>(null)

  useEffect(() => {
    if (!locationId) {
      setDiskSpace(null)
      return
    }
    window.api.util.getDiskSpace(locationId).then(setDiskSpace)
  }, [locationId])

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

  const usedPct = diskSpace && diskSpace.total > 0
    ? Math.round(((diskSpace.total - diskSpace.free) / diskSpace.total) * 100)
    : 0

  return (
    <div className={styles.statusBar}>
      <span>
        {fileCount} file{fileCount !== 1 ? 's' : ''}, {dirCount} dir{dirCount !== 1 ? 's' : ''}
      </span>
      {selectedCount > 0 && (
        <span className={styles.statusSelected}>
          {selectedCount} sel ({formatSize(selectedSize)})
        </span>
      )}
      {diskSpace && diskSpace.total > 0 && (
        <span className={styles.diskSpace}>
          <span className={styles.diskBar}>
            <span className={styles.diskBarFill} style={{ width: `${usedPct}%` }} />
          </span>
          <span>{formatSize(diskSpace.free)} free / {formatSize(diskSpace.total)}</span>
        </span>
      )}
    </div>
  )
}
