import React, { useCallback, useEffect, useState } from 'react'
import type { PanelId } from '../../stores/app-store'
import { useAppStore } from '../../stores/app-store'
import { usePanelStore, hasParentEntry } from '../../stores/panel-store'
import type { SortConfig, SortField } from '../../utils/sort'
import { TabBar } from './TabBar'
import { DriveBookmarkMenu } from './DriveBookmarkMenu'
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
  const addTab = usePanelStore((s) => s.addTab)
  const closeTab = usePanelStore((s) => s.closeTab)
  const switchTab = usePanelStore((s) => s.switchTab)
  const getActiveTab = usePanelStore((s) => s.getActiveTab)

  const tab = getActiveTab(panelId)
  const driveMenuOpenPanel = useAppStore((s) => s.driveMenuOpen)
  const openDriveMenu = useAppStore((s) => s.openDriveMenu)
  const closeDriveMenu = useAppStore((s) => s.closeDriveMenu)
  const driveMenuOpen = driveMenuOpenPanel === panelId

  // Navigate to saved location on mount only
  useEffect(() => {
    const savedLocation = localStorage.getItem(`panel-${panelId}-location`)
    usePanelStore.getState().navigate(panelId, savedLocation || null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelId])

  const handleActivate = useCallback(
    async (entry: { id: string; isContainer: boolean; name?: string }) => {
      if (entry.isContainer) {
        navigate(panelId, entry.id)
      } else {
        // Check if it's an archive file — navigate into it with archive plugin
        const isArchive = await window.api.util.isArchive(entry.id)
        if (isArchive) {
          usePanelStore.getState().navigateWithPlugin(panelId, 'archive', `${entry.id}::`)
        } else {
          // Open with system default application
          window.api.util.openFile(entry.id)
        }
      }
    },
    [panelId, navigate]
  )

  const handleSort = useCallback(
    (field: SortField) => {
      const newConfig: SortConfig = {
        field,
        direction:
          tab.sortConfig.field === field && tab.sortConfig.direction === 'asc' ? 'desc' : 'asc'
      }
      setSort(panelId, newConfig)
    },
    [panelId, tab.sortConfig, setSort]
  )

  const handleNavigateAddress = useCallback(
    async (input: string) => {
      const resolved = await window.api.plugins.resolveLocation(tab.pluginId, input)
      if (resolved !== null) {
        navigate(panelId, resolved)
      }
    },
    [panelId, tab.pluginId, navigate]
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
    if (tab.parentId !== null) {
      navigate(panelId, tab.parentId)
    } else if (tab.pluginId !== 'local-filesystem') {
      // Exiting an archive — switch back to local-filesystem
      // Extract the archive path from the locationId
      const archivePath = tab.locationId?.split('::')[0]
      if (archivePath) {
        const parentDir = archivePath.replace(/[\\/][^\\/]+$/, '')
        usePanelStore.getState().navigateWithPlugin(panelId, 'local-filesystem', parentDir)
      }
    } else {
      navigate(panelId, null)
    }
  }, [panelId, tab.parentId, tab.pluginId, tab.locationId, navigate])

  const showParentEntry = hasParentEntry(tab)

  const displayEntries =
    showParentEntry
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
          ...tab.entries
        ]
      : tab.entries

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

  // Tab info for the TabBar
  const tabInfos = panel.tabs.map((t) => ({
    id: t.id,
    label: t.locationDisplay
      ? t.locationDisplay.split(/[\\/]/).filter(Boolean).pop() || t.locationDisplay
      : 'New Tab'
  }))

  return (
    <div
      className={`${styles.panel} ${isActive ? styles.active : ''}`}
      onClick={() => setActivePanel(panelId)}
    >
      <div style={{ display: 'flex', height: 26, flexShrink: 0 }}>
        <DriveBookmarkMenu
          currentLocation={tab.locationDisplay}
          currentPluginId={tab.pluginId}
          onNavigate={(path) => navigate(panelId, path)}
          isOpen={driveMenuOpen}
          onToggle={(open) => open ? openDriveMenu(panelId) : closeDriveMenu()}
        />
        <TabBar
          tabs={tabInfos}
          activeTabId={panel.activeTabId}
          onSelectTab={(tabId) => switchTab(panelId, tabId)}
          onCloseTab={(tabId) => closeTab(panelId, tabId)}
          onNewTab={() => addTab(panelId)}
        />
      </div>
      <AddressBar
        location={tab.locationDisplay}
        onNavigate={handleNavigateAddress}
        onSegmentClick={handleSegmentClick}
      />
      <ColumnHeaders sortConfig={tab.sortConfig} onSort={handleSort} />
      {tab.isLoading ? (
        <div className={styles.loading}>Loading...</div>
      ) : (
        <FileList
          entries={displayEntries}
          cursorIndex={tab.cursorIndex}
          selectedIds={tab.selectedEntryIds}
          calculatingIds={tab.calculatingFolderIds}
          errorFolderIds={tab.errorFolderIds}
          isActive={isActive}
          onCursorChange={(i) => setCursor(panelId, i)}
          onSelect={(id) => toggleSelect(panelId, id)}
          onActivate={handleEntryActivate}
        />
      )}
      <StatusBar entries={tab.entries} selectedIds={tab.selectedEntryIds} locationId={tab.locationId} error={tab.error} />
    </div>
  )
}
