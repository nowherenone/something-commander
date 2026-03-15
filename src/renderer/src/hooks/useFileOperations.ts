import { useCallback, useEffect, useRef } from 'react'
import { useAppStore } from '../stores/app-store'
import { usePanelStore } from '../stores/panel-store'
import { useOperationsStore, type OverwritePolicy } from '../stores/operations-store'
import type { Entry } from '@shared/types'
import { formatSize } from '../utils/format'

// Shared state for overwrite resolution
let overwriteResolve: ((action: 'overwrite' | 'skip') => void) | null = null

export function resolveOverwriteAction(action: 'overwrite' | 'skip' | 'overwrite-all' | 'skip-all'): void {
  const store = useOperationsStore.getState()
  const current = store.operations.find((op) => op.status === 'running')
  if (!current) return

  if (action === 'overwrite-all') {
    store.updateOperation(current.id, { overwritePolicy: 'overwrite-all', overwritePrompt: null })
    overwriteResolve?.('overwrite')
  } else if (action === 'skip-all') {
    store.updateOperation(current.id, { overwritePolicy: 'skip-all', overwritePrompt: null })
    overwriteResolve?.('skip')
  } else {
    store.updateOperation(current.id, { overwritePrompt: null })
    overwriteResolve?.(action)
  }
  overwriteResolve = null
}

function waitForOverwriteDecision(): Promise<'overwrite' | 'skip'> {
  return new Promise((resolve) => {
    overwriteResolve = resolve
  })
}

async function executeOperation(opId: string): Promise<void> {
  const store = useOperationsStore.getState
  const op = store().operations.find((o) => o.id === opId)
  if (!op) return

  store().updateOperation(opId, { status: 'running' })

  const entries = op.sourceEntries
  let processed = 0
  let processedBytes = 0

  for (const entry of entries) {
    const currentOp = store().operations.find((o) => o.id === opId)
    if (!currentOp || currentOp.status === 'cancelled') break

    store().updateOperation(opId, {
      currentFile: entry.name,
      processedFiles: processed
    })

    try {
      if (op.type === 'delete') {
        const result = await window.api.util.deleteSingle(entry.id)
        if (!result.success) {
          store().updateOperation(opId, { status: 'error', error: `${entry.name}: ${result.error}` })
          return
        }
      } else {
        // copy or move
        const destPath = op.destinationLocationId + '\\' + entry.name
        // Use forward slash or backslash depending on what the paths use
        const sep = op.destinationLocationId.includes('/') ? '/' : '\\'
        const destPathNorm = op.destinationLocationId + sep + entry.name

        // Check if destination exists
        const exists = await window.api.util.checkExists(destPathNorm)
        if (exists) {
          const policy: OverwritePolicy = store().operations.find((o) => o.id === opId)?.overwritePolicy || 'ask'

          if (policy === 'skip-all') {
            processed++
            if (entry.size > 0) processedBytes += entry.size
            store().updateOperation(opId, { processedBytes })
            continue
          }

          if (policy === 'ask') {
            // Show overwrite prompt
            const destInfo = await window.api.util.getFileInfo(destPathNorm)
            store().updateOperation(opId, {
              overwritePrompt: {
                sourcePath: entry.id,
                sourceName: entry.name,
                sourceSize: entry.size,
                sourceDate: entry.modifiedAt,
                destPath: destPathNorm,
                destSize: destInfo?.size || 0,
                destDate: destInfo?.modifiedAt || 0
              }
            })

            const decision = await waitForOverwriteDecision()
            if (decision === 'skip') {
              processed++
              if (entry.size > 0) processedBytes += entry.size
              store().updateOperation(opId, { processedBytes })
              continue
            }
          }
          // policy === 'overwrite-all' or user chose 'overwrite' — fall through to copy/move
        }

        const ipcFn = op.type === 'copy'
          ? window.api.util.copySingleFile
          : window.api.util.moveSingleFile
        const result = await ipcFn(entry.id, destPathNorm, entry.isContainer)
        if (!result.success) {
          store().updateOperation(opId, { status: 'error', error: `${entry.name}: ${result.error}` })
          return
        }
      }
    } catch (err) {
      store().updateOperation(opId, { status: 'error', error: `${entry.name}: ${String(err)}` })
      return
    }

    processed++
    if (entry.size > 0) processedBytes += entry.size
    store().updateOperation(opId, { processedFiles: processed, processedBytes })
  }

  const finalOp = store().operations.find((o) => o.id === opId)
  if (finalOp?.status === 'running') {
    store().updateOperation(opId, { status: 'done', currentFile: '' })
  }

  usePanelStore.getState().refresh('left')
  usePanelStore.getState().refresh('right')
}

export function useFileOperations() {
  const isProcessing = useRef(false)

  // Queue processor — picks up queued operations and runs them
  useEffect(() => {
    const interval = setInterval(() => {
      if (isProcessing.current) return
      const store = useOperationsStore.getState()
      const queued = store.operations.find((op) => op.status === 'queued')
      const running = store.operations.find((op) => op.status === 'running')
      if (queued && !running) {
        isProcessing.current = true
        executeOperation(queued.id).finally(() => {
          isProcessing.current = false
        })
      }
    }, 200)
    return () => clearInterval(interval)
  }, [])

  const getSelectedEntries = useCallback(() => {
    const activePanel = useAppStore.getState().activePanel
    const tab = usePanelStore.getState().getActiveTab(activePanel)
    let selected = tab.entries.filter((e) => tab.selectedEntryIds.has(e.id))
    if (selected.length === 0) {
      const offset = tab.parentId !== null ? 1 : 0
      const idx = tab.cursorIndex - offset
      if (idx >= 0 && idx < tab.entries.length) {
        selected = [tab.entries[idx]]
      }
    }
    return { selected, tab, activePanel }
  }, [])

  const handleCopy = useCallback(() => {
    const { selected, tab, activePanel } = getSelectedEntries()
    if (selected.length === 0) return
    const otherPanel = activePanel === 'left' ? 'right' : 'left'
    const destTab = usePanelStore.getState().getActiveTab(otherPanel)
    if (!destTab.locationId) return

    useOperationsStore.getState().enqueue({
      type: 'copy',
      sourceEntries: selected,
      sourcePluginId: tab.pluginId,
      destinationDisplay: destTab.locationDisplay,
      destinationLocationId: destTab.locationId,
      destinationPluginId: destTab.pluginId
    })
  }, [getSelectedEntries])

  const handleMove = useCallback(() => {
    const { selected, tab, activePanel } = getSelectedEntries()
    if (selected.length === 0) return
    const otherPanel = activePanel === 'left' ? 'right' : 'left'
    const destTab = usePanelStore.getState().getActiveTab(otherPanel)
    if (!destTab.locationId) return

    useOperationsStore.getState().enqueue({
      type: 'move',
      sourceEntries: selected,
      sourcePluginId: tab.pluginId,
      destinationDisplay: destTab.locationDisplay,
      destinationLocationId: destTab.locationId,
      destinationPluginId: destTab.pluginId
    })
  }, [getSelectedEntries])

  const handleDelete = useCallback(() => {
    const { selected, tab } = getSelectedEntries()
    if (selected.length === 0) return

    useOperationsStore.getState().enqueue({
      type: 'delete',
      sourceEntries: selected,
      sourcePluginId: tab.pluginId,
      destinationDisplay: 'Trash',
      destinationLocationId: '',
      destinationPluginId: tab.pluginId
    })
  }, [getSelectedEntries])

  return { handleCopy, handleMove, handleDelete, getSelectedEntries }
}
