import React, { useCallback, useRef, useEffect } from 'react'
import type { Entry } from '@shared/types'
import type { PanelId } from '../../stores/app-store'
import { EntryRow } from './EntryRow'
import { useDragStore } from '../../stores/drag-store'
import { usePanelStore } from '../../stores/panel-store'
import { useOperationsStore } from '../../stores/operations-store'
import { dispatchCommand } from '../../commands/registry'
import { showToast } from '../../components/layout/Toast'
import styles from '../../styles/file-list.module.css'

interface FileListProps {
  panelId: PanelId
  pluginId: string
  entries: Entry[]
  cursorIndex: number
  selectedIds: Set<string>
  calculatingIds: Set<string>
  errorFolderIds: Set<string>
  isActive: boolean
  renamingId?: string | null
  onCursorChange: (index: number) => void
  onSelect: (entryId: string) => void
  onActivate: (entry: Entry) => void
  onStartRename?: (entry: Entry) => void
  onRenameCommit?: (entry: Entry, newName: string) => void | Promise<void>
  onRenameCancel?: () => void
}

export function FileList({
  panelId,
  pluginId,
  entries,
  cursorIndex,
  selectedIds,
  calculatingIds,
  errorFolderIds,
  isActive,
  renamingId,
  onCursorChange,
  onSelect: _onSelect,
  onActivate,
  onStartRename,
  onRenameCommit,
  onRenameCancel
}: FileListProps): React.JSX.Element {
  const listRef = useRef<HTMLDivElement>(null)
  const isDropTarget = useDragStore((s) => s.isDragging && s.dropTargetPanelId === panelId)

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

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      const dragState = useDragStore.getState()
      if (!dragState.isDragging) return
      if (dragState.dragSourcePanelId === panelId) {
        e.dataTransfer.dropEffect = 'none'
        return
      }
      e.preventDefault()
      e.dataTransfer.dropEffect = e.ctrlKey ? 'copy' : 'move'
      useDragStore.getState().setDropTarget(panelId)
    },
    [panelId]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const dragState = useDragStore.getState()
      if (!dragState.isDragging || dragState.draggedEntries.length === 0) return

      const destTab = usePanelStore.getState().getActiveTab(panelId)
      if (!destTab.locationId) {
        showToast('Select a destination folder')
        useDragStore.getState().endDrag()
        return
      }

      const isCrossPlugin = dragState.dragSourcePluginId !== destTab.pluginId
      const opType = e.ctrlKey || isCrossPlugin ? 'copy' : 'move'

      useOperationsStore.getState().enqueue({
        type: opType,
        sourceEntries: dragState.draggedEntries,
        sourcePluginId: dragState.dragSourcePluginId!,
        destinationDisplay: destTab.locationDisplay,
        destinationLocationId: destTab.locationId,
        destinationPluginId: destTab.pluginId
      })

      useDragStore.getState().endDrag()
    },
    [panelId]
  )

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
        useDragStore.getState().setDropTarget(null)
      }
    },
    []
  )

  const handleContextMenu = useCallback(
    async (entry: Entry, index: number) => {
      onCursorChange(index)
      const items = [
        { label: 'Open', id: 'open' },
        { label: 'Copy path', id: 'copyPath' },
        { label: 'Properties', id: 'properties' },
        { label: '', id: '', separator: true },
        { label: 'Rename (F2)', id: 'rename' },
        { label: '', id: '', separator: true },
        { label: 'Delete (F8)', id: 'delete' }
      ]
      const action = await window.api.util.showContextMenu(items)
      if (!action) return
      switch (action) {
        case 'open':
          onActivate(entry)
          break
        case 'copyPath':
          try {
            await navigator.clipboard.writeText(entry.id)
            showToast('Path copied')
          } catch {
            showToast('Could not copy to clipboard')
          }
          break
        case 'properties':
          if (pluginId !== 'local-filesystem') {
            showToast('Properties are only available for local files')
            break
          }
          {
            const result = await window.api.util.showFileProperties(entry.id)
            if (!result.success) {
              showToast(result.error || 'Could not open file properties')
            }
          }
          break
        case 'delete':
          dispatchCommand('delete')
          break
        case 'rename':
          onStartRename?.(entry)
          break
      }
    },
    [onCursorChange, onActivate, onStartRename, pluginId]
  )

  const listClassName = `${styles.fileList}${isDropTarget ? ` ${styles.dropTarget}` : ''}`

  if (entries.length === 0) {
    return (
      <div className={listClassName} onDragOver={handleDragOver} onDrop={handleDrop} onDragLeave={handleDragLeave}>
        <div className={styles.empty}>Empty</div>
      </div>
    )
  }

  return (
    <div className={listClassName} ref={listRef} onDragOver={handleDragOver} onDrop={handleDrop} onDragLeave={handleDragLeave}>
      {entries.map((entry, index) => (
        <EntryRow
          key={entry.id}
          entry={entry}
          panelId={panelId}
          pluginId={pluginId}
          isCursor={index === cursorIndex}
          isPanelActive={isActive}
          isSelected={selectedIds.has(entry.id)}
          isCalculating={calculatingIds.has(entry.id)}
          isError={errorFolderIds.has(entry.id)}
          isRenaming={renamingId === entry.id}
          onClick={() => handleClick(index)}
          onDoubleClick={() => handleDoubleClick(entry)}
          onContextMenu={(e) => {
            e.preventDefault()
            handleContextMenu(entry, index)
          }}
          onRenameCommit={onRenameCommit ? (name) => onRenameCommit(entry, name) : undefined}
          onRenameCancel={onRenameCancel}
        />
      ))}
    </div>
  )
}
