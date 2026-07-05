import React, { useCallback, useEffect, useState, useRef } from 'react'
import type { Entry } from '@shared/types'
import type { PanelId } from '../../stores/app-store'
import { formatSize, formatDate } from '../../utils/format'
import { getIconForHint } from '../../utils/icon-map'
import { useSettingsStore } from '../../stores/settings-store'
import { useDragStore } from '../../stores/drag-store'
import { usePanelStore } from '../../stores/panel-store'
import styles from '../../styles/file-list.module.css'

function DriveSizeBar({ driveId, pluginId }: { driveId: string; pluginId?: string }): React.JSX.Element | null {
  const [space, setSpace] = useState<{ free: number; total: number } | null>(null)

  useEffect(() => {
    const pid = pluginId || 'local-filesystem'
    window.api.util.getDiskSpace(pid, driveId).then(setSpace)
  }, [driveId, pluginId])

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
  panelId: PanelId
  pluginId?: string
  isCursor: boolean
  isPanelActive?: boolean
  isSelected: boolean
  isCalculating?: boolean
  isError?: boolean
  isRenaming?: boolean
  onClick: () => void
  onDoubleClick: () => void
  onContextMenu?: (e: React.MouseEvent) => void
  onRenameCommit?: (newName: string) => void | Promise<void>
  onRenameCancel?: () => void
}

export const EntryRow = React.memo(function EntryRow({
  entry,
  panelId,
  pluginId,
  isCursor,
  isPanelActive = true,
  isSelected,
  isCalculating,
  isError,
  isRenaming = false,
  onClick,
  onDoubleClick,
  onContextMenu,
  onRenameCommit,
  onRenameCancel
}: EntryRowProps): React.JSX.Element {
  const sizeFormat = useSettingsStore((s) => s.sizeFormat)
  const dateFormat = useSettingsStore((s) => s.dateFormat)
  const isDragging = useDragStore((s) => s.isDragging && s.draggedEntries.some((e) => e.id === entry.id))

  const isDrive = entry.iconHint === 'drive' || entry.iconHint === 'network'
  const canDrag = entry.id !== '__parent__' && !isDrive

  const classNames = [
    styles.entryRow,
    isCursor ? (isPanelActive ? styles.cursor : styles.cursorInactive) : '',
    isSelected ? styles.selected : '',
    entry.isContainer ? styles.container : '',
    isError ? styles.errorEntry : '',
    isDragging ? styles.dragging : '',
    isRenaming ? styles.renaming : ''
  ]
    .filter(Boolean)
    .join(' ')

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      if (!canDrag) {
        e.preventDefault()
        return
      }

      const panelStore = usePanelStore.getState()
      const tab = panelStore.getActiveTab(panelId)

      // If dragged entry is selected, drag all selected entries; otherwise just this one
      let dragEntries: Entry[]
      if (tab.selectedEntryIds.has(entry.id)) {
        dragEntries = tab.entries.filter((e) => tab.selectedEntryIds.has(e.id))
      } else {
        dragEntries = [entry]
      }

      // Filter out non-draggable entries
      dragEntries = dragEntries.filter(
        (e) => e.id !== '__parent__' && e.iconHint !== 'drive' && e.iconHint !== 'network'
      )
      if (dragEntries.length === 0) {
        e.preventDefault()
        return
      }

      // Store drag state (must happen before preventDefault for native drag)
      useDragStore.getState().startDrag(panelId, dragEntries, tab.pluginId, tab.locationId)

      // For local filesystem entries, use native OS drag so files can be
      // dropped onto external apps (VSCode, desktop, file managers).
      // preventDefault() is required — it tells the browser to yield the
      // drag session so Electron's startDrag() can initiate an OS-level one.
      if (tab.pluginId === 'local-filesystem') {
        e.preventDefault()
        const filePaths = dragEntries.map((e) => e.id)
        window.api.util.startNativeDrag(filePaths)
      } else {
        // Non-local entries (SFTP, S3, archive): use HTML5 drag for internal
        // panel-to-panel DnD only — no OS-level drag since there are no local paths.
        e.dataTransfer.effectAllowed = 'copyMove'

        const ghost = document.createElement('div')
        ghost.textContent =
          dragEntries.length === 1 ? dragEntries[0].name : `${dragEntries.length} items`
        ghost.style.cssText =
          'position:absolute;top:-1000px;padding:4px 12px;background:#333;color:#fff;border-radius:4px;font-size:13px;white-space:nowrap;'
        document.body.appendChild(ghost)
        e.dataTransfer.setDragImage(ghost, 0, 0)
        setTimeout(() => document.body.removeChild(ghost), 0)
      }
    },
    [entry, panelId, canDrag]
  )

  const handleDragEnd = useCallback(() => {
    useDragStore.getState().endDrag()
  }, [])

  const renderSize = (): React.ReactNode => {
    if (isDrive) {
      return <DriveSizeBar driveId={entry.id} pluginId={pluginId} />
    }
    if (entry.isContainer) {
      if (isCalculating) {
        return <span className={styles.sizeLoading}>...</span>
      }
      return entry.size > 0 ? formatSize(entry.size, sizeFormat) : ''
    }
    return formatSize(entry.size, sizeFormat)
  }

  return (
    <div
      className={classNames}
      draggable={canDrag}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={isRenaming ? undefined : onClick}
      onDoubleClick={isRenaming ? undefined : onDoubleClick}
      onContextMenu={onContextMenu}
    >
      <div className={styles.colName}>
        <span className={styles.icon}>{getIconForHint(entry.iconHint)}</span>
        {isRenaming ? (
          <RenameInput
            initialName={entry.name}
            isContainer={!!entry.isContainer}
            onCommit={onRenameCommit}
            onCancel={onRenameCancel}
          />
        ) : (
          <span className={styles.fileName}>{entry.name}</span>
        )}
      </div>
      <div className={styles.colExt}>
        {entry.isContainer ? (isDrive ? '' : '<DIR>') : ((entry.meta.extension as string) || '')}
      </div>
      <div className={styles.colSize}>{renderSize()}</div>
      <div className={styles.colDate}>{formatDate(entry.modifiedAt, dateFormat)}</div>
    </div>
  )
})

interface RenameInputProps {
  initialName: string
  isContainer: boolean
  onCommit?: (newName: string) => void | Promise<void>
  onCancel?: () => void
}

function RenameInput({ initialName, isContainer, onCommit, onCancel }: RenameInputProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const cancelledRef = useRef(false)

  useEffect(() => {
    const input = inputRef.current
    if (!input) return
    input.focus()
    // Select basename (everything before last dot for files)
    let end = initialName.length
    if (!isContainer) {
      const dot = initialName.lastIndexOf('.')
      if (dot > 0) end = dot
    }
    input.setSelectionRange(0, end)
  }, [initialName, isContainer])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation()
    if (e.key === 'Enter') {
      e.preventDefault()
      cancelledRef.current = true
      const val = inputRef.current?.value.trim() ?? ''
      if (val) {
        onCommit?.(val)
      } else {
        onCancel?.()
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancelledRef.current = true
      onCancel?.()
    }
  }

  const handleBlur = () => {
    if (cancelledRef.current) return
    const val = inputRef.current?.value.trim() ?? ''
    if (val) {
      onCommit?.(val)
    } else {
      onCancel?.()
    }
  }

  return (
    <input
      ref={inputRef}
      className={`inline-rename-input ${styles.renameInput}`}
      defaultValue={initialName}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      spellCheck={false}
    />
  )
}
