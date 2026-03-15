import React, { useEffect } from 'react'
import { useOperationsStore, type FileOperation, type OverwritePrompt } from '../../stores/operations-store'
import { resolveOverwriteAction } from '../../hooks/useFileOperations'
import { formatSize, formatDate } from '../../utils/format'
import styles from '../../styles/operations.module.css'

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec <= 0) return ''
  return `${formatSize(bytesPerSec)}/s`
}

function formatEta(bytes: number, totalBytes: number, elapsedMs: number): string {
  if (bytes <= 0 || elapsedMs <= 1000) return ''
  const bps = bytes / elapsedMs
  const remaining = totalBytes - bytes
  const secs = Math.round(remaining / bps / 1000)
  if (secs < 60) return `~${secs}s`
  return `~${Math.floor(secs / 60)}m${secs % 60}s`
}

function OverwritePromptView({ prompt }: { prompt: OverwritePrompt }): React.JSX.Element {
  return (
    <div className={styles.overwriteBox}>
      <div className={styles.overwriteTitle}>File already exists</div>
      <div className={styles.overwriteCompare}>
        <div className={styles.overwriteFile}>
          <div className={styles.overwriteLabel}>Source</div>
          <div className={styles.overwriteName} data-testid="ow-source-name">{prompt.sourceName}</div>
          <div className={styles.overwriteMeta} data-testid="ow-source-meta">
            {formatSize(prompt.sourceSize)}
            {prompt.sourceDate > 0 ? ` | ${formatDate(prompt.sourceDate)}` : ''}
          </div>
        </div>
        <div className={styles.overwriteFile}>
          <div className={styles.overwriteLabel}>Existing</div>
          <div className={styles.overwriteName} data-testid="ow-dest-name">{prompt.sourceName}</div>
          <div className={styles.overwriteMeta} data-testid="ow-dest-meta">
            {formatSize(prompt.destSize)}
            {prompt.destDate > 0 ? ` | ${formatDate(prompt.destDate)}` : ''}
          </div>
        </div>
      </div>
      <div className={styles.overwriteActions}>
        <button className={styles.owBtn} data-testid="ow-overwrite" onClick={() => resolveOverwriteAction('overwrite')}>Overwrite</button>
        <button className={styles.owBtn} data-testid="ow-skip" onClick={() => resolveOverwriteAction('skip')}>Skip</button>
        <button className={styles.owBtn} data-testid="ow-overwrite-all" onClick={() => resolveOverwriteAction('overwrite-all')}>Overwrite All</button>
        <button className={styles.owBtn} data-testid="ow-skip-all" onClick={() => resolveOverwriteAction('skip-all')}>Skip All</button>
      </div>
    </div>
  )
}

function OperationView({ op }: { op: FileOperation }): React.JSX.Element {
  const cancel = useOperationsStore((s) => s.cancelOperation)
  const remove = useOperationsStore((s) => s.removeOperation)
  const setShowDialog = useOperationsStore((s) => s.setShowDialog)

  const totalPct = op.totalBytes > 0
    ? Math.round((op.processedBytes / op.totalBytes) * 100)
    : op.totalFiles > 0
      ? Math.round((op.processedFiles / op.totalFiles) * 100)
      : 0

  const filePct = op.currentFileSize > 0 && op.currentFileCopied > 0
    ? Math.min(100, Math.round((op.currentFileCopied / op.currentFileSize) * 100))
    : 0

  const isFileInProgress = op.status === 'running' && op.currentFile !== ''
  const isError = op.status === 'error'
  const isCancelled = op.status === 'cancelled'
  const isRunning = op.status === 'running'
  const isEnumerating = op.status === 'enumerating'
  const isQueued = op.status === 'queued'
  const isActive = isRunning || isEnumerating || isQueued

  const typeLabel = op.type === 'copy' ? 'Copying' : op.type === 'move' ? 'Moving' : 'Deleting'
  const elapsedMs = op.startTime > 0 ? Date.now() - op.startTime : 0
  const speed = isRunning && elapsedMs > 1000 ? formatSpeed((op.processedBytes / elapsedMs) * 1000) : ''
  const eta = isRunning ? formatEta(op.processedBytes, op.totalBytes, elapsedMs) : ''

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
          {(isError || isCancelled) && (
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
         isRunning && op.currentFile ? op.currentFile :
         isError ? '' :
         isCancelled ? '' :
         '\u00A0'}
      </div>

      {/* Current file progress */}
      <div className={styles.opBarSection} data-testid="op-file-progress">
        <div className={styles.opBarLabel}>
          <span>Current file</span>
          <span data-testid="op-file-pct">
            {isFileInProgress && filePct > 0
              ? `${formatSize(op.currentFileCopied)} / ${formatSize(op.currentFileSize)}`
              : '\u00A0'}
          </span>
        </div>
        <div className={styles.opBar}>
          {isFileInProgress && filePct > 0 ? (
            <div className={styles.opBarFill} style={{ width: `${filePct}%` }} data-testid="op-file-bar" />
          ) : isRunning || isEnumerating ? (
            <div className={`${styles.opBarFill} ${styles.opBarFillAnimated}`} />
          ) : (
            <div className={styles.opBarFill} style={{ width: isError ? '100%' : `${totalPct}%` }}
              data-testid="op-file-bar-static" />
          )}
        </div>
      </div>

      {/* Total progress */}
      <div className={styles.opBarSection} data-testid="op-total-progress">
        <div className={styles.opBarLabel}>
          <span data-testid="op-file-count">
            {op.totalFiles > 0 ? `File ${op.processedFiles} of ${op.totalFiles}` : '\u00A0'}
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

      {/* Info line: bytes, speed, ETA */}
      <div className={styles.opInfo} data-testid="op-info">
        <span data-testid="op-bytes">
          {op.totalBytes > 0 ? `${formatSize(op.processedBytes)} / ${formatSize(op.totalBytes)}` : '\u00A0'}
        </span>
        <span data-testid="op-speed">
          {speed}{speed && eta ? ` \u2022 ${eta}` : eta}{!speed && !eta ? '\u00A0' : ''}
        </span>
      </div>

      {/* Error/cancel message */}
      {isError && <div className={styles.opErrorMsg} data-testid="op-error">{op.error}</div>}
      {isCancelled && <div className={styles.opErrorMsg} data-testid="op-cancelled">Cancelled at file {op.processedFiles} of {op.totalFiles}</div>}

      {/* Overwrite prompt */}
      {op.overwritePrompt && <OverwritePromptView prompt={op.overwritePrompt} />}

      {/* Footer */}
      <div className={styles.opDialogFooter}>
        {isActive && !op.overwritePrompt && (
          <button className={styles.opCancelBtn} data-testid="op-cancel" onClick={() => cancel(op.id)}>Cancel</button>
        )}
        {(isError || isCancelled) && (
          <button className={styles.opOkBtn} data-testid="op-ok" onClick={() => remove(op.id)}>OK</button>
        )}
      </div>
    </div>
  )
}

export function OperationDialog(): React.JSX.Element | null {
  const operations = useOperationsStore((s) => s.operations)
  const showDialog = useOperationsStore((s) => s.showDialog)
  const current = useOperationsStore((s) => s.getCurrentOperation())

  // Focus trap
  useEffect(() => {
    if (!showDialog || operations.length === 0) return
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        const running = operations.find((op) => op.status === 'running' || op.status === 'enumerating')
        if (running) {
          useOperationsStore.getState().cancelOperation(running.id)
        }
        e.preventDefault()
        e.stopPropagation()
        return
      }
      e.stopPropagation()
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [showDialog, operations])

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
  const pct = running && running.totalBytes > 0
    ? Math.round((running.processedBytes / running.totalBytes) * 100)
    : 0

  return (
    <button className={styles.queueBtn} data-testid="queue-btn" onClick={() => setShowDialog(true)}>
      {active.length} op{active.length > 1 ? 's' : ''}{running ? ` ${pct}%` : ''}
    </button>
  )
}

// Export for Playwright test harness
export { OperationView }
