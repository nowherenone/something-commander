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
    Promise.all([
      window.api.store.get(`panel-${panelId}-state`),
      window.api.store.get(`panel-${panelId}-location`)
    ]).then(([stateData, legacyData]) => {
      const state = stateData as { pluginId?: string; locationId?: string } | null
      const pluginId = state?.pluginId || 'local-filesystem'
      const locationId = state?.locationId || (legacyData as string | null) || null

      usePanelStore.getState().navigateWithPlugin(panelId, pluginId, locationId || null)
        .catch(() => usePanelStore.getState().navigate(panelId, null))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelId])

  const handleActivate = useCallback(
    async (entry: { id: string; isContainer: boolean; name?: string }) => {
      if (entry.isContainer) {
        navigate(panelId, entry.id)
      } else {
        // Check if it's an archive — works for any plugin
        const isArchive = await window.api.util.isArchive(entry.name || entry.id)
        if (isArchive) {
          // Encode the source plugin in the archive path for non-local plugins
          const archiveRef = tab.pluginId === 'local-filesystem'
            ? entry.id
            : `${tab.pluginId}:${entry.id}`
          usePanelStore.getState().navigateWithPlugin(panelId, 'archive', `${archiveRef}::`)
          return
        }
        // Open with system default application (only for local files)
        if (tab.pluginId === 'local-filesystem') {
          window.api.util.openFile(entry.id)
        }
      }
    },
    [panelId, navigate, tab.pluginId]
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
    } else if (tab.pluginId === 'archive') {
      // Exiting an archive — determine the source plugin
      const archivePath = tab.locationId?.split('::')[0]
      if (!archivePath) return

      // Check for remote source prefix (e.g. "smb:user@host/share/file.zip")
      const REMOTE_PREFIXES = ['smb:', 'sftp:', 's3:', 'archive:']
      const isRemote = REMOTE_PREFIXES.some((p) => archivePath.startsWith(p))
      if (isRemote) {
        const colonIdx = archivePath.indexOf(':')
        const sourcePlugin = archivePath.slice(0, colonIdx)
        const sourceEntryId = archivePath.slice(colonIdx + 1)
        // Navigate to the parent directory in the source plugin
        const parentPath = sourceEntryId.includes('/')
          ? sourceEntryId.slice(0, sourceEntryId.lastIndexOf('/'))
          : null
        usePanelStore.getState().navigateWithPlugin(panelId, sourcePlugin, parentPath)
      } else {
        // Local archive — go back to local-filesystem
        const parentDir = archivePath.replace(/[\\/][^\\/]+$/, '')
        usePanelStore.getState().navigateWithPlugin(panelId, 'local-filesystem', parentDir)
      }
    } else if (tab.pluginId !== 'local-filesystem') {
      navigate(panelId, null)
    } else {
      navigate(panelId, null)
    }
  }, [panelId, tab.parentId, tab.pluginId, tab.locationId, navigate])

  const showParentEntry = hasParentEntry(tab)
  const bookmarks = useBookmarksStore((s) => s.bookmarks)
  const isHome = tab.locationId === null

  // When landing on the home page, jump cursor to first bookmark (past the drives list)
  const prevIsHomeRef = React.useRef(false)
  useEffect(() => {
    const arrivedAtHome = isHome && !prevIsHomeRef.current
    prevIsHomeRef.current = isHome
    if (!arrivedAtHome || bookmarks.length === 0 || tab.entries.length === 0) return
    setCursor(panelId, tab.entries.length) // first bookmark index in displayEntries
  }, [isHome, tab.entries.length, bookmarks.length, panelId, setCursor])

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
          onNavigatePlugin={(pluginId, locationId) =>
            usePanelStore.getState().navigateWithPlugin(panelId, pluginId, locationId)
          }
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
              panelId={panelId}
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
