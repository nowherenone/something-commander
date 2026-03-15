import React, { useCallback, useState } from 'react'
import { DualPanel } from './components/panels/DualPanel'
import { FunctionKeyBar } from './components/layout/FunctionKeyBar'
import { useKeyboard } from './hooks/useKeyboard'
import { useAppStore } from './stores/app-store'
import { usePanelStore } from './stores/panel-store'

function App(): React.JSX.Element {
  const [mkdirDialog, setMkdirDialog] = useState(false)
  const [mkdirName, setMkdirName] = useState('')

  const handleF5 = useCallback(async () => {
    const activePanel = useAppStore.getState().activePanel
    const otherPanel = activePanel === 'left' ? 'right' : 'left'
    const state = usePanelStore.getState()
    const source = state[activePanel]
    const dest = state[otherPanel]

    const selected = source.entries.filter((e) => source.selectedEntryIds.has(e.id))
    if (selected.length === 0) {
      // Copy cursor item if nothing selected
      const offset = source.parentId !== null ? 1 : 0
      const idx = source.cursorIndex - offset
      if (idx >= 0 && idx < source.entries.length && !source.entries[idx].isContainer) {
        selected.push(source.entries[idx])
      }
    }
    if (selected.length === 0) return

    if (!confirm(`Copy ${selected.length} item(s) to ${dest.locationDisplay}?`)) return

    await window.api.plugins.executeOperation(source.pluginId, {
      op: 'copy',
      sourceEntries: selected,
      destinationLocationId: dest.locationId!,
      destinationPluginId: dest.pluginId
    })
    state.refresh('left')
    state.refresh('right')
  }, [])

  const handleF6 = useCallback(async () => {
    const activePanel = useAppStore.getState().activePanel
    const otherPanel = activePanel === 'left' ? 'right' : 'left'
    const state = usePanelStore.getState()
    const source = state[activePanel]
    const dest = state[otherPanel]

    const selected = source.entries.filter((e) => source.selectedEntryIds.has(e.id))
    if (selected.length === 0) {
      const offset = source.parentId !== null ? 1 : 0
      const idx = source.cursorIndex - offset
      if (idx >= 0 && idx < source.entries.length) {
        selected.push(source.entries[idx])
      }
    }
    if (selected.length === 0) return

    if (!confirm(`Move ${selected.length} item(s) to ${dest.locationDisplay}?`)) return

    await window.api.plugins.executeOperation(source.pluginId, {
      op: 'move',
      sourceEntries: selected,
      destinationLocationId: dest.locationId!,
      destinationPluginId: dest.pluginId
    })
    state.refresh('left')
    state.refresh('right')
  }, [])

  const handleF7 = useCallback(() => {
    setMkdirName('')
    setMkdirDialog(true)
  }, [])

  const handleF7Submit = useCallback(async () => {
    if (!mkdirName.trim()) return
    const activePanel = useAppStore.getState().activePanel
    const state = usePanelStore.getState()
    const panel = state[activePanel]

    await window.api.plugins.executeOperation(panel.pluginId, {
      op: 'createDirectory',
      parentLocationId: panel.locationId!,
      name: mkdirName.trim()
    })
    setMkdirDialog(false)
    state.refresh(activePanel)
  }, [mkdirName])

  const handleF8 = useCallback(async () => {
    const activePanel = useAppStore.getState().activePanel
    const state = usePanelStore.getState()
    const source = state[activePanel]

    const selected = source.entries.filter((e) => source.selectedEntryIds.has(e.id))
    if (selected.length === 0) {
      const offset = source.parentId !== null ? 1 : 0
      const idx = source.cursorIndex - offset
      if (idx >= 0 && idx < source.entries.length) {
        selected.push(source.entries[idx])
      }
    }
    if (selected.length === 0) return

    if (!confirm(`Delete ${selected.length} item(s)?`)) return

    await window.api.plugins.executeOperation(source.pluginId, {
      op: 'delete',
      entries: selected
    })
    state.refresh('left')
    state.refresh('right')
  }, [])

  useKeyboard({
    onF5: handleF5,
    onF6: handleF6,
    onF7: handleF7,
    onF8: handleF8
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <DualPanel />
      <FunctionKeyBar onF5={handleF5} onF6={handleF6} onF7={handleF7} onF8={handleF8} />

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
    </div>
  )
}

export default App
