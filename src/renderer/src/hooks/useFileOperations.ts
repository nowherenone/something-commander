import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '../stores/app-store'
import { usePanelStore, parentOffset } from '../stores/panel-store'
import { useOperationsStore, type OverwritePolicy, type FileItem } from '../stores/operations-store'
import type { Entry } from '@shared/types'

export interface PendingOperation {
  type: 'copy' | 'move' | 'delete' | 'pack' | 'unpack'
  entries: Entry[]
  sourceDir: string
  sourcePluginId: string
  destDir: string
  destPluginId: string
}

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

  // For delete: skip enumeration, delete entries directly (fs.rm handles recursion)
  if (op.type === 'delete') {
    store().updateOperation(opId, {
      status: 'running',
      totalFiles: op.sourceEntries.length,
      totalBytes: 0,
      startTime: Date.now(),
      currentFile: '',
      processedFiles: 0,
      processedBytes: 0
    })

    for (let i = 0; i < op.sourceEntries.length; i++) {
      if (isCancelled(opId)) break
      const entry = op.sourceEntries[i]
      store().updateOperation(opId, { currentFile: entry.name, processedFiles: i })
      try {
        const result = await window.api.plugins.executeOperation(op.sourcePluginId, {
          op: 'delete',
          entries: [entry]
        })
        if (!result.success) {
          store().updateOperation(opId, { status: 'error', error: `${entry.name}: ${result.errors?.[0]?.message || 'Delete failed'}` })
          return
        }
      } catch (err) {
        store().updateOperation(opId, { status: 'error', error: `${entry.name}: ${String(err)}` })
        return
      }
    }

    await usePanelStore.getState().refresh('left')
    await usePanelStore.getState().refresh('right')
    store().removeOperation(opId)
    return
  }

  // Phase 1: Enumerate files (copy/move only)
  store().updateOperation(opId, { status: 'enumerating', currentFile: 'Scanning files...' })

  let fileList: FileItem[] = []

  {
    const sourcePaths = op.sourceEntries.map((e) => e.id)
    fileList = await window.api.util.enumerateFiles(op.sourcePluginId, sourcePaths, op.destinationLocationId)
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
      {
        // copy or move
        if (item.isDirectory) {
          // Archives create directories implicitly when files are written into them
          if (!item.destPath.includes('::')) {
            const dirName = item.destPath.split(/[\\/]/).pop() || ''
            const parentDir = item.destPath.replace(/[\\/][^\\/]+$/, '') || item.destPath
            await window.api.plugins.executeOperation(op.destinationPluginId, {
              op: 'createDirectory',
              parentLocationId: parentDir,
              name: dirName
            })
          }
        } else {
          // Check for overwrite (only meaningful for local filesystem destinations)
          const exists = !item.destPath.includes('::') && await window.api.util.checkExists(item.destPath)
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

          // Stream copy through plugin system — works across any plugin combination
          let lastProgressUpdate = 0
          const unsubProgress = window.api.util.onCopyFileProgress((bytesCopied) => {
            const now = Date.now()
            if (now - lastProgressUpdate >= 250) {
              store().updateOperation(opId, { currentFileCopied: bytesCopied })
              lastProgressUpdate = now
            }
          })

          // Archive paths use :: as separator and / for internal paths — handle separately
          let destDir: string
          let destFileName: string
          if (item.destPath.includes('::')) {
            const sepIdx = item.destPath.indexOf('::')
            const archivePart = item.destPath.slice(0, sepIdx)
            // Normalize: local fs uses backslashes on Windows, ZIP requires forward slashes
            const internalPart = item.destPath.slice(sepIdx + 2).replace(/\\/g, '/').replace(/^\//, '')
            const lastSlash = internalPart.lastIndexOf('/')
            if (lastSlash >= 0) {
              destDir = archivePart + '::' + internalPart.slice(0, lastSlash)
              destFileName = internalPart.slice(lastSlash + 1)
            } else {
              destDir = archivePart + '::'
              destFileName = internalPart || item.relativePath
            }
          } else {
            destDir = item.destPath.replace(/[\\/][^\\/]+$/, '') || item.destPath
            destFileName = item.destPath.split(/[\\/]/).pop() || item.relativePath
          }

          const result = await window.api.util.streamCopyFile(
            op.sourcePluginId,
            item.sourcePath,
            op.destinationPluginId,
            destDir,
            destFileName
          )
          unsubProgress()

          if (!result.success) {
            store().updateOperation(opId, { status: 'error', error: `${item.relativePath}: ${result.error}` })
            return
          }

          // For move, delete source after copy
          if (op.type === 'move') {
            // Source plugin deletes its own entry
            const srcPlugin = op.sourcePluginId
            await window.api.plugins.executeOperation(srcPlugin, {
              op: 'delete',
              entries: [{
                id: item.sourcePath,
                name: destFileName,
                isContainer: false,
                size: item.size,
                modifiedAt: 0,
                mimeType: '',
                iconHint: 'file',
                meta: {},
                attributes: { readonly: false, hidden: false, symlink: false }
              }]
            })
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
        await window.api.plugins.executeOperation(op.sourcePluginId, {
          op: 'delete',
          entries: [{
            id: dir.sourcePath,
            name: dir.relativePath,
            isContainer: true,
            size: 0,
            modifiedAt: 0,
            mimeType: '',
            iconHint: 'folder',
            meta: {},
            attributes: { readonly: false, hidden: false, symlink: false }
          }]
        })
      } catch {
        // Ignore errors deleting source dirs
      }
    }
  }

  // Refresh panels first, then dismiss the operation
  await usePanelStore.getState().refresh('left')
  await usePanelStore.getState().refresh('right')

  const finalOp = store().operations.find((o) => o.id === opId)
  if (finalOp?.status === 'running') {
    store().removeOperation(opId)
  }
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

  const [pendingOp, setPendingOp] = useState<PendingOperation | null>(null)

  const handleCopy = useCallback(() => {
    const { selected, tab, activePanel } = getSelectedEntries()
    if (selected.length === 0) return
    const otherPanel = activePanel === 'left' ? 'right' : 'left'
    const destTab = usePanelStore.getState().getActiveTab(otherPanel)
    if (!destTab.locationId) return

    setPendingOp({
      type: 'copy',
      entries: selected,
      sourceDir: tab.locationDisplay,
      sourcePluginId: tab.pluginId,
      destDir: destTab.locationId,
      destPluginId: destTab.pluginId
    })
  }, [getSelectedEntries])

  const handleMove = useCallback(() => {
    const { selected, tab, activePanel } = getSelectedEntries()
    if (selected.length === 0) return
    const otherPanel = activePanel === 'left' ? 'right' : 'left'
    const destTab = usePanelStore.getState().getActiveTab(otherPanel)
    if (!destTab.locationId) return

    setPendingOp({
      type: 'move',
      entries: selected,
      sourceDir: tab.locationDisplay,
      sourcePluginId: tab.pluginId,
      destDir: destTab.locationId,
      destPluginId: destTab.pluginId
    })
  }, [getSelectedEntries])

  const handleDelete = useCallback(() => {
    const { selected, tab } = getSelectedEntries()
    if (selected.length === 0) return

    setPendingOp({
      type: 'delete',
      entries: selected,
      sourceDir: tab.locationDisplay,
      sourcePluginId: tab.pluginId,
      destDir: '',
      destPluginId: tab.pluginId
    })
  }, [getSelectedEntries])

  const confirmOperation = useCallback((destDir: string) => {
    if (!pendingOp) return
    setPendingOp(null)

    if (pendingOp.type === 'pack') {
      // destDir is the full archive path (e.g. D:\dest\archive.zip)
      useOperationsStore.getState().enqueue({
        type: 'copy',
        sourceEntries: pendingOp.entries,
        sourcePluginId: pendingOp.sourcePluginId,
        destinationDisplay: destDir,
        destinationLocationId: destDir + '::',
        destinationPluginId: 'archive'
      })
    } else if (pendingOp.type === 'unpack') {
      // Transform archive file entries to archive-root entries (archivePath::)
      const archiveRootEntries = pendingOp.entries.map((e) => ({ ...e, id: e.id + '::' }))
      useOperationsStore.getState().enqueue({
        type: 'copy',
        sourceEntries: archiveRootEntries,
        sourcePluginId: 'archive',
        destinationDisplay: destDir,
        destinationLocationId: destDir,
        destinationPluginId: pendingOp.destPluginId
      })
    } else {
      useOperationsStore.getState().enqueue({
        type: pendingOp.type,
        sourceEntries: pendingOp.entries,
        sourcePluginId: pendingOp.sourcePluginId,
        destinationDisplay: destDir,
        destinationLocationId: destDir,
        destinationPluginId: pendingOp.destPluginId
      })
    }
  }, [pendingOp])

  const cancelOperation = useCallback(() => {
    setPendingOp(null)
  }, [])

  const handlePack = useCallback(() => {
    const { selected, tab, activePanel } = getSelectedEntries()
    if (selected.length === 0) return
    const otherPanel = activePanel === 'left' ? 'right' : 'left'
    const destTab = usePanelStore.getState().getActiveTab(otherPanel)
    if (!destTab.locationId) return

    // Default archive name: single selection uses its base name, multiple → 'archive'
    const baseName = selected.length === 1
      ? selected[0].name.replace(/\.[^.]+$/, '')
      : 'archive'
    const loc = destTab.locationId.replace(/[/\\]$/, '')
    const sep = loc.includes('/') && !loc.includes('\\') ? '/' : '\\'
    const defaultArchivePath = loc + sep + baseName + '.zip'

    setPendingOp({
      type: 'pack',
      entries: selected,
      sourceDir: tab.locationDisplay,
      sourcePluginId: tab.pluginId,
      destDir: defaultArchivePath,
      destPluginId: destTab.pluginId
    })
  }, [getSelectedEntries])

  const handleUnpack = useCallback(async () => {
    const { selected, tab, activePanel } = getSelectedEntries()
    const candidates = selected.filter((e) => !e.isContainer)
    if (candidates.length === 0) return
    const checks = await Promise.all(candidates.map((e) => window.api.util.isArchive(e.id).then((is) => ({ e, is }))))
    const archives = checks.filter((x) => x.is).map((x) => x.e)
    if (archives.length === 0) return
    const otherPanel = activePanel === 'left' ? 'right' : 'left'
    const destTab = usePanelStore.getState().getActiveTab(otherPanel)
    if (!destTab.locationId) return

    setPendingOp({
      type: 'unpack',
      entries: archives,
      sourceDir: tab.locationDisplay,
      sourcePluginId: tab.pluginId,
      destDir: destTab.locationId,
      destPluginId: destTab.pluginId
    })
  }, [getSelectedEntries])

  return { handleCopy, handleMove, handleDelete, handlePack, handleUnpack, pendingOp, confirmOperation, cancelOperation, getSelectedEntries }
}
