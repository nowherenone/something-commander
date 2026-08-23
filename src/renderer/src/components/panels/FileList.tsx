import React, { useCallback, useRef, useEffect } from 'react'
import type { Entry } from '@shared/types'
import type { PanelId } from '../../stores/app-store'
import { EntryRow } from './EntryRow'
import { useDragStore } from '../../stores/drag-store'
import { usePanelStore } from '../../stores/panel-store'
import { useOperationsStore } from '../../stores/operations-store'
import { dispatchCommand } from '../../commands/registry'
import { showToast } from '../../components/layout/Toast'
import { wouldCopyIntoSelf } from '../../utils/entry-helpers'
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
  // Display index where the last plain/ctrl click landed — the anchor for
  // shift-click range selection.
  const shiftAnchorRef = useRef<number | null>(null)
  const isDropTarget = useDragStore(
    (s) => (s.isDragging || s.externalDrag) && s.dropTargetPanelId === panelId
  )
  const rowDropTargetId = useDragStore((s) => s.rowDropTargetId)
  const externalDrag = useDragStore((s) => s.externalDrag)
  const dragSourcePluginId = useDragStore((s) => s.dragSourcePluginId)

  useEffect(() => {
    if (!listRef.current) return
    const row = listRef.current.children[cursorIndex] as HTMLElement | undefined
    if (row) {
      row.scrollIntoView({ block: 'nearest' })
    }
  }, [cursorIndex])

  /**
   * Mouse selection model: plain click moves the cursor only (orthodox —
   * Insert/Space keep owning selection), ctrl-click toggles a row, shift-click
   * selects the range from the last clicked row. Selection state lives in the
   * panel store; selectRange indexes raw entries, so display rows that aren't
   * entries (parent '..', bookmarks, drives) are skipped.
   */
  const handleClick = useCallback(
    (index: number, e: React.MouseEvent) => {
      const store = usePanelStore.getState()
      const tab = store.getActiveTab(panelId)
      const entry = entries[index]
      const offset = entries[0]?.id === '__parent__' ? 1 : 0

      if (e.shiftKey && entry) {
        const anchor = shiftAnchorRef.current ?? tab.cursorIndex
        store.selectRange(panelId, anchor - offset, index - offset)
        onCursorChange(index)
        return
      }

      shiftAnchorRef.current = index

      if ((e.ctrlKey || e.metaKey) && entry) {
        const virtual =
          entry.id === '__parent__' ||
          entry.iconHint === 'drive' ||
          entry.iconHint === 'network' ||
          entry.meta?.bookmark === true
        if (!virtual) store.toggleSelect(panelId, entry.id)
      }
      onCursorChange(index)
    },
    [entries, onCursorChange, panelId]
  )

  const handleDoubleClick = useCallback(
    (entry: Entry) => {
      onActivate(entry)
    },
    [onActivate]
  )

  /** OS files dragged in from Finder/Explorer land as a copy op (F-16). */
  const enqueueExternalCopy = useCallback(
    async (files: File[], destDisplay: string, destLocationId: string, destPluginId: string) => {
      const paths = files
        .map((f) => window.api.util.getPathForFile(f))
        .filter((p) => !!p)
      if (paths.length === 0) {
        showToast('Could not read the dropped files')
        return
      }
      const entries: Entry[] = paths.map((p) => ({
        id: p,
        name: p.split(/[\\/]/).pop() || p,
        isContainer: false,
        size: -1,
        modifiedAt: 0,
        mimeType: '',
        iconHint: 'file',
        meta: {},
        attributes: { readonly: false, hidden: false, symlink: false }
      }))
      useOperationsStore.getState().enqueue({
        type: 'copy',
        sourceEntries: entries,
        sourcePluginId: 'local-filesystem',
        destinationDisplay: destDisplay,
        destinationLocationId: destLocationId,
        destinationPluginId: destPluginId
      })
    },
    []
  )

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      const dragState = useDragStore.getState()
      const external =
        !dragState.isDragging && Array.from(e.dataTransfer.types).includes('Files')
      if (!dragState.isDragging && !external) return

      if (external) {
        // OS drop onto the hovered panel → copy into this directory (F-16).
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        useDragStore.getState().setExternalDrag(true)
        useDragStore.getState().setDropTarget(panelId)
        return
      }
      if (dragState.dragSourcePanelId === panelId) {
        // Same panel: only folder-row drops are meaningful (handled per row);
        // dropping on the listing background would be a no-op move.
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
    (e: React.DragEvent, destOverride?: { display: string; locationId: string }) => {
      e.preventDefault()
      const dragState = useDragStore.getState()
      const externalFiles =
        !dragState.isDragging && e.dataTransfer.files.length > 0
      if (!dragState.isDragging && !externalFiles) return

      const destTab = usePanelStore.getState().getActiveTab(panelId)
      const destDisplay = destOverride?.display ?? destTab.locationDisplay
      const destLocationId = destOverride?.locationId ?? destTab.locationId
      if (!destLocationId) {
        showToast('Select a destination folder')
        useDragStore.getState().endDrag()
        return
      }

      if (externalFiles) {
        void enqueueExternalCopy(
          Array.from(e.dataTransfer.files),
          destDisplay,
          destLocationId,
          destTab.pluginId
        )
      } else {
        const isCrossPlugin = dragState.dragSourcePluginId !== destTab.pluginId
        const opType = e.ctrlKey || isCrossPlugin ? 'copy' : 'move'
        useOperationsStore.getState().enqueue({
          type: opType,
          sourceEntries: dragState.draggedEntries,
          sourcePluginId: dragState.dragSourcePluginId!,
          destinationDisplay: destDisplay,
          destinationLocationId: destLocationId,
          destinationPluginId: destTab.pluginId
        })
      }

      useDragStore.getState().endDrag()
    },
    [panelId, enqueueExternalCopy]
  )

  // Folder-row drops (F-16): internal same-panel moves into a subfolder,
  // cross-panel drops onto a folder, and OS files dropped on a folder.
  const handleRowDragOver = useCallback(
    (entry: Entry, e: React.DragEvent) => {
      const dragState = useDragStore.getState()
      const external =
        !dragState.isDragging && Array.from(e.dataTransfer.types).includes('Files')
      if ((!dragState.isDragging && !external) || entry.id === '__parent__' || !entry.isContainer)
        return
      e.preventDefault()
      e.stopPropagation() // the row owns this drop — not the list background
      const crossDevice =
        !external &&
        usePanelStore.getState().getActiveTab(panelId).pluginId !== dragState.dragSourcePluginId
      e.dataTransfer.dropEffect = external || crossDevice || e.ctrlKey ? 'copy' : 'move'
      useDragStore.getState().setDropTarget(panelId)
      useDragStore.getState().setRowDropTarget(entry.id)
    },
    [panelId]
  )

  const handleRowDrop = useCallback(
    (entry: Entry, e: React.DragEvent) => {
      e.stopPropagation()
      const dragState = useDragStore.getState()
      const externalFiles =
        !dragState.isDragging && e.dataTransfer.files.length > 0
      if (!dragState.isDragging && !externalFiles) return

      if (
        !externalFiles &&
        wouldCopyIntoSelf(dragState.draggedEntries, entry.id)
      ) {
        showToast('Cannot move into self or subfolder')
        useDragStore.getState().endDrag()
        return
      }

      // Show the dropped-into folder as the destination (panel dir + row name).
      const destTab = usePanelStore.getState().getActiveTab(panelId)
      const base = destTab.locationDisplay || ''
      const sep = base.includes('\\') ? '\\' : '/'
      const display = base ? `${base.replace(/[\\/]+$/, '')}${sep}${entry.name}` : entry.name
      void handleDrop(e, { display, locationId: entry.id })
    },
    [panelId, handleDrop]
  )

  const handleRowDragLeave = useCallback((entry: Entry, e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    const s = useDragStore.getState()
    if (s.rowDropTargetId === entry.id) s.setRowDropTarget(null)
  }, [])

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
        useDragStore.getState().setDropTarget(null)
        useDragStore.getState().setRowDropTarget(null)
        useDragStore.getState().setExternalDrag(false)
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

  // What a drop here would do — surfaces the cross-device copy force (F-16).
  let dropHint = ''
  if (isDropTarget) {
    if (externalDrag) {
      dropHint = 'Drop to copy into this folder'
    } else if (dragSourcePluginId !== pluginId) {
      dropHint = 'Drop to copy — cross-device, copy forced'
    } else {
      dropHint = 'Drop to move here (Ctrl = copy)'
    }
  }

  if (entries.length === 0) {
    return (
      <div className={listClassName} onDragOver={handleDragOver} onDrop={(e) => handleDrop(e)} onDragLeave={handleDragLeave}>
        {dropHint && <div className={styles.dropHint}>{dropHint}</div>}
        <div className={styles.empty}>Empty</div>
      </div>
    )
  }

  return (
    <div
      className={listClassName}
      ref={listRef}
      role="grid"
      aria-label="File list"
      data-file-list={panelId}
      onDragOver={handleDragOver}
      onDrop={(e) => handleDrop(e)}
      onDragLeave={handleDragLeave}
    >
      {dropHint && <div className={styles.dropHint} data-testid="drop-hint">{dropHint}</div>}
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
          isRowDropTarget={rowDropTargetId === entry.id}
          onRowDragOver={handleRowDragOver}
          onRowDrop={handleRowDrop}
          onRowDragLeave={handleRowDragLeave}
          onClick={(e) => handleClick(index, e)}
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
