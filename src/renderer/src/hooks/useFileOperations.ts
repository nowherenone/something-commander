import { useCallback } from 'react'
import { useAppStore } from '../stores/app-store'
import { usePanelStore } from '../stores/panel-store'
import { useOperationsStore } from '../stores/operations-store'
import type { Entry } from '@shared/types'

export function useFileOperations() {
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

  const runCopyMove = useCallback(
    async (type: 'copy' | 'move') => {
      const { selected, tab, activePanel } = getSelectedEntries()
      if (selected.length === 0) return

      const otherPanel = activePanel === 'left' ? 'right' : 'left'
      const destTab = usePanelStore.getState().getActiveTab(otherPanel)
      if (!destTab.locationId) return

      const opId = useOperationsStore.getState().startOperation({
        type,
        sourceEntries: selected,
        sourcePluginId: tab.pluginId,
        destinationDisplay: destTab.locationDisplay,
        destinationLocationId: destTab.locationId,
        destinationPluginId: destTab.pluginId
      })

      // Execute one entry at a time for progress tracking
      const update = useOperationsStore.getState().updateOperation
      let processed = 0

      for (const entry of selected) {
        // Check if cancelled
        const currentOp = useOperationsStore
          .getState()
          .operations.find((o) => o.id === opId)
        if (currentOp?.status === 'cancelled') break

        update(opId, { currentFile: entry.name, processedFiles: processed })

        try {
          await window.api.plugins.executeOperation(tab.pluginId, {
            op: type,
            sourceEntries: [entry],
            destinationLocationId: destTab.locationId!,
            destinationPluginId: destTab.pluginId
          })
        } catch (err) {
          update(opId, { status: 'error', error: `${entry.name}: ${String(err)}` })
          break
        }
        processed++
      }

      // Final status
      const finalOp = useOperationsStore.getState().operations.find((o) => o.id === opId)
      if (finalOp?.status === 'running') {
        update(opId, { status: 'done', processedFiles: processed, currentFile: '' })
      }

      // Auto-dismiss after 3 seconds if done
      setTimeout(() => {
        const op = useOperationsStore.getState().operations.find((o) => o.id === opId)
        if (op && op.status !== 'running') {
          useOperationsStore.getState().removeOperation(opId)
        }
      }, 3000)

      usePanelStore.getState().refresh('left')
      usePanelStore.getState().refresh('right')
    },
    [getSelectedEntries]
  )

  const handleCopy = useCallback(() => runCopyMove('copy'), [runCopyMove])
  const handleMove = useCallback(() => runCopyMove('move'), [runCopyMove])

  const handleDelete = useCallback(async () => {
    const { selected, tab } = getSelectedEntries()
    if (selected.length === 0) return

    const opId = useOperationsStore.getState().startOperation({
      type: 'delete',
      sourceEntries: selected,
      sourcePluginId: tab.pluginId,
      destinationDisplay: 'Deleting...',
      destinationLocationId: '',
      destinationPluginId: tab.pluginId
    })

    const update = useOperationsStore.getState().updateOperation
    let processed = 0

    for (const entry of selected) {
      const currentOp = useOperationsStore.getState().operations.find((o) => o.id === opId)
      if (currentOp?.status === 'cancelled') break

      update(opId, { currentFile: entry.name, processedFiles: processed })

      try {
        await window.api.plugins.executeOperation(tab.pluginId, {
          op: 'delete',
          entries: [entry]
        })
      } catch (err) {
        update(opId, { status: 'error', error: `${entry.name}: ${String(err)}` })
        break
      }
      processed++
    }

    const finalOp = useOperationsStore.getState().operations.find((o) => o.id === opId)
    if (finalOp?.status === 'running') {
      update(opId, { status: 'done', processedFiles: processed, currentFile: '' })
    }

    setTimeout(() => {
      const op = useOperationsStore.getState().operations.find((o) => o.id === opId)
      if (op && op.status !== 'running') {
        useOperationsStore.getState().removeOperation(opId)
      }
    }, 3000)

    usePanelStore.getState().refresh('left')
    usePanelStore.getState().refresh('right')
  }, [getSelectedEntries])

  return { handleCopy, handleMove, handleDelete, getSelectedEntries }
}
