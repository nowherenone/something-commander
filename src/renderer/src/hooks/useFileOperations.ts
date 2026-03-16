import { useCallback, useEffect, useRef } from 'react'
import { useAppStore } from '../stores/app-store'
import { usePanelStore, parentOffset } from '../stores/panel-store'
import { useOperationsStore, type OverwritePolicy, type FileItem } from '../stores/operations-store'
import type { Entry } from '@shared/types'

// Overwrite resolution via promise
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

function isCancelled(opId: string): boolean {
  const op = useOperationsStore.getState().operations.find((o) => o.id === opId)
  return !op || op.status === 'cancelled'
}

async function executeOperation(opId: string): Promise<void> {
  const store = useOperationsStore.getState
  const op = store().operations.find((o) => o.id === opId)
  if (!op) return

  // Check if source is an archive plugin
  const isArchiveSource = op.sourcePluginId === 'archive'

  // For archive sources, use extraction instead of file-by-file copy
  if (isArchiveSource && op.type !== 'delete') {
    store().updateOperation(opId, { status: 'running', currentFile: 'Extracting...' })

    for (const entry of op.sourceEntries) {
      if (isCancelled(opId)) break
      // entry.id format: "D:\file.zip::internal/path"
      const [archivePath, internalPath] = entry.id.includes('::')
        ? [entry.id.split('::')[0], entry.id.split('::')[1]]
        : [entry.id, '']

      store().updateOperation(opId, { currentFile: entry.name })

      const result = await window.api.util.extractFromArchive(
        archivePath,
        internalPath,
        op.destinationLocationId
      )

      if (!result.success) {
        store().updateOperation(opId, { status: 'error', error: `${entry.name}: ${result.error}` })
        return
      }
    }

    const finalOp = store().operations.find((o) => o.id === opId)
    if (finalOp?.status === 'running') {
      store().removeOperation(opId)
    }
    usePanelStore.getState().refresh('left')
    usePanelStore.getState().refresh('right')
    return
  }

  // Phase 1: Enumerate files
  store().updateOperation(opId, { status: 'enumerating', currentFile: 'Scanning files...' })

  let fileList: FileItem[] = []

  if (op.type === 'delete') {
    const sourcePaths = op.sourceEntries.map((e) => e.id)
    fileList = await window.api.util.enumerateFiles(sourcePaths, '')
    fileList = fileList.reverse()
  } else {
    const sourcePaths = op.sourceEntries.map((e) => e.id)
    fileList = await window.api.util.enumerateFiles(sourcePaths, op.destinationLocationId)
  }

  if (isCancelled(opId)) return

  const totalFiles = fileList.filter((f) => !f.isDirectory).length
  const totalBytes = fileList.reduce((sum, f) => sum + f.size, 0)

  store().updateOperation(opId, {
    status: 'running',
    fileList,
    totalFiles,
    totalBytes,
    startTime: Date.now(),
    currentFile: '',
    processedFiles: 0,
    processedBytes: 0
  })

  // Phase 2: Process files one by one
  let processedFiles = 0
  let processedBytes = 0

  for (let i = 0; i < fileList.length; i++) {
    if (isCancelled(opId)) break

    const item = fileList[i]

    store().updateOperation(opId, {
      currentFile: item.relativePath,
      currentFileIndex: i,
      currentFileSize: item.size,
      currentFileCopied: 0
    })

    try {
      if (op.type === 'delete') {
        const result = await window.api.util.deleteSingle(item.sourcePath)
        if (!result.success) {
          store().updateOperation(opId, { status: 'error', error: `${item.relativePath}: ${result.error}` })
          return
        }
      } else {
        // copy or move
        if (item.isDirectory) {
          // Create directory at destination (mkdir is idempotent)
          // The copySingleFile with isDirectory=true handles this
          // But for move, we just need mkdir at dest
          await window.api.util.copySingleFile(item.sourcePath, item.destPath, true)
        } else {
          // Check for overwrite
          const exists = await window.api.util.checkExists(item.destPath)
          if (exists) {
            const policy: OverwritePolicy = store().operations.find((o) => o.id === opId)?.overwritePolicy || 'ask'

            if (policy === 'skip-all') {
              processedBytes += item.size
              store().updateOperation(opId, { processedBytes })
              continue
            }

            if (policy === 'ask') {
              const destInfo = await window.api.util.getFileInfo(item.destPath)
              store().updateOperation(opId, {
                overwritePrompt: {
                  sourcePath: item.sourcePath,
                  sourceName: item.relativePath,
                  sourceSize: item.size,
                  sourceDate: 0, // TODO: pass from enumerate
                  destPath: item.destPath,
                  destSize: destInfo?.size || 0,
                  destDate: destInfo?.modifiedAt || 0
                }
              })
              const decision = await waitForOverwriteDecision()
              if (isCancelled(opId)) break
              if (decision === 'skip') {
                processedBytes += item.size
                store().updateOperation(opId, { processedBytes })
                continue
              }
            }
          }

          // Subscribe to per-byte progress for this file (throttled to 4x/sec)
          let lastProgressUpdate = 0
          const unsubProgress = window.api.util.onCopyFileProgress((bytesCopied) => {
            const now = Date.now()
            if (now - lastProgressUpdate >= 250) {
              store().updateOperation(opId, { currentFileCopied: bytesCopied })
              lastProgressUpdate = now
            }
          })

          const ipcFn = op.type === 'copy'
            ? window.api.util.copySingleFile
            : window.api.util.moveSingleFile

          const result = await ipcFn(item.sourcePath, item.destPath, false)
          unsubProgress()

          if (!result.success) {
            store().updateOperation(opId, { status: 'error', error: `${item.relativePath}: ${result.error}` })
            return
          }
        }
      }
    } catch (err) {
      store().updateOperation(opId, { status: 'error', error: `${item.relativePath}: ${String(err)}` })
      return
    }

    if (!item.isDirectory) {
      processedFiles++
      processedBytes += item.size
    }
    store().updateOperation(opId, { processedFiles, processedBytes })
  }

  // For move, delete source directories after all files are moved
  if (op.type === 'move' && !isCancelled(opId)) {
    const dirs = fileList.filter((f) => f.isDirectory).reverse()
    for (const dir of dirs) {
      if (isCancelled(opId)) break
      try {
        await window.api.util.deleteSingle(dir.sourcePath)
      } catch {
        // Ignore errors deleting source dirs (might not be empty if cancelled)
      }
    }
  }

  const finalOp = store().operations.find((o) => o.id === opId)
  if (finalOp?.status === 'running') {
    store().updateOperation(opId, { status: 'done', currentFile: '' })
    // Auto-dismiss successful operations
    store().removeOperation(opId)
  }

  usePanelStore.getState().refresh('left')
  usePanelStore.getState().refresh('right')
}

export function useFileOperations() {
  const isProcessing = useRef(false)

  // Queue processor — picks up queued ops and runs them sequentially
  useEffect(() => {
    const interval = setInterval(() => {
      if (isProcessing.current) return
      const store = useOperationsStore.getState()
      // Don't start another if one is already running or enumerating
      const active = store.operations.find((op) => op.status === 'running' || op.status === 'enumerating')
      if (active) return

      const next = store.operations.find((op) => op.status === 'queued')
      if (next) {
        isProcessing.current = true
        executeOperation(next.id).finally(() => {
          isProcessing.current = false
        })
      }
    }, 100)
    return () => clearInterval(interval)
  }, [])

  const getSelectedEntries = useCallback(() => {
    const activePanel = useAppStore.getState().activePanel
    const tab = usePanelStore.getState().getActiveTab(activePanel)
    let selected = tab.entries.filter((e) => tab.selectedEntryIds.has(e.id))
    if (selected.length === 0) {
      const offset = parentOffset(tab)
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
