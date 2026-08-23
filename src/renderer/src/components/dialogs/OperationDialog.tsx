import React, { useEffect, useState } from 'react'
import { useOperationsStore, type FileOperation, type OverwritePrompt, type OverwritePolicy } from '../../stores/operations-store'
import { resolveOverwriteAction } from '../../hooks/useFileOperations'
import { getLiveTransferProgress } from '../../services/file-operation-service'
import { formatSize, formatDate, formatSpeed, formatEta } from '../../utils/format'
import { suggestCopyName } from '../../utils/entry-helpers'
import { showToast } from '../layout/Toast'
import { useOverlayStore } from '../../stores/overlay-store'
import { useSizeFormat } from '../../stores/settings-store'
import styles from '../../styles/operations.module.css'

function OverwritePromptView({ prompt, policy }: { prompt: OverwritePrompt; policy: OverwritePolicy }): React.JSX.Element {
  const sizeFormat = useSizeFormat()
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(() => suggestCopyName(prompt.sourceName))

  // Compare needs both sides openable in the local viewer.
  const isLocalPath = (p: string): boolean => /^([a-zA-Z]:[\\/]|\/)/.test(p || '')
  const bothLocal = isLocalPath(prompt.sourcePath) && isLocalPath(prompt.destPath)

  const applyRename = (): void => {
    resolveOverwriteAction('rename', renameValue)
    setRenaming(false)
  }

  const openCompare = async (): Promise<void> => {
    try {
      await window.api.util.openViewerWindow('local-filesystem', prompt.sourcePath, prompt.sourceName)
      await window.api.util.openViewerWindow('local-filesystem', prompt.destPath, prompt.destPath.split(/[\\/]/).pop() || 'existing')
    } catch {
      showToast('Could not open files for comparison')
    }
  }

  return (
    <div className={styles.overwriteBox}>
      <div className={styles.overwriteTitle}>File already exists</div>
      <div className={styles.overwriteCompare}>
        <div className={styles.overwriteFile}>
          <div className={styles.overwriteLabel}>Source</div>
          <div className={styles.overwriteName} data-testid="ow-source-name">{prompt.sourceName}</div>
          <div className={styles.overwriteMeta} data-testid="ow-source-meta">
            {formatSize(prompt.sourceSize, sizeFormat)}
            {prompt.sourceDate > 0 ? ` | ${formatDate(prompt.sourceDate)}` : ''}
          </div>
        </div>
        <div className={styles.overwriteFile}>
          <div className={styles.overwriteLabel}>Existing</div>
          <div className={styles.overwriteName} data-testid="ow-dest-name">{prompt.destPath.split(/[\\/]/).pop() || prompt.sourceName}</div>
          <div className={styles.overwriteMeta} data-testid="ow-dest-meta">
            {formatSize(prompt.destSize, sizeFormat)}
            {prompt.destDate > 0 ? ` | ${formatDate(prompt.destDate)}` : ''}
          </div>
        </div>
      </div>
      {renaming && (
        <div className={styles.overwriteRenameRow}>
          <input
            className={styles.overwriteRenameInput}
            data-testid="ow-rename-input"
            value={renameValue}
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                e.stopPropagation()
                applyRename()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                e.stopPropagation()
                setRenaming(false)
              }
            }}
          />
          <button className={styles.owBtn} data-testid="ow-rename-apply" onClick={applyRename}>Rename &amp; Continue</button>
        </div>
      )}
      {/* A policy chosen earlier in this operation stays visible (F-13): the
          buttons it contradicts gray out so "Skip All" can't silently fight
          an earlier "Overwrite All". */}
      {policy !== 'ask' && (
        <div className={styles.owPolicyNote} data-testid="ow-policy-note">
          {policy === 'overwrite-all'
            ? 'Overwrite All is in effect for the rest of this operation.'
            : 'Skip All is in effect for the rest of this operation.'}
        </div>
      )}
      <div className={styles.overwriteActions}>
        <button
          className={styles.owBtn}
          data-testid="ow-overwrite"
          disabled={policy === 'skip-all'}
          title="Replace the existing file"
          onClick={() => resolveOverwriteAction('overwrite')}
        >
          Overwrite
        </button>
        <button
          className={styles.owBtn}
          data-testid="ow-skip"
          disabled={policy === 'overwrite-all'}
          title="Keep the existing file"
          onClick={() => resolveOverwriteAction('skip')}
        >
          Skip
        </button>
        {!renaming && (
          <button className={styles.owBtn} data-testid="ow-rename" onClick={() => setRenaming(true)}>Rename</button>
        )}
        <button
          className={styles.owBtn}
          data-testid="ow-compare"
          disabled={!bothLocal}
          title={bothLocal ? 'Open both files side by side' : 'Compare needs two local files'}
          onClick={() => void openCompare()}
        >
          Compare…
        </button>
        <button
          className={styles.owBtn}
          data-testid="ow-overwrite-all"
          disabled={policy === 'skip-all'}
          title="Apply to every remaining conflict in this operation"
          onClick={() => resolveOverwriteAction('overwrite-all')}
        >
          Overwrite All
        </button>
        <button
          className={styles.owBtn}
          data-testid="ow-skip-all"
          disabled={policy === 'overwrite-all'}
          title="Apply to every remaining conflict in this operation"
          onClick={() => resolveOverwriteAction('skip-all')}
        >
          Skip All
        </button>
      </div>
    </div>
  )
}

function OperationView({ op }: { op: FileOperation }): React.JSX.Element {
  const cancel = useOperationsStore((s) => s.cancelOperation)
  const remove = useOperationsStore((s) => s.removeOperation)
  const setShowDialog = useOperationsStore((s) => s.setShowDialog)
  // Expandable per-file failure list (F-07).
  const [failuresOpen, setFailuresOpen] = useState(false)
  const sizeFormat = useSizeFormat()

  // Re-read live progress from the store by primitive fields (not object identity).
  // Prevents a stuck bar if a parent memo/selector ever skips object reference updates.
  const liveCopied = useOperationsStore((s) => {
    const live = s.operations.find((o) => o.id === op.id)
    return live?.currentFileCopied ?? op.currentFileCopied
  })
  const liveProcessedBytes = useOperationsStore((s) => {
    const live = s.operations.find((o) => o.id === op.id)
    return live?.processedBytes ?? op.processedBytes
  })
  const liveFileSize = useOperationsStore((s) => {
    const live = s.operations.find((o) => o.id === op.id)
    return live?.currentFileSize ?? op.currentFileSize
  })
  const liveStatus = useOperationsStore((s) => {
    const live = s.operations.find((o) => o.id === op.id)
    return live?.status ?? op.status
  })
  const liveCurrentFile = useOperationsStore((s) => {
    const live = s.operations.find((o) => o.id === op.id)
    return live?.currentFile ?? op.currentFile
  })
  const liveProcessedFiles = useOperationsStore((s) => {
    const live = s.operations.find((o) => o.id === op.id)
    return live?.processedFiles ?? op.processedFiles
  })

  // Keep UI ticking while running so bars move even if zustand identity is sticky.
  const [nowTick, setNowTick] = useState(0)
  useEffect(() => {
    if (liveStatus !== 'running' && liveStatus !== 'enumerating') return
    const id = window.setInterval(() => setNowTick((n) => n + 1), 50)
    return () => window.clearInterval(id)
  }, [liveStatus, op.id])

  // Module-level live progress (updated by poll/events) — source of truth for the bar.
  void nowTick
  const liveXfer = getLiveTransferProgress()
  const xferBytes =
    liveXfer && liveXfer.opId === op.id ? liveXfer.bytes : 0
  const xferTotal =
    liveXfer && liveXfer.opId === op.id ? liveXfer.total : 0

  // Include the in-flight file so the total bar moves during large single files.
  const copied = Math.max(0, xferBytes || liveCopied || 0)
  const fileSize = Math.max(0, xferTotal || liveFileSize || 0)
  const effectiveBytes = liveProcessedBytes + copied
  const totalBytes = Math.max(op.totalBytes || 0, fileSize)
  const totalPct = totalBytes > 0
    ? Math.min(100, Math.round((Math.min(effectiveBytes, totalBytes) / totalBytes) * 100))
    : op.totalFiles > 0
      ? Math.round((liveProcessedFiles / op.totalFiles) * 100)
      : 0

  const filePct = fileSize > 0
    ? Math.min(100, Math.round((copied / fileSize) * 100))
    : 0

  const isFileInProgress = liveStatus === 'running' && liveCurrentFile !== ''
  const hasFileProgress = isFileInProgress && (fileSize > 0 || copied > 0)
  // One file (or still scanning) — a second "overall" bar is the same bar twice.
  const showOverallBar = op.totalFiles > 1
  const isError = liveStatus === 'error'
  const isCancelled = liveStatus === 'cancelled'
  const hasFailures = op.failures.length > 0 && !isCancelled
  const isRunning = liveStatus === 'running'
  const isEnumerating = liveStatus === 'enumerating'
  const isQueued = liveStatus === 'queued'
  const isActive = isRunning || isEnumerating || isQueued

  const typeLabel = op.type === 'copy' ? 'Copying' : op.type === 'move' ? 'Moving' : 'Deleting'
  const elapsedMs = op.startTime > 0 ? Date.now() - op.startTime : 0
  const speed =
    isRunning && elapsedMs > 1000 && effectiveBytes > 0
      ? formatSpeed((Math.min(effectiveBytes, totalBytes || effectiveBytes) / elapsedMs) * 1000)
      : ''
  const eta = isRunning
    ? formatEta(Math.min(effectiveBytes, totalBytes || effectiveBytes), totalBytes, elapsedMs)
    : ''

  return (
    <div className={styles.opDialog} data-testid="op-dialog">
      {/* Header */}
      <div className={styles.opDialogHeader}>
        <span className={styles.opDialogTitle} data-testid="op-title">
          {typeLabel}{isRunning && totalPct > 0 ? ` ${totalPct}%` : ''}
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          {isActive && (
            <button className={styles.opDismiss} data-testid="op-minimize" onClick={() => setShowDialog(false)}>Minimize</button>
          )}
          {(isError || isCancelled || (liveStatus === 'done' && hasFailures)) && (
            <button className={styles.opDismiss} data-testid="op-dismiss" onClick={() => remove(op.id)}>Dismiss</button>
          )}
        </div>
      </div>

      {/* Paths */}
      {op.type !== 'delete' && (
        <div className={styles.opPaths}>
          <div className={styles.opPathRow}>
            <span className={styles.opPathLabel}>From:</span>
            <span className={styles.opPathValue} data-testid="op-from">
              {op.sourceEntries[0]?.id?.replace(/[\\/][^\\/]+$/, '') || ''}
            </span>
          </div>
          <div className={styles.opPathRow}>
            <span className={styles.opPathLabel}>To:</span>
            <span className={styles.opPathValue} data-testid="op-to">{op.destinationDisplay}</span>
          </div>
        </div>
      )}

      {/* Current file */}
      <div className={styles.opCurrentFile} data-testid="op-current-file">
        {isEnumerating ? 'Scanning files...' :
         isQueued ? 'Waiting in queue...' :
         isRunning && liveCurrentFile ? liveCurrentFile :
         isError ? '' :
         isCancelled ? '' :
         '\u00A0'}
      </div>

      {/* Current file progress — also the only bar when copying a single file */}
      <div className={styles.opBarSection} data-testid="op-file-progress">
        <div className={styles.opBarLabel}>
          <span>{showOverallBar ? 'Current file' : '\u00A0'}</span>
          <span data-testid="op-file-pct">
            {isFileInProgress && fileSize > 0
              ? `${formatSize(copied, sizeFormat)} / ${formatSize(fileSize, sizeFormat)}`
              : isFileInProgress && copied > 0
                ? formatSize(copied, sizeFormat)
                : !showOverallBar && totalPct > 0
                  ? `${totalPct}%`
                  : '\u00A0'}
          </span>
        </div>
        <div className={styles.opBar}>
          {hasFileProgress && fileSize > 0 ? (
            <div className={styles.opBarFill} style={{ width: `${filePct}%` }} data-testid="op-file-bar" />
          ) : hasFileProgress && copied > 0 ? (
            // Unknown total size: show a moving indeterminate bar (still better than frozen)
            <div className={`${styles.opBarFill} ${styles.opBarFillAnimated}`} data-testid="op-file-bar" />
          ) : isRunning || isEnumerating ? (
            <div className={`${styles.opBarFill} ${styles.opBarFillAnimated}`} />
          ) : (
            <div
              className={`${styles.opBarFill} ${isError ? styles.opBarFillError : ''}`}
              style={{ width: isError ? '100%' : `${totalPct}%` }}
              data-testid="op-file-bar-static"
            />
          )}
        </div>
      </div>

      {/* Overall progress — only when more than one file (otherwise same as above) */}
      {showOverallBar && (
        <div className={styles.opBarSection} data-testid="op-total-progress">
          <div className={styles.opBarLabel}>
            <span data-testid="op-file-count">
              {`File ${Math.min(liveProcessedFiles, op.totalFiles)} of ${op.totalFiles}`}
            </span>
            <span data-testid="op-total-pct">{totalPct > 0 ? `${totalPct}%` : '\u00A0'}</span>
          </div>
          <div className={styles.opBar}>
            <div
              className={`${styles.opBarFill} ${isError ? styles.opBarFillError : ''}`}
              style={{ width: `${totalPct}%` }}
              data-testid="op-total-bar"
            />
          </div>
        </div>
      )}

      {/* Info line: bytes, speed, ETA */}
      <div className={styles.opInfo} data-testid="op-info">
        <span data-testid="op-bytes">
          {totalBytes > 0
            ? `${formatSize(Math.min(effectiveBytes, totalBytes), sizeFormat)} / ${formatSize(totalBytes, sizeFormat)}`
            : '\u00A0'}
        </span>
        <span data-testid="op-speed">
          {speed}{speed && eta ? ` \u2022 ${eta}` : eta}{!speed && !eta ? '\u00A0' : ''}
        </span>
      </div>

      {/* Error / partial-failure message: friendly headline + expandable raw detail */}
      {(isError || hasFailures) && (
        <div className={styles.opErrorMsg} data-testid="op-error">{op.error}</div>
      )}
      {hasFailures && (
        <div className={styles.opFailures} data-testid="op-failures">
          <button
            type="button"
            className={styles.opFailuresToggle}
            data-testid="op-failures-toggle"
            onClick={() => setFailuresOpen((v) => !v)}
          >
            {failuresOpen ? 'Hide details' : `Show details (${op.failures.length} failed)`}
          </button>
          {failuresOpen && (
            <ul className={styles.opFailuresList} data-testid="op-failures-list">
              {op.failures.map((f, i) => (
                <li key={`${f.name}-${i}`}>
                  <span className={styles.opFailureName}>{f.name}</span>
                  <span className={styles.opFailureMsg}>{f.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {isCancelled && <div className={styles.opErrorMsg} data-testid="op-cancelled">Cancelled at file {liveProcessedFiles} of {op.totalFiles}</div>}

      {/* Overwrite prompt */}
      {op.overwritePrompt && <OverwritePromptView prompt={op.overwritePrompt} policy={op.overwritePolicy} />}

      {/* Footer */}
      <div className={styles.opDialogFooter}>
        {isActive && !op.overwritePrompt && (
          <button className={styles.opCancelBtn} data-testid="op-cancel" onClick={() => cancel(op.id)}>Cancel</button>
        )}
        {(isError || isCancelled || (liveStatus === 'done' && hasFailures)) && (
          <button className={styles.opOkBtn} data-testid="op-ok" onClick={() => remove(op.id)}>OK</button>
        )}
      </div>
    </div>
  )
}

export function OperationDialog(): React.JSX.Element | null {
  const operations = useOperationsStore((s) => s.operations)
  const showDialog = useOperationsStore((s) => s.showDialog)
  // Select the live op object from `operations` so currentFileCopied updates re-render.
  // (Calling getCurrentOperation() is fine for identity, but reading fields from the
  // operations array keeps the subscription tied to the data that progress mutates.)
  const current = useOperationsStore((s) => {
    const ops = s.operations
    return (
      ops.find((op) => op.status === 'running') ||
      ops.find((op) => op.status === 'enumerating') ||
      ops.find((op) => op.status === 'queued') ||
      ops.find((op) => op.status === 'error') ||
      ops[ops.length - 1]
    )
  })
  const cancel = useOperationsStore((s) => s.cancelOperation)
  const remove = useOperationsStore((s) => s.removeOperation)

  // Register with overlay stack for top-wins Escape. Proper semantics:
  // - running + no prompt -> cancel
  // - error/cancelled -> dismiss (remove)
  // - queued -> cancel or dismiss
  // - overwrite prompt -> ignore (buttons handle)
  // - minimized -> re-open on click queue, Escape from outside not here
  useEffect(() => {
    if (!showDialog || !current) return

    const opId = current.id
    const isActive = current.status === 'running' || current.status === 'enumerating' || current.status === 'queued'

    const onEscape = () => {
      if (current.overwritePrompt) {
        // Let overwrite buttons handle
        return
      }
      if (isActive && !current.overwritePrompt) {
        cancel(opId)
      } else if (current.status === 'error' || current.status === 'cancelled') {
        remove(opId)
      } else {
        // queued or other: dismiss or cancel
        if (current.status === 'queued') {
          cancel(opId)
        } else {
          remove(opId)
        }
      }
    }

    const overlayId = `operation-${opId}`
    useOverlayStore.getState().push({ id: overlayId, onEscape })

    return () => {
      const o = useOverlayStore.getState()
      if (o.isTop(overlayId)) o.pop()
    }
  }, [showDialog, current, cancel, remove])

  // Remove old direct listener reliance (now via overlay + useKeyboard)
  // Keep for minimized re-open support etc.

  if (!showDialog || operations.length === 0 || !current) return null

  const queueCount = operations.filter((op) => op.status === 'queued').length

  return (
    <div className={styles.overlay} data-testid="op-overlay">
      <div className={styles.dialogContainer}>
        <OperationView op={current} />
        {queueCount > 0 && (
          <div className={styles.queueInfo} data-testid="op-queue-info">
            <span>{queueCount} more in queue</span>
          </div>
        )}
      </div>
    </div>
  )
}

export function QueueButton(): React.JSX.Element | null {
  const operations = useOperationsStore((s) => s.operations)
  const showDialog = useOperationsStore((s) => s.showDialog)
  const setShowDialog = useOperationsStore((s) => s.setShowDialog)

  const active = operations.filter((op) =>
    op.status === 'running' || op.status === 'queued' || op.status === 'enumerating'
  )
  if (active.length === 0 || showDialog) return null

  const running = active.find((op) => op.status === 'running')
  // Include in-flight bytes so the minimize chip moves during a single large file.
  const pct =
    running && running.totalBytes > 0
      ? Math.round(
          (Math.min(running.totalBytes, running.processedBytes + (running.currentFileCopied || 0)) /
            running.totalBytes) *
            100
        )
      : 0

  return (
    <button className={styles.queueBtn} data-testid="queue-btn" onClick={() => setShowDialog(true)}>
      {active.length} op{active.length > 1 ? 's' : ''}{running ? ` ${pct}%` : ''}
    </button>
  )
}

// Export for Playwright test harness
export { OperationView }
