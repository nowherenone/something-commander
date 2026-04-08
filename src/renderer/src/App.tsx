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
import { useKeyboard } from './hooks/useKeyboard'
import { useFileOperations } from './hooks/useFileOperations'
import { useAppStore } from './stores/app-store'
import { usePanelStore, parentOffset } from './stores/panel-store'
import { useOperationsStore } from './stores/operations-store'
import { useSettingsStore, loadSettings } from './stores/settings-store'
import { loadBookmarks } from './stores/bookmarks-store'
import type { Entry } from '@shared/types'

function App(): React.JSX.Element {
  const [mkdirDialog, setMkdirDialog] = useState(false)
  const [mkdirName, setMkdirName] = useState('')
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
    setMkdirName('')
    setMkdirDialog(true)
  }, [])

  const handleF7Submit = useCallback(async () => {
    if (!mkdirName.trim()) return
    const activePanel = useAppStore.getState().activePanel
    const state = usePanelStore.getState()
    const tab = state.getActiveTab(activePanel)

    await window.api.plugins.executeOperation(tab.pluginId, {
      op: 'createDirectory',
      parentLocationId: tab.locationId!,
      name: mkdirName.trim()
    })
    setMkdirDialog(false)
    state.refresh(activePanel)
  }, [mkdirName])

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

  useKeyboard({
    onF3: handleF3,
    onF4: handleF4,
    onF5: handleCopy,
    onF6: handleMove,
    onF7: handleF7,
    onF8: handleDelete,
    onF9: handleF9,
    onAltF5: handlePack,
    onAltF7: handleAltF7,
    onAltF9: handleUnpack,
    onCtrlM: handleCtrlM,
    onCompare: handleCompare,
    onSelectGroup: () => setSelectGroupMode('select'),
    onUnselectGroup: () => setSelectGroupMode('unselect')
  })

  const bottomBar = useSettingsStore((s) => s.bottomBar)
  const showCommandLine = useSettingsStore((s) => s.showCommandLine)

  const handleMenuAction = useCallback((action: string) => {
    switch (action) {
      case 'view': handleF3(); break
      case 'edit': handleF4(); break
      case 'copy': handleCopy(); break
      case 'move': handleMove(); break
      case 'pack': handlePack(); break
      case 'unpack': handleUnpack(); break
      case 'mkdir': handleF7(); break
      case 'delete': handleDelete(); break
      case 'multiRename': handleCtrlM(); break
      case 'search': handleAltF7(); break
      case 'compare': handleCompare(); break
      case 'settings': handleF9(); break
      case 'toggleHidden': {
        const ap = useAppStore.getState().activePanel
        usePanelStore.getState().toggleHidden(ap)
        break
      }
      case 'refresh': {
        const ap = useAppStore.getState().activePanel
        usePanelStore.getState().refresh(ap)
        break
      }
      case 'newTab': {
        const ap = useAppStore.getState().activePanel
        usePanelStore.getState().addTab(ap)
        break
      }
      case 'closeTab': {
        const ap = useAppStore.getState().activePanel
        const tab = usePanelStore.getState().getActiveTab(ap)
        usePanelStore.getState().closeTab(ap, tab.id)
        break
      }
      case 'driveMenu': {
        const ap = useAppStore.getState().activePanel
        useAppStore.getState().openDriveMenu(ap)
        break
      }
      case 'networkConnections':
        setNetworkDialogOpen(true)
        break
      case 'pluginManager':
        setPluginManagerOpen(true)
        break
      case 'viewBrief':
        useAppStore.getState().setViewMode(useAppStore.getState().activePanel, 'brief')
        break
      case 'viewTree':
        useAppStore.getState().setViewMode(useAppStore.getState().activePanel, 'tree')
        break
      case 'viewInfo':
        useAppStore.getState().setViewMode(useAppStore.getState().activePanel, 'info')
        break
      case 'viewQuickview':
        useAppStore.getState().setViewMode(useAppStore.getState().activePanel, 'quickview')
        break
      case 'toggleCommandLine':
        useSettingsStore.getState().updateSettings({ showCommandLine: !showCommandLine })
        break
      case 'setBottomFnkeys':
        useSettingsStore.getState().updateSettings({ bottomBar: 'fnkeys' })
        break
      case 'setBottomStatus':
        useSettingsStore.getState().updateSettings({ bottomBar: 'status' })
        break
      case 'setBottomNone':
        useSettingsStore.getState().updateSettings({ bottomBar: 'none' })
        break
      case 'selectGroup':
        setSelectGroupMode('select')
        break
      case 'unselectGroup':
        setSelectGroupMode('unselect')
        break
      case 'selectAll': {
        const ap = useAppStore.getState().activePanel
        usePanelStore.getState().selectAll(ap)
        break
      }
      case 'deselectAll': {
        const ap = useAppStore.getState().activePanel
        usePanelStore.getState().deselectAll(ap)
        break
      }
      case 'invertSelection': {
        const ap = useAppStore.getState().activePanel
        usePanelStore.getState().invertSelection(ap)
        break
      }
      case 'selectSameExt': {
        const ap = useAppStore.getState().activePanel
        usePanelStore.getState().selectSameExt(ap)
        break
      }
      case 'quit':
        window.close()
        break
    }
  }, [handleF3, handleF4, handleCopy, handleMove, handlePack, handleUnpack, handleF7, handleDelete, handleCtrlM, handleAltF7, handleCompare, handleF9, showCommandLine])

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
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100
          }}
          onClick={() => setMkdirDialog(false)}
        >
          <div
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: 6,
              padding: 20,
              minWidth: 320
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--text-primary)' }}>
              Create Directory
            </h3>
            <input
              autoFocus
              value={mkdirName}
              onChange={(e) => setMkdirName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleF7Submit()
                if (e.key === 'Escape') setMkdirDialog(false)
              }}
              placeholder="Directory name"
              style={{
                width: '100%',
                padding: '6px 8px',
                background: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: 3,
                fontFamily: 'var(--font-family)',
                fontSize: 'var(--font-size)'
              }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button
                onClick={() => setMkdirDialog(false)}
                style={{
                  padding: '4px 16px',
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 3,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleF7Submit}
                style={{
                  padding: '4px 16px',
                  background: 'var(--accent)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 3,
                  cursor: 'pointer'
                }}
              >
                Create
              </button>
            </div>
          </div>
        </div>
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
