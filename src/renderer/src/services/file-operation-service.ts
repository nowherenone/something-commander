import { useOperationsStore, type OverwritePolicy, type FileItem } from '../stores/operations-store'
import { usePanelStore } from '../stores/panel-store'
import { isArchivePath, toArchivePathForInternalFile } from '../utils/archive-path'
import { splitPathTail } from '../utils/entry-helpers'

/**
 * Runs file operations end-to-end (enumerate → copy/move/delete per file →
 * refresh panels). Lives as a plain module so the React hook stays small and
 * testing doesn't need a component tree.
 */

// Shared promise used by the "ask"-policy overwrite prompt. The dialog
// surfaces the decision; the executor blocks here until the user picks.
let overwriteResolve: ((action: 'overwrite' | 'skip') => void) | null = null

export function resolveOverwriteAction(
  action: 'overwrite' | 'skip' | 'overwrite-all' | 'skip-all'
): void {
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

async function executeDelete(opId: string, op: ReturnType<typeof useOperationsStore.getState>['operations'][number]): Promise<void> {
  const store = () => useOperationsStore.getState()
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
        store().updateOperation(opId, {
          status: 'error',
          error: `${entry.name}: ${result.errors?.[0]?.message || 'Delete failed'}`
        })
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
}

function splitDestPathForCopy(destPath: string, relativePath: string): {
  destDir: string
  destFileName: string
} {
  if (isArchivePath(destPath)) {
    const parts = toArchivePathForInternalFile(destPath)
    return {
      destDir: parts.destDir,
      destFileName: parts.destFileName || relativePath
    }
  }
  const { parent, name } = splitPathTail(destPath)
  return { destDir: parent || destPath, destFileName: name || relativePath }
}

async function executeCopyOrMove(opId: string, op: ReturnType<typeof useOperationsStore.getState>['operations'][number]): Promise<void> {
  const store = () => useOperationsStore.getState()
  store().updateOperation(opId, { status: 'enumerating', currentFile: 'Scanning files...' })

  const sourcePaths = op.sourceEntries.map((e) => e.id)
  const fileList: FileItem[] = await window.api.util.enumerateFiles(
    op.sourcePluginId,
    sourcePaths,
    op.destinationLocationId
  )
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
      if (item.isDirectory) {
        // Archives create directories implicitly when files are written into them.
        if (!isArchivePath(item.destPath)) {
          const { parent, name } = splitPathTail(item.destPath)
          await window.api.plugins.executeOperation(op.destinationPluginId, {
            op: 'createDirectory',
            parentLocationId: parent || item.destPath,
            name
          })
        }
      } else {
        // Overwrite check (only meaningful for local-filesystem destinations).
        const exists = !isArchivePath(item.destPath) && (await window.api.util.checkExists(item.destPath))
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
                sourceDate: 0,
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

        // Stream copy through the plugin system — works across any plugin combination.
        let lastProgressUpdate = 0
        const unsubProgress = window.api.util.onCopyFileProgress((bytesCopied) => {
          const now = Date.now()
          if (now - lastProgressUpdate >= 250) {
            store().updateOperation(opId, { currentFileCopied: bytesCopied })
            lastProgressUpdate = now
          }
        })

        const { destDir, destFileName } = splitDestPathForCopy(item.destPath, item.relativePath)

        const result = await window.api.util.streamCopyFile(
          op.sourcePluginId,
          item.sourcePath,
          op.destinationPluginId,
          destDir,
          destFileName
        )
        unsubProgress()

        if (!result.success) {
          store().updateOperation(opId, {
            status: 'error',
            error: `${item.relativePath}: ${result.error}`
          })
          return
        }

        if (op.type === 'move') {
          // Source plugin deletes its own entry.
          await window.api.plugins.executeOperation(op.sourcePluginId, {
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

  // For move, delete source directories after all files are moved.
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
      } catch { /* ignore errors deleting source dirs */ }
    }
  }

  await usePanelStore.getState().refresh('left')
  await usePanelStore.getState().refresh('right')

  const finalOp = store().operations.find((o) => o.id === opId)
  if (finalOp?.status === 'running') store().removeOperation(opId)
}

export async function executeOperation(opId: string): Promise<void> {
  const op = useOperationsStore.getState().operations.find((o) => o.id === opId)
  if (!op) return

  if (op.type === 'delete') {
    await executeDelete(opId, op)
  } else {
    await executeCopyOrMove(opId, op)
  }
}

/**
 * Subscribe the executor to the operations store: whenever a queued op appears
 * and nothing is currently running/enumerating, start it. Returns an unsubscribe.
 */
export function startOperationQueue(): () => void {
  let running = false

  const tryStart = (): void => {
    if (running) return
    const store = useOperationsStore.getState()
    if (store.operations.some((o) => o.status === 'running' || o.status === 'enumerating')) return
    const next = store.operations.find((o) => o.status === 'queued')
    if (!next) return
    running = true
    executeOperation(next.id).finally(() => {
      running = false
      // After finishing, another queued op may have appeared — check again.
      tryStart()
    })
  }

  const unsubscribe = useOperationsStore.subscribe(() => tryStart())
  // Run once in case ops are already queued when we subscribe.
  tryStart()
  return unsubscribe
}
