import React, { useCallback, useEffect } from 'react'
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
import { TreeView } from './TreeView'
import { InfoView } from './InfoView'
import { QuickView } from './QuickView'
import { useBookmarksStore } from '../../stores/bookmarks-store'
import styles from '../../styles/panels.module.css'

/** Reactive bridge: subscribes to opposite panel's cursor for QuickView */
function QuickViewBridge({ panelId }: { panelId: PanelId }): React.JSX.Element {
  const otherPanelId = panelId === 'left' ? 'right' : 'left'
  const otherPanel = usePanelStore((s) => s[otherPanelId])
  const otherTab = otherPanel.tabs.find((t) => t.id === otherPanel.activeTabId) || otherPanel.tabs[0]

  const offset = (otherTab?.parentId !== null || otherTab?.pluginId !== 'local-filesystem') ? 1 : 0
  const idx = (otherTab?.cursorIndex || 0) - offset
  const cursorEntry = otherTab && idx >= 0 && idx < otherTab.entries.length ? otherTab.entries[idx] : null

  return <QuickView entry={cursorEntry} />
}

interface FilePanelProps {
  panelId: PanelId
}

export function FilePanel({ panelId }: FilePanelProps): React.JSX.Element {
  const activePanel = useAppStore((s) => s.activePanel)
  const setActivePanel = useAppStore((s) => s.setActivePanel)
  const isActive = activePanel === panelId
  const viewMode = useAppStore((s) => panelId === 'left' ? s.leftViewMode : s.rightViewMode)

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
  const bookmarks = useBookmarksStore((s) => s.bookmarks)
  const isHome = tab.locationId === null

  // At home view, append bookmarks as navigable entries
  const homeBookmarkEntries = isHome ? bookmarks.map((bm) => ({
    id: bm.path,
    name: `\u2605 ${bm.name}`,
    isContainer: true,
    size: -1,
    modifiedAt: 0,
    mimeType: 'inode/directory',
    iconHint: 'folder',
    meta: { bookmark: true, pluginId: bm.pluginId },
    attributes: { readonly: false, hidden: false, symlink: false }
  })) : []

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
          ...tab.entries,
          ...homeBookmarkEntries
        ]
      : [...tab.entries, ...homeBookmarkEntries]

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
      {viewMode === 'brief' && (
        <>
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
          <StatusBar entries={tab.entries} selectedIds={tab.selectedEntryIds} locationId={tab.locationId} />
        </>
      )}
      {viewMode === 'tree' && (
        <TreeView
          pluginId={tab.pluginId}
          locationId={tab.locationId}
          onNavigate={(loc) => navigate(panelId, loc)}
        />
      )}
      {viewMode === 'info' && (
        <InfoView
          pluginId={tab.pluginId}
          locationId={tab.locationId}
          locationDisplay={tab.locationDisplay}
        />
      )}
      {viewMode === 'quickview' && (
        <QuickViewBridge panelId={panelId} />
      )}
    </div>
  )
}
