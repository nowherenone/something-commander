import React, { useCallback, useRef, useEffect } from 'react'
import type { Entry } from '@shared/types'
import { EntryRow } from './EntryRow'
import styles from '../../styles/file-list.module.css'

interface FileListProps {
  entries: Entry[]
  cursorIndex: number
  selectedIds: Set<string>
  calculatingIds: Set<string>
  onCursorChange: (index: number) => void
  onSelect: (entryId: string) => void
  onActivate: (entry: Entry) => void
}

export function FileList({
  entries,
  cursorIndex,
  selectedIds,
  calculatingIds,
  onCursorChange,
  onSelect,
  onActivate
}: FileListProps): React.JSX.Element {
  const listRef = useRef<HTMLDivElement>(null)

  // Scroll cursor into view
  useEffect(() => {
    if (!listRef.current) return
    const row = listRef.current.children[cursorIndex] as HTMLElement | undefined
    if (row) {
      row.scrollIntoView({ block: 'nearest' })
    }
  }, [cursorIndex])

  const handleClick = useCallback(
    (index: number) => {
      onCursorChange(index)
    },
    [onCursorChange]
  )

  const handleDoubleClick = useCallback(
    (entry: Entry) => {
      onActivate(entry)
    },
    [onActivate]
  )

  if (entries.length === 0) {
    return (
      <div className={styles.fileList}>
        <div className={styles.empty}>Empty</div>
      </div>
    )
  }

  return (
    <div className={styles.fileList} ref={listRef}>
      {entries.map((entry, index) => (
        <EntryRow
          key={entry.id}
          entry={entry}
          isCursor={index === cursorIndex}
          isSelected={selectedIds.has(entry.id)}
          isCalculating={calculatingIds.has(entry.id)}
          onClick={() => handleClick(index)}
          onDoubleClick={() => handleDoubleClick(entry)}
        />
      ))}
    </div>
  )
}
