import React, { useCallback, useEffect } from 'react'
import type { PanelId } from '../../stores/app-store'
import { useAppStore } from '../../stores/app-store'
import { usePanelStore } from '../../stores/panel-store'
import type { SortConfig, SortField } from '../../utils/sort'
import { AddressBar } from './AddressBar'
import { ColumnHeaders } from './ColumnHeaders'
import { FileList } from './FileList'
import { StatusBar } from './StatusBar'
import styles from '../../styles/panels.module.css'

interface FilePanelProps {
  panelId: PanelId
}

export function FilePanel({ panelId }: FilePanelProps): React.JSX.Element {
  const activePanel = useAppStore((s) => s.activePanel)
  const setActivePanel = useAppStore((s) => s.setActivePanel)
  const isActive = activePanel === panelId

  const panel = usePanelStore((s) => s[panelId])
  const navigate = usePanelStore((s) => s.navigate)
  const setSort = usePanelStore((s) => s.setSort)
  const setCursor = usePanelStore((s) => s.setCursor)
  const toggleSelect = usePanelStore((s) => s.toggleSelect)

  // Navigate to saved location or home on mount
  useEffect(() => {
    const savedLocation = localStorage.getItem(`panel-${panelId}-location`)
    navigate(panelId, savedLocation || null)
  }, [panelId, navigate])

  const handleActivate = useCallback(
    (entry: { id: string; isContainer: boolean }) => {
      if (entry.isContainer) {
        navigate(panelId, entry.id)
      }
    },
    [panelId, navigate]
  )

  const handleSort = useCallback(
    (field: SortField) => {
      const newConfig: SortConfig = {
        field,
        direction:
          panel.sortConfig.field === field && panel.sortConfig.direction === 'asc' ? 'desc' : 'asc'
      }
      setSort(panelId, newConfig)
    },
    [panelId, panel.sortConfig, setSort]
  )

  const handleNavigateAddress = useCallback(
    async (input: string) => {
      const resolved = await window.api.plugins.resolveLocation(panel.pluginId, input)
      if (resolved !== null) {
        navigate(panelId, resolved)
      }
    },
    [panelId, panel.pluginId, navigate]
  )

  const handleSegmentClick = useCallback(
    (path: string) => {
      if (path === '') {
        navigate(panelId, null)
      } else {
        navigate(panelId, path)
      }
    },
    [panelId, navigate]
  )

  const handleGoUp = useCallback(() => {
    if (panel.parentId !== null) {
      navigate(panelId, panel.parentId)
    } else {
      navigate(panelId, null)
    }
  }, [panelId, panel.parentId, navigate])

  // Entries with ".." at the top if we have a parent
  const displayEntries =
    panel.parentId !== null
      ? [
          {
            id: '__parent__',
            name: '..',
            isContainer: true,
            size: -1,
            modifiedAt: 0,
            mimeType: 'inode/directory',
            iconHint: 'folder',
            meta: {},
            attributes: { readonly: true, hidden: false, symlink: false }
          },
          ...panel.entries
        ]
      : panel.entries

  const handleEntryActivate = useCallback(
    (entry: { id: string; isContainer: boolean }) => {
      if (entry.id === '__parent__') {
        handleGoUp()
      } else {
        handleActivate(entry)
      }
    },
    [handleActivate, handleGoUp]
  )

  return (
    <div
      className={`${styles.panel} ${isActive ? styles.active : ''}`}
      onClick={() => setActivePanel(panelId)}
    >
      <AddressBar
        location={panel.locationDisplay}
        onNavigate={handleNavigateAddress}
        onSegmentClick={handleSegmentClick}
      />
      <ColumnHeaders sortConfig={panel.sortConfig} onSort={handleSort} />
      {panel.isLoading ? (
        <div className={styles.loading}>Loading...</div>
      ) : panel.error ? (
        <div className={styles.error}>{panel.error}</div>
      ) : (
        <FileList
          entries={displayEntries}
          cursorIndex={panel.cursorIndex}
          selectedIds={panel.selectedEntryIds}
          onCursorChange={(i) => setCursor(panelId, i)}
          onSelect={(id) => toggleSelect(panelId, id)}
          onActivate={handleEntryActivate}
        />
      )}
      <StatusBar entries={panel.entries} selectedIds={panel.selectedEntryIds} />
    </div>
  )
}
