import {
  useOperationsStore,
  type OverwritePolicy,
  type FileItem,
  type FileOperation
} from '../stores/operations-store'
import { usePanelStore } from '../stores/panel-store'
import { isArchivePath, toArchivePathForInternalFile } from '../utils/archive-path'
import { splitPathTail } from '../utils/entry-helpers'
import { showToast } from '../components/layout/Toast'

/**
 * Runs file operations end-to-end (enumerate → copy/move/delete per file →
 * refresh panels). Lives as a plain module so the React hook stays small and
 * testing doesn't need a component tree.
 */

// Shared promise used by the "ask"-policy overwrite prompt. The dialog
// surfaces the decision; the executor blocks here until the user picks.
let overwriteResolve: ((action: 'overwrite' | 'skip' | 'cancel') => void) | null = null
/** Active IPC transfer id so cancel can tear down main-process streams. */
let currentTransferId: string | null = null

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

/**
 * Called when the user cancels an operation. Marks store status via the store,
 * aborts any in-flight stream copy in main, and unblocks overwrite waits so
 * the executor can exit and the queue can advance.
 */
export function notifyOperationCancelled(opId: string): void {
  const store = useOperationsStore.getState()
  const op = store.operations.find((o) => o.id === opId)
  if (op?.overwritePrompt) {
    store.updateOperation(opId, { overwritePrompt: null })
  }
  // Unblock waitForOverwriteDecision if the executor is parked on a prompt
  if (overwriteResolve) {
    overwriteResolve('cancel')
    overwriteResolve = null
  }
  const transferId = currentTransferId
  if (transferId) {
    void window.api.util.cancelStreamCopy?.(transferId)
  }
}

function waitForOverwriteDecision(): Promise<'overwrite' | 'skip' | 'cancel'> {
  return new Promise((resolve) => {
    overwriteResolve = resolve
  })
}

function isCancelled(opId: string): boolean {
  const op = useOperationsStore.getState().operations.find((o) => o.id === opId)
  return !op || op.status === 'cancelled'
}

function newTransferId(): string {
  return `xfer-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

async function executeDelete(opId: string, op: ReturnType<typeof useOperationsStore.getState>['operations'][number]): Promise<void> {
  const store = () => useOperationsStore.getState()

  try {
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

    const final = store().operations.find((o) => o.id === opId)
    if (final && !isCancelled(opId) && final.status !== 'error') {
      store().updateOperation(opId, { status: 'done' })
      const count = final.processedFiles || final.totalFiles || op.sourceEntries.length
      showToast(`Deleted ${count} item${count === 1 ? '' : 's'}`)
    }
    store().removeOperation(opId)
  } catch (err) {
    // Top-level safety net for delete
    const current = store().operations.find((o) => o.id === opId)
    if (current && current.status !== 'error' && current.status !== 'cancelled') {
      store().updateOperation(opId, { status: 'error', error: String(err) })
    }
  }
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

/** True when every source is an archive root (path::) — Alt+F9 unpack style. */
function isWholeArchiveSource(entries: { id: string }[]): boolean {
  return (
    entries.length > 0 &&
    entries.every((e) => {
      const sep = e.id.indexOf('::')
      return sep >= 0 && e.id.slice(sep + 2) === ''
    })
  )
}

function archivePathFromRootId(id: string): string {
  const sep = id.indexOf('::')
  return sep >= 0 ? id.slice(0, sep) : id
}

/**
 * Bulk-extract whole archives to the local filesystem with per-entry progress.
 * Returns true if the operation was handled (caller should not stream-copy).
 * Returns false to fall back to per-file streaming (e.g. partial skips).
 */
async function tryBulkArchiveExtract(
  opId: string,
  op: ReturnType<typeof useOperationsStore.getState>['operations'][number],
  fileList: FileItem[],
  totalFiles: number,
  totalBytes: number
): Promise<boolean> {
  if (
    op.type !== 'copy' ||
    op.sourcePluginId !== 'archive' ||
    op.destinationPluginId !== 'local-filesystem' ||
    !isWholeArchiveSource(op.sourceEntries)
  ) {
    return false
  }

  const store = () => useOperationsStore.getState()

  // Resolve overwrites up front — bulk extract can't skip individual members.
  const skipPaths = new Set<string>()
  for (const item of fileList) {
    if (item.isDirectory) continue
    if (isCancelled(opId)) {
      store().updateOperation(opId, { status: 'cancelled' })
      return true
    }
    const exists = await window.api.util.checkExists(item.destPath)
    if (!exists) continue

    const policy: OverwritePolicy =
      store().operations.find((o) => o.id === opId)?.overwritePolicy || 'ask'

    if (policy === 'skip-all') {
      skipPaths.add(item.destPath)
      continue
    }
    if (policy === 'overwrite-all') continue

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
      if (decision === 'cancel' || isCancelled(opId)) {
        store().updateOperation(opId, { status: 'cancelled' })
        return true
      }
      if (decision === 'skip') skipPaths.add(item.destPath)
    }
  }

  // Partial skip → per-file stream path (bulk extract would still write skipped files).
  if (skipPaths.size > 0) return false

  let baseFiles = 0
  let baseBytes = 0
  const sizeByRel = new Map(
    fileList
      .filter((f) => !f.isDirectory)
      .map((f) => [f.relativePath.replace(/\\/g, '/'), f.size] as const)
  )

  const unsub = window.api.util.onExtractProgress((p) => {
    const rel = p.currentFile.replace(/\\/g, '/')
    const fileSize = p.currentFileSize ?? sizeByRel.get(rel) ?? 0
    // processedBytes = fully completed only; currentFileCopied is the in-flight file.
    store().updateOperation(opId, {
      currentFile: p.currentFile,
      currentFileSize: fileSize,
      currentFileCopied: p.currentFileBytes ?? 0,
      processedFiles: Math.min(totalFiles, baseFiles + p.filesDone),
      processedBytes: Math.min(totalBytes, baseBytes + p.bytesDone)
    })
  })

  try {
    for (const entry of op.sourceEntries) {
      if (isCancelled(opId)) {
        store().updateOperation(opId, { status: 'cancelled' })
        return true
      }
      const archivePath = archivePathFromRootId(entry.id)
      store().updateOperation(opId, {
        currentFile: `Extracting ${archivePath.split(/[\\/]/).pop() || archivePath}...`,
        currentFileCopied: 0,
        currentFileSize: 0
      })

      const result = await window.api.util.extractFromArchive(
        archivePath,
        '',
        op.destinationLocationId
      )
      if (!result.success) {
        store().updateOperation(opId, {
          status: 'error',
          error: result.error || `Failed to extract ${archivePath}`
        })
        return true
      }

      // Advance base counters by this archive's share of the enumerated list.
      const archiveFiles = fileList.filter(
        (f) => !f.isDirectory && f.sourcePath.startsWith(archivePath + '::')
      )
      baseFiles += archiveFiles.length
      baseBytes += archiveFiles.reduce((s, f) => s + f.size, 0)
      store().updateOperation(opId, {
        processedFiles: Math.min(totalFiles, baseFiles),
        processedBytes: Math.min(totalBytes, baseBytes)
      })
    }
  } finally {
    unsub()
  }

  await usePanelStore.getState().refresh('left')
  await usePanelStore.getState().refresh('right')

  const finalOp = store().operations.find((o) => o.id === opId)
  if (finalOp && finalOp.status !== 'error' && finalOp.status !== 'cancelled') {
    store().updateOperation(opId, {
      status: 'done',
      processedFiles: totalFiles,
      processedBytes: totalBytes
    })
    if (totalFiles > 0) {
      showToast(`Extracted ${totalFiles} file${totalFiles === 1 ? '' : 's'}`)
    } else {
      showToast('Extract complete')
    }
  }
  if (finalOp && (finalOp.status === 'done' || finalOp.status === 'running')) {
    store().removeOperation(opId)
  }
  return true
}

/** Join parent + name using the separator already present in parent (Windows/Unix). */
function joinLocalPath(parent: string, name: string): string {
  const sep = parent.includes('\\') ? '\\' : '/'
  return parent.replace(/[/\\]+$/, '') + sep + name
}

/**
 * Apply optional single-file rename from the confirm dialog onto enumerated items.
 * Only rewrites the top-level file when destinationFileName is set.
 */
export function applyDestinationFileName(
  fileList: FileItem[],
  destinationFileName: string | undefined
): FileItem[] {
  if (!destinationFileName) return fileList
  const idx = fileList.findIndex((f) => !f.isDirectory)
  if (idx < 0) return fileList
  const item = fileList[idx]
  const { parent } = splitPathTail(item.destPath)
  const newDest = parent ? joinLocalPath(parent, destinationFileName) : destinationFileName
  const next = fileList.slice()
  next[idx] = {
    ...item,
    destPath: newDest,
    relativePath: destinationFileName
  }
  return next
}

/**
 * Same-volume local move: use fs.rename (via moveSingleFile) on each top-level
 * selection instead of stream-copy + delete. Instant on one disk; EXDEV still
 * falls back to copy+delete inside moveSingleFile.
 * Returns true if the op was fully handled (caller must not continue).
 */
async function tryLocalFsRenameMove(
  opId: string,
  op: ReturnType<typeof useOperationsStore.getState>['operations'][number]
): Promise<boolean> {
  if (op.type !== 'move') return false
  if (op.sourcePluginId !== 'local-filesystem' || op.destinationPluginId !== 'local-filesystem') {
    return false
  }
  if (isArchivePath(op.destinationLocationId)) return false
  if (op.sourceEntries.some((e) => isArchivePath(e.id))) return false
  if (typeof window.api.util.moveSingleFile !== 'function') return false

  const store = () => useOperationsStore.getState()
  const entries = op.sourceEntries
  const totalBytes = entries.reduce((s, e) => s + Math.max(0, e.size || 0), 0)

  store().updateOperation(opId, {
    status: 'running',
    fileList: [],
    totalFiles: entries.length,
    totalBytes,
    startTime: Date.now(),
    currentFile: '',
    processedFiles: 0,
    processedBytes: 0
  })

  let processedFiles = 0
  let processedBytes = 0

  for (const entry of entries) {
    if (isCancelled(opId)) {
      store().updateOperation(opId, { status: 'cancelled' })
      return true
    }

    const destName =
      op.destinationFileName && entries.length === 1 ? op.destinationFileName : entry.name
    const destPath = joinLocalPath(op.destinationLocationId, destName)
    store().updateOperation(opId, {
      currentFile: destName,
      currentFileSize: Math.max(0, entry.size || 0),
      currentFileCopied: 0
    })

    try {
      const exists = await window.api.util.checkExists(destPath)
      if (exists) {
        const policy: OverwritePolicy =
          store().operations.find((o) => o.id === opId)?.overwritePolicy || 'ask'

        if (policy === 'skip-all') {
          processedFiles++
          processedBytes += Math.max(0, entry.size || 0)
          store().updateOperation(opId, { processedFiles, processedBytes, currentFileCopied: 0 })
          continue
        }
        if (policy === 'ask') {
          const destInfo = await window.api.util.getFileInfo(destPath)
          store().updateOperation(opId, {
            overwritePrompt: {
              sourcePath: entry.id,
              sourceName: entry.name,
              sourceSize: Math.max(0, entry.size || 0),
              sourceDate: entry.modifiedAt || 0,
              destPath,
              destSize: destInfo?.size || 0,
              destDate: destInfo?.modifiedAt || 0
            }
          })
          const decision = await waitForOverwriteDecision()
          if (decision === 'cancel' || isCancelled(opId)) {
            store().updateOperation(opId, { status: 'cancelled' })
            return true
          }
          if (decision === 'skip') {
            processedFiles++
            processedBytes += Math.max(0, entry.size || 0)
            store().updateOperation(opId, { processedFiles, processedBytes, currentFileCopied: 0 })
            continue
          }
          // overwrite: remove existing dest so rename can take its place
          await window.api.plugins.executeOperation('local-filesystem', {
            op: 'delete',
            entries: [{
              id: destPath,
              name: destName,
              isContainer: entry.isContainer,
              size: destInfo?.size || 0,
              modifiedAt: 0,
              mimeType: '',
              iconHint: entry.isContainer ? 'folder' : 'file',
              meta: {},
              attributes: { readonly: false, hidden: false, symlink: false }
            }]
          })
        }
        // overwrite-all: remove dest then rename
        if (policy === 'overwrite-all') {
          await window.api.plugins.executeOperation('local-filesystem', {
            op: 'delete',
            entries: [{
              id: destPath,
              name: destName,
              isContainer: entry.isContainer,
              size: 0,
              modifiedAt: 0,
              mimeType: '',
              iconHint: entry.isContainer ? 'folder' : 'file',
              meta: {},
              attributes: { readonly: false, hidden: false, symlink: false }
            }]
          })
        }
      }

      const result = await window.api.util.moveSingleFile(entry.id, destPath, !!entry.isContainer)
      if (!result.success) {
        store().updateOperation(opId, {
          status: 'error',
          error: `${entry.name}: ${result.error || 'Move failed'}`
        })
        return true
      }

      processedFiles++
      processedBytes += Math.max(0, entry.size || 0)
      store().updateOperation(opId, {
        processedFiles,
        processedBytes,
        currentFileCopied: Math.max(0, entry.size || 0)
      })
    } catch (err) {
      store().updateOperation(opId, {
        status: 'error',
        error: `${entry.name}: ${String(err)}`
      })
      return true
    }
  }

  await usePanelStore.getState().refresh('left')
  await usePanelStore.getState().refresh('right')

  const finalOp = store().operations.find((o) => o.id === opId)
  if (finalOp && isCancelled(opId)) {
    if (finalOp.status !== 'cancelled') store().updateOperation(opId, { status: 'cancelled' })
    return true
  }
  if (finalOp && finalOp.status !== 'error' && finalOp.status !== 'cancelled') {
    store().updateOperation(opId, {
      status: 'done',
      processedFiles,
      processedBytes
    })
    const n = processedFiles
    showToast(`Moved ${n} item${n === 1 ? '' : 's'}`)
    store().removeOperation(opId)
  }
  return true
}

async function executeCopyOrMove(opId: string, op: ReturnType<typeof useOperationsStore.getState>['operations'][number]): Promise<void> {
  const store = () => useOperationsStore.getState()

  try {
    // Same-disk local move → rename (not copy+delete)
    if (await tryLocalFsRenameMove(opId, op)) {
      return
    }

    store().updateOperation(opId, { status: 'enumerating', currentFile: 'Scanning files...' })

    const sourcePaths = op.sourceEntries.map((e) => e.id)
    let fileList: FileItem[]
    try {
      fileList = await window.api.util.enumerateFiles(
        op.sourcePluginId,
        sourcePaths,
        op.destinationLocationId
      )
    } catch (err) {
      store().updateOperation(opId, {
        status: 'error',
        error: `Failed to scan files: ${String(err)}`
      })
      return
    }

    // Single-file rename-on-copy/move from confirm dialog
    fileList = applyDestinationFileName(fileList, op.destinationFileName)

    if (isCancelled(opId)) {
      // Explicitly mark as cancelled so UI and queue treat it as terminal
      store().updateOperation(opId, { status: 'cancelled' })
      return
    }

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

    // Alt+F9 / whole-archive unpack → local: one extract pass with real progress.
    if (await tryBulkArchiveExtract(opId, op, fileList, totalFiles, totalBytes)) {
      return
    }

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
              const srcEntry = op.sourceEntries.find((e) => e.id === item.sourcePath)
              store().updateOperation(opId, {
                overwritePrompt: {
                  sourcePath: item.sourcePath,
                  sourceName: item.relativePath,
                  sourceSize: item.size,
                  sourceDate: srcEntry?.modifiedAt || 0,
                  destPath: item.destPath,
                  destSize: destInfo?.size || 0,
                  destDate: destInfo?.modifiedAt || 0
                }
              })
              const decision = await waitForOverwriteDecision()
              if (decision === 'cancel' || isCancelled(opId)) break
              if (decision === 'skip') {
                processedBytes += item.size
                store().updateOperation(opId, { processedBytes })
                continue
              }
            }
          }

          // Stream copy through the plugin system — works across any plugin combination.
          // Apply progress updates immediately (main already throttles ~100ms). Extra
          // renderer throttle was dropping the only events that arrived after a tight
          // zip inflate finished in one event-loop turn.
          const unsubProgress = window.api.util.onCopyFileProgress((bytesCopied) => {
            if (isCancelled(opId)) return
            store().updateOperation(opId, { currentFileCopied: bytesCopied })
          })

          const { destDir, destFileName } = splitDestPathForCopy(item.destPath, item.relativePath)

          const transferId = newTransferId()
          currentTransferId = transferId
          // If user cancelled between loop check and now, abort before starting
          if (isCancelled(opId)) {
            void window.api.util.cancelStreamCopy?.(transferId)
          }
          let result: { success: boolean; bytesWritten: number; error?: string }
          try {
            result = await window.api.util.streamCopyFile(
              op.sourcePluginId,
              item.sourcePath,
              op.destinationPluginId,
              destDir,
              destFileName,
              transferId
            )
            // Let any in-flight progress IPC land before we unsubscribe
            await new Promise<void>((r) => setTimeout(r, 0))
          } finally {
            if (currentTransferId === transferId) currentTransferId = null
            unsubProgress()
          }

          if (isCancelled(opId) || result.error === 'Cancelled') {
            store().updateOperation(opId, { status: 'cancelled' })
            break
          }

          // Ensure the bar shows completion for this file before moving on.
          if (result.success) {
            store().updateOperation(opId, {
              currentFileCopied: result.bytesWritten || item.size
            })
          }

          if (!result.success) {
            store().updateOperation(opId, {
              error: `${item.relativePath}: ${result.error}`
            })
            // continue to next instead of full stop
          }

          if (op.type === 'move' && result.success) {
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
        if (isCancelled(opId)) break
        // Resilient: log error but keep going for other files (full skip/retry UI in future)
        store().updateOperation(opId, { error: `${item.relativePath}: ${String(err)}` })
        // continue processing other files
      }

      if (isCancelled(opId)) break

      if (!item.isDirectory) {
        processedFiles++
        processedBytes += item.size
      }
      // Clear in-flight bytes so total bar doesn't double-count completed files.
      store().updateOperation(opId, {
        processedFiles,
        processedBytes,
        currentFileCopied: 0
      })
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
    // If we broke out due to cancel, ensure terminal cancelled status (not left as running)
    if (finalOp && isCancelled(opId) && finalOp.status !== 'cancelled') {
      store().updateOperation(opId, { status: 'cancelled' })
    }
    const afterCancel = store().operations.find((o) => o.id === opId)
    if (afterCancel && afterCancel.status !== 'error' && afterCancel.status !== 'cancelled') {
      store().updateOperation(opId, { status: 'done' })
      const count = afterCancel.processedFiles || afterCancel.totalFiles || 0
      const verb = op.type === 'move' ? 'Moved' : 'Copied'
      if (count > 0) {
        showToast(`${verb} ${count} file${count === 1 ? '' : 's'}`)
      } else {
        showToast(`${verb} complete`)
      }
    }
    // Success: auto-dismiss. Errors and cancels are left for user to review/dismiss.
    const terminal = store().operations.find((o) => o.id === opId)
    if (terminal && (terminal.status === 'done' || terminal.status === 'running')) {
      store().removeOperation(opId)
    }
  } catch (err) {
    // Top-level safety net — never leave operation stuck in enumerating or running
    const current = store().operations.find((o) => o.id === opId)
    if (current && current.status !== 'error' && current.status !== 'cancelled') {
      store().updateOperation(opId, {
        status: 'error',
        error: `Operation failed: ${String(err)}`
      })
    }
  } finally {
    currentTransferId = null
  }
}

export async function executeOperation(opId: string): Promise<void> {
  const op = useOperationsStore.getState().operations.find((o) => o.id === opId)
  if (!op) return

  try {
    if (op.type === 'delete') {
      await executeDelete(opId, op)
    } else {
      await executeCopyOrMove(opId, op)
    }
  } catch (err) {
    // Ultimate safety net — ensure we never leave an op blocking the queue
    const store = useOperationsStore.getState()
    const current = store.operations.find((o) => o.id === opId)
    if (current && current.status !== 'error' && current.status !== 'cancelled' && current.status !== 'done') {
      store.updateOperation(opId, {
        status: 'error',
        error: `Unexpected failure: ${String(err)}`
      })
    }
  }
}

/**
 * Subscribe the executor to the operations store: whenever a queued op appears
 * and nothing is currently running/enumerating, start it. Returns an unsubscribe.
 */
export function startOperationQueue(): () => void {
  let running = false
  /** Track previous statuses so we only fire cancel side-effects once. */
  const knownStatus = new Map<string, FileOperation['status']>()

  const tryStart = (): void => {
    if (running) return
    const store = useOperationsStore.getState()
    // Only live work blocks the queue — cancelled/error/done must not
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

  const onStoreChange = (): void => {
    const ops = useOperationsStore.getState().operations
    for (const op of ops) {
      const prev = knownStatus.get(op.id)
      if (op.status === 'cancelled' && prev !== 'cancelled') {
        // Abort IPC stream + unblock overwrite wait so executeOperation can exit
        notifyOperationCancelled(op.id)
      }
      knownStatus.set(op.id, op.status)
    }
    // Drop ids that were removed
    for (const id of knownStatus.keys()) {
      if (!ops.some((o) => o.id === id)) knownStatus.delete(id)
    }
    tryStart()
  }

  const unsubscribe = useOperationsStore.subscribe(onStoreChange)
  // Run once in case ops are already queued when we subscribe.
  tryStart()
  return unsubscribe
}
