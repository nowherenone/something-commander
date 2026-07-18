import { useCallback, useEffect, useState } from 'react'
import { useAppStore } from '../stores/app-store'
import { usePanelStore, parentOffset } from '../stores/panel-store'
import { useOperationsStore } from '../stores/operations-store'
import {
  defaultCopyMoveDestPath,
  getBaseName,
  parseCopyMoveDestInput,
  wouldCopyIntoSelf
} from '../utils/entry-helpers'
import { startOperationQueue, resolveOverwriteAction } from '../services/file-operation-service'
import { showToast } from '../components/layout/Toast'
import type { Entry } from '@shared/types'

export interface PendingOperation {
  type: 'copy' | 'move' | 'delete' | 'pack' | 'unpack'
  entries: Entry[]
  sourceDir: string
  sourcePluginId: string
  destDir: string
  destPluginId: string
}

// Re-exported so the overwrite prompt UI (OperationDialog) keeps its import.
export { resolveOverwriteAction }

/**
 * Orchestrates the pending confirmation dialog (copy/move/delete/pack/unpack)
 * and starts the background operation queue once per renderer session. The
 * heavy lifting lives in `services/file-operation-service`.
 */
export function useFileOperations() {
  // Kick off the operation queue subscription on mount. It runs for the
  // lifetime of the renderer regardless of how many components call this hook.
  useEffect(() => startOperationQueue(), [])

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

  const queueTwoPanelOp = useCallback(
    (type: 'copy' | 'move') => {
      const { selected, tab, activePanel } = getSelectedEntries()
      if (selected.length === 0) {
        showToast('Nothing selected')
        return
      }
      const otherPanel = activePanel === 'left' ? 'right' : 'left'
      const destTab = usePanelStore.getState().getActiveTab(otherPanel)
      if (!destTab.locationId) {
        showToast('Select a destination folder')
        return
      }

      // Preflight: only block when a *selected folder* would be copied into
      // itself or a descendant. Dest under the source listing path is fine
      // (e.g. files from /work → /work/out). Same-folder file copy is allowed.
      if (wouldCopyIntoSelf(selected, destTab.locationId)) {
        showToast('Cannot copy into self or subfolder')
        return
      }

      // Single file → confirm field is full path (dir + name) so rename-on-copy works.
      const destDir = defaultCopyMoveDestPath(destTab.locationId, selected)

      setPendingOp({
        type,
        entries: selected,
        sourceDir: tab.locationDisplay,
        sourcePluginId: tab.pluginId,
        destDir,
        destPluginId: destTab.pluginId
      })
    },
    [getSelectedEntries]
  )

  const handleCopy = useCallback(() => queueTwoPanelOp('copy'), [queueTwoPanelOp])
  const handleMove = useCallback(() => queueTwoPanelOp('move'), [queueTwoPanelOp])

  const handleDelete = useCallback(() => {
    const { selected, tab } = getSelectedEntries()
    if (selected.length === 0) {
      showToast('Nothing selected')
      return
    }

    setPendingOp({
      type: 'delete',
      entries: selected,
      sourceDir: tab.locationDisplay,
      sourcePluginId: tab.pluginId,
      destDir: '',
      destPluginId: tab.pluginId
    })
  }, [getSelectedEntries])

  const confirmOperation = useCallback((destInput: string) => {
    if (!pendingOp) return
    setPendingOp(null)

    if (pendingOp.type === 'pack') {
      // destInput is the full archive path (e.g. D:\dest\archive.zip)
      useOperationsStore.getState().enqueue({
        type: 'copy',
        sourceEntries: pendingOp.entries,
        sourcePluginId: pendingOp.sourcePluginId,
        destinationDisplay: destInput,
        destinationLocationId: destInput + '::',
        destinationPluginId: 'archive'
      })
    } else if (pendingOp.type === 'unpack') {
      // Transform archive file entries to archive-root entries (archivePath::)
      const archiveRootEntries = pendingOp.entries.map((e) => ({ ...e, id: e.id + '::' }))
      useOperationsStore.getState().enqueue({
        type: 'copy',
        sourceEntries: archiveRootEntries,
        sourcePluginId: 'archive',
        destinationDisplay: destInput,
        destinationLocationId: destInput,
        destinationPluginId: pendingOp.destPluginId
      })
    } else {
      // copy / move — single file may include a renamed destination file name
      const isSingleFile =
        pendingOp.entries.length === 1 && !pendingOp.entries[0].isContainer
      const parsed = parseCopyMoveDestInput(destInput, {
        isSingleFile,
        originalFileName: isSingleFile ? pendingOp.entries[0].name : ''
      })
      if (!parsed.destDir) {
        showToast('Destination path is empty')
        return
      }
      if (wouldCopyIntoSelf(pendingOp.entries, parsed.destDir)) {
        showToast('Cannot copy into self or subfolder')
        return
      }
      const display =
        isSingleFile && parsed.destFileName
          ? `${parsed.destDir}${parsed.destDir.includes('\\') ? '\\' : '/'}${parsed.destFileName}`
          : parsed.destDir
      useOperationsStore.getState().enqueue({
        type: pendingOp.type,
        sourceEntries: pendingOp.entries,
        sourcePluginId: pendingOp.sourcePluginId,
        destinationDisplay: display,
        destinationLocationId: parsed.destDir,
        destinationPluginId: pendingOp.destPluginId,
        destinationFileName: isSingleFile ? parsed.destFileName : undefined
      })
    }
  }, [pendingOp])

  const cancelOperation = useCallback(() => setPendingOp(null), [])

  const handlePack = useCallback(() => {
    const { selected, tab, activePanel } = getSelectedEntries()
    if (selected.length === 0) {
      showToast('Nothing selected')
      return
    }
    const otherPanel = activePanel === 'left' ? 'right' : 'left'
    const destTab = usePanelStore.getState().getActiveTab(otherPanel)
    if (!destTab.locationId) {
      showToast('Select a destination folder')
      return
    }

    const baseName = selected.length === 1 ? getBaseName(selected[0].name) : 'archive'
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
    if (candidates.length === 0) {
      showToast('Nothing selected')
      return
    }
    const checks = await Promise.all(
      candidates.map((e) => window.api.util.isArchive(e.id).then((is) => ({ e, is })))
    )
    const archives = checks.filter((x) => x.is).map((x) => x.e)
    if (archives.length === 0) {
      showToast('No archives selected')
      return
    }
    const otherPanel = activePanel === 'left' ? 'right' : 'left'
    const destTab = usePanelStore.getState().getActiveTab(otherPanel)
    if (!destTab.locationId) {
      showToast('Select a destination folder')
      return
    }

    setPendingOp({
      type: 'unpack',
      entries: archives,
      sourceDir: tab.locationDisplay,
      sourcePluginId: tab.pluginId,
      destDir: destTab.locationId,
      destPluginId: destTab.pluginId
    })
  }, [getSelectedEntries])

  return {
    handleCopy,
    handleMove,
    handleDelete,
    handlePack,
    handleUnpack,
    pendingOp,
    confirmOperation,
    cancelOperation,
    getSelectedEntries
  }
}
