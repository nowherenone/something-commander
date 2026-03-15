import React, { useCallback, useRef, useEffect } from 'react'
import type { Entry } from '@shared/types'
import { EntryRow } from './EntryRow'
import styles from '../../styles/file-list.module.css'

interface FileListProps {
  entries: Entry[]
  cursorIndex: number
  selectedIds: Set<string>
  calculatingIds: Set<string>
  isActive: boolean
  onCursorChange: (index: number) => void
  onSelect: (entryId: string) => void
  onActivate: (entry: Entry) => void
}

export function FileList({
  entries,
  cursorIndex,
  selectedIds,
  calculatingIds,
  isActive,
  onCursorChange,
  onSelect,
  onActivate
}: FileListProps): React.JSX.Element {
  const listRef = useRef<HTMLDivElement>(null)

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

  const handleContextMenu = useCallback(
    async (entry: Entry, index: number) => {
      onCursorChange(index)
      const items = [
        { label: 'Open', id: 'open' },
        { label: 'View (F3)', id: 'view' },
        { label: 'Edit (F4)', id: 'edit' },
        { label: '', id: '', separator: true },
        { label: 'Copy (F5)', id: 'copy' },
        { label: 'Move (F6)', id: 'move' },
        { label: 'Rename', id: 'rename' },
        { label: '', id: '', separator: true },
        { label: 'Delete (F8)', id: 'delete' }
      ]
      const action = await window.api.util.showContextMenu(items)
      if (!action) return
      switch (action) {
        case 'open':
          onActivate(entry)
          break
        case 'view':
          if (!entry.isContainer) window.api.util.openViewerWindow(entry.id, entry.name)
          break
        case 'edit':
          if (!entry.isContainer) window.api.util.openEditorWindow(entry.id, entry.name)
          break
      }
      // copy/move/delete/rename are handled by the keyboard shortcuts
      // which read from the panel store's current cursor position
    },
    [onCursorChange, onActivate]
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
          isPanelActive={isActive}
          isSelected={selectedIds.has(entry.id)}
          isCalculating={calculatingIds.has(entry.id)}
          onClick={() => handleClick(index)}
          onDoubleClick={() => handleDoubleClick(entry)}
          onContextMenu={(e) => {
            e.preventDefault()
            handleContextMenu(entry, index)
          }}
        />
      ))}
    </div>
  )
}
