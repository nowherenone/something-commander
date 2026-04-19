import React, { useCallback, useState, useEffect } from 'react'
import { DualPanel } from './components/panels/DualPanel'
import { FunctionKeyBar } from './components/layout/FunctionKeyBar'
import { CommandLine } from './components/layout/CommandLine'
import { MenuBar } from './components/layout/MenuBar'
// BottomStatusBar removed — each panel has its own status bar with disk space
import { OperationDialog, QueueButton } from './components/dialogs/OperationDialog'
import { SettingsDialog } from './components/dialogs/SettingsDialog'
import { SearchDialog } from './components/dialogs/SearchDialog'
import { MultiRename } from './components/dialogs/MultiRename'
import { DirCompare } from './components/dialogs/DirCompare'
import { ConfirmOperation } from './components/dialogs/ConfirmOperation'
import { ToastContainer } from './components/layout/Toast'
import { NetworkConnections } from './components/dialogs/NetworkConnections'
import { PluginManagerDialog } from './components/dialogs/PluginManager'
import { SelectGroupDialog } from './components/dialogs/SelectGroupDialog'
import { MkdirDialog } from './components/dialogs/MkdirDialog'
import { useKeyboard } from './hooks/useKeyboard'
import { useFileOperations } from './hooks/useFileOperations'
import { useAppStore } from './stores/app-store'
import { usePanelStore, parentOffset } from './stores/panel-store'
import { useOperationsStore } from './stores/operations-store'
import { useSettingsStore, loadSettings } from './stores/settings-store'
import { loadBookmarks } from './stores/bookmarks-store'
import { registerCommands, dispatchCommand } from './commands/registry'
import { parseArchivePath } from './utils/archive-path'
import { splitPathTail } from './utils/entry-helpers'
import type { Entry } from '@shared/types'

function App(): React.JSX.Element {
  const [mkdirDialog, setMkdirDialog] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [multiRenameEntries, setMultiRenameEntries] = useState<Entry[] | null>(null)
  const [multiRenamePluginId, setMultiRenamePluginId] = useState('')
  const [dirCompareOpen, setDirCompareOpen] = useState(false)
  const [networkDialogOpen, setNetworkDialogOpen] = useState(false)
  const [pluginManagerOpen, setPluginManagerOpen] = useState(false)
  const [selectGroupMode, setSelectGroupMode] = useState<'select' | 'unselect' | null>(null)

  const { handleCopy, handleMove, handleDelete, handlePack, handleUnpack, pendingOp, confirmOperation, cancelOperation } = useFileOperations()

  // Load persisted user data from disk on first mount
  useEffect(() => {
    loadSettings()
    loadBookmarks()
  }, [])

  // Apply saved theme on mount
  const theme = useSettingsStore((s) => s.theme)
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const handleF7 = useCallback(() => {
    setMkdirDialog(true)
  }, [])

  const handleF7Submit = useCallback(async (name: string) => {
    const activePanel = useAppStore.getState().activePanel
    const state = usePanelStore.getState()
    const tab = state.getActiveTab(activePanel)

    await window.api.plugins.executeOperation(tab.pluginId, {
      op: 'createDirectory',
      parentLocationId: tab.locationId!,
      name
    })
    setMkdirDialog(false)
    state.refresh(activePanel)
  }, [])

  const getCursorEntry = useCallback(() => {
    const activePanel = useAppStore.getState().activePanel
    const tab = usePanelStore.getState().getActiveTab(activePanel)
    const offset = parentOffset(tab)
    const idx = tab.cursorIndex - offset
    if (idx >= 0 && idx < tab.entries.length) {
      return tab.entries[idx]
    }
    return null
  }, [])

  const handleF3 = useCallback(() => {
    const entry = getCursorEntry()
    if (entry && !entry.isContainer) {
      window.api.util.openViewerWindow(entry.id, entry.name)
    }
  }, [getCursorEntry])

  const handleF4 = useCallback(() => {
    const entry = getCursorEntry()
    if (entry && !entry.isContainer) {
      window.api.util.openEditorWindow(entry.id, entry.name)
    }
  }, [getCursorEntry])

  const handleF9 = useCallback(() => {
    setSettingsOpen(true)
  }, [])

  const handleAltF7 = useCallback(() => {
    setSearchOpen(true)
  }, [])

  const handleCtrlM = useCallback(() => {
    const activePanel = useAppStore.getState().activePanel
    const state = usePanelStore.getState()
    const tab = state.getActiveTab(activePanel)
    let selected = tab.entries.filter((e) => tab.selectedEntryIds.has(e.id))
    if (selected.length === 0) {
      selected = tab.entries.filter((e) => !e.isContainer)
    }
    if (selected.length > 0) {
      setMultiRenameEntries(selected)
      setMultiRenamePluginId(tab.pluginId)
    }
  }, [])

  const handleCompare = useCallback(() => {
    setDirCompareOpen(true)
  }, [])

  // Activate entry (Enter / double-click) — handles archives from any plugin
  const handleActivateEntry = useCallback(async (entry: { id: string; isContainer: boolean; name?: string }) => {
    const activePanel = useAppStore.getState().activePanel
    const tab = usePanelStore.getState().getActiveTab(activePanel)
    if (entry.id === '__parent__') {
      handleGoUp()
      return
    }
    if (entry.isContainer) {
      usePanelStore.getState().navigate(activePanel, entry.id)
    } else {
      const isArchive = await window.api.util.isArchive(entry.name || entry.id)
      if (isArchive) {
        const archiveRef = tab.pluginId === 'local-filesystem'
          ? entry.id
          : `${tab.pluginId}:${entry.id}`
        usePanelStore.getState().navigateWithPlugin(activePanel, 'archive', `${archiveRef}::`)
      } else if (tab.pluginId === 'local-filesystem') {
        window.api.util.openFile(entry.id)
      }
    }
  }, [])

  // Go up — handles archives, network plugins, local filesystem
  const handleGoUp = useCallback(() => {
    const activePanel = useAppStore.getState().activePanel
    const tab = usePanelStore.getState().getActiveTab(activePanel)
    if (tab.parentId !== null) {
      usePanelStore.getState().navigate(activePanel, tab.parentId)
    } else if (tab.pluginId === 'archive') {
      const archivePath = tab.locationId ? parseArchivePath(tab.locationId).archive : ''
      if (!archivePath) return
      const REMOTE_PREFIXES = ['smb:', 'sftp:', 's3:', 'archive:']
      const isRemote = REMOTE_PREFIXES.some((p) => archivePath.startsWith(p))
      if (isRemote) {
        const colonIdx = archivePath.indexOf(':')
        const sourcePlugin = archivePath.slice(0, colonIdx)
        const sourceEntryId = archivePath.slice(colonIdx + 1)
        const parentPath = sourceEntryId.includes('/')
          ? sourceEntryId.slice(0, sourceEntryId.lastIndexOf('/'))
          : null
        usePanelStore.getState().navigateWithPlugin(activePanel, sourcePlugin, parentPath)
      } else {
        const { parent } = splitPathTail(archivePath)
        usePanelStore.getState().navigateWithPlugin(activePanel, 'local-filesystem', parent)
      }
    } else {
      usePanelStore.getState().navigate(activePanel, null)
    }
  }, [])

  useKeyboard({
    onActivate: handleActivateEntry,
    onGoUp: handleGoUp
  })

  const bottomBar = useSettingsStore((s) => s.bottomBar)
  const showCommandLine = useSettingsStore((s) => s.showCommandLine)

  // Register all commands so menu clicks, keyboard shortcuts, and context
  // menus share a single dispatch. Runs whenever any handler identity changes.
  useEffect(() => {
    const activePanel = (): 'left' | 'right' => useAppStore.getState().activePanel
    const panel = (): ReturnType<typeof usePanelStore.getState> => usePanelStore.getState()
    const app = (): ReturnType<typeof useAppStore.getState> => useAppStore.getState()
    const settings = (): ReturnType<typeof useSettingsStore.getState> => useSettingsStore.getState()

    return registerCommands({
      view: handleF3,
      edit: handleF4,
      copy: handleCopy,
      move: handleMove,
      pack: handlePack,
      unpack: handleUnpack,
      mkdir: handleF7,
      delete: handleDelete,
      multiRename: handleCtrlM,
      search: handleAltF7,
      compare: handleCompare,
      settings: handleF9,
      // Panel-local commands.
      toggleHidden: () => panel().toggleHidden(activePanel()),
      refresh: () => panel().refresh(activePanel()),
      selectAll: () => panel().selectAll(activePanel()),
      deselectAll: () => panel().deselectAll(activePanel()),
      invertSelection: () => panel().invertSelection(activePanel()),
      selectSameExt: () => panel().selectSameExt(activePanel()),
      newTab: () => panel().addTab(activePanel()),
      closeTab: () => {
        const ap = activePanel()
        const tab = panel().getActiveTab(ap)
        panel().closeTab(ap, tab.id)
      },
      driveMenu: () => app().openDriveMenu(activePanel()),
      driveMenuLeft: () => app().openDriveMenu('left'),
      driveMenuRight: () => app().openDriveMenu('right'),
      viewBrief: () => app().setViewMode(activePanel(), 'brief'),
      viewTree: () => app().setViewMode(activePanel(), 'tree'),
      viewInfo: () => app().setViewMode(activePanel(), 'info'),
      viewQuickview: () => app().setViewMode(activePanel(), 'quickview'),
      toggleCommandLine: () => settings().updateSettings({ showCommandLine: !settings().showCommandLine }),
      setBottomFnkeys: () => settings().updateSettings({ bottomBar: 'fnkeys' }),
      setBottomStatus: () => settings().updateSettings({ bottomBar: 'status' }),
      setBottomNone: () => settings().updateSettings({ bottomBar: 'none' }),
      selectGroup: () => setSelectGroupMode('select'),
      unselectGroup: () => setSelectGroupMode('unselect'),
      networkConnections: () => setNetworkDialogOpen(true),
      pluginManager: () => setPluginManagerOpen(true),
      quit: () => window.close()
    })
  }, [handleF3, handleF4, handleCopy, handleMove, handlePack, handleUnpack, handleF7, handleDelete, handleCtrlM, handleAltF7, handleCompare, handleF9])

  const handleMenuAction = useCallback((action: string) => {
    dispatchCommand(action)
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <MenuBar onAction={handleMenuAction} />
      <DualPanel />
      {showCommandLine && <CommandLine />}
      {bottomBar === 'fnkeys' && (
        <FunctionKeyBar
          onF3={handleF3}
          onF5={handleCopy}
          onF6={handleMove}
          onF7={handleF7}
          onF8={handleDelete}
          onF9={handleF9}
        />
      )}
      {/* 'status' mode: panel-level status bars handle this */}

      <OperationDialog />
      <QueueButton />
      <ToastContainer />

      {pendingOp && (
        <ConfirmOperation
          type={pendingOp.type}
          entries={pendingOp.entries}
          sourceDir={pendingOp.sourceDir}
          destDir={pendingOp.destDir}
          onConfirm={confirmOperation}
          onCancel={cancelOperation}
        />
      )}

      {mkdirDialog && (
        <MkdirDialog onClose={() => setMkdirDialog(false)} onSubmit={handleF7Submit} />
      )}

      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}



      {searchOpen && (
        <SearchDialog
          searchRoot={
            usePanelStore.getState().getActiveTab(useAppStore.getState().activePanel)
              .locationDisplay || ''
          }
          onClose={() => setSearchOpen(false)}
          onNavigateTo={(path) => {
            const activePanel = useAppStore.getState().activePanel
            usePanelStore.getState().navigate(activePanel, path)
          }}
        />
      )}

      {dirCompareOpen && (() => {
        const leftTab = usePanelStore.getState().getActiveTab('left')
        const rightTab = usePanelStore.getState().getActiveTab('right')
        return (
          <DirCompare
            leftPath={leftTab.locationDisplay}
            rightPath={rightTab.locationDisplay}
            leftEntries={leftTab.entries}
            rightEntries={rightTab.entries}
            onClose={() => setDirCompareOpen(false)}
            onSyncLeftToRight={(names) => {
              const entries = leftTab.entries.filter((e) => names.includes(e.name))
              if (entries.length > 0 && rightTab.locationId) {
                useOperationsStore.getState().enqueue({
                  type: 'copy',
                  sourceEntries: entries,
                  sourcePluginId: leftTab.pluginId,
                  destinationDisplay: rightTab.locationDisplay,
                  destinationLocationId: rightTab.locationId,
                  destinationPluginId: rightTab.pluginId
                })
              }
              setDirCompareOpen(false)
            }}
            onSyncRightToLeft={(names) => {
              const entries = rightTab.entries.filter((e) => names.includes(e.name))
              if (entries.length > 0 && leftTab.locationId) {
                useOperationsStore.getState().enqueue({
                  type: 'copy',
                  sourceEntries: entries,
                  sourcePluginId: rightTab.pluginId,
                  destinationDisplay: leftTab.locationDisplay,
                  destinationLocationId: leftTab.locationId,
                  destinationPluginId: leftTab.pluginId
                })
              }
              setDirCompareOpen(false)
            }}
          />
        )
      })()}

      {multiRenameEntries && (
        <MultiRename
          entries={multiRenameEntries}
          pluginId={multiRenamePluginId}
          onClose={() => setMultiRenameEntries(null)}
          onDone={() => {
            setMultiRenameEntries(null)
            usePanelStore.getState().refresh('left')
            usePanelStore.getState().refresh('right')
          }}
        />
      )}

      {pluginManagerOpen && (
        <PluginManagerDialog onClose={() => setPluginManagerOpen(false)} />
      )}

      {selectGroupMode && (
        <SelectGroupDialog
          mode={selectGroupMode}
          onConfirm={(pattern) => {
            const ap = useAppStore.getState().activePanel
            if (selectGroupMode === 'select') {
              usePanelStore.getState().selectGroup(ap, pattern)
            } else {
              usePanelStore.getState().unselectGroup(ap, pattern)
            }
            setSelectGroupMode(null)
          }}
          onCancel={() => setSelectGroupMode(null)}
        />
      )}


      {networkDialogOpen && (
        <NetworkConnections
          onClose={() => setNetworkDialogOpen(false)}
          onConnected={(pluginId, locationId) => {
            setNetworkDialogOpen(false)
            const activePanel = useAppStore.getState().activePanel
            usePanelStore.getState().navigateWithPlugin(activePanel, pluginId, locationId)
          }}
        />
      )}
    </div>
  )
}

export default App
