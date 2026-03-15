import React, { useEffect, useRef } from 'react'
import { useOperationsStore, type FileOperation, type OverwritePrompt } from '../../stores/operations-store'
import { resolveOverwriteAction } from '../../hooks/useFileOperations'
import { formatSize, formatDate } from '../../utils/format'
import styles from '../../styles/operations.module.css'

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec <= 0) return ''
  return `${formatSize(bytesPerSec)}/s`
}

function formatTimeRemaining(bytes: number, totalBytes: number, elapsedMs: number): string {
  if (bytes <= 0 || elapsedMs <= 0) return ''
  const bytesPerMs = bytes / elapsedMs
  const remainingBytes = totalBytes - bytes
  const remainingMs = remainingBytes / bytesPerMs
  const secs = Math.round(remainingMs / 1000)
  if (secs < 60) return `~${secs}s remaining`
  const mins = Math.floor(secs / 60)
  const remSecs = secs % 60
  return `~${mins}m ${remSecs}s remaining`
}

function OverwritePromptView({ prompt }: { prompt: OverwritePrompt }): React.JSX.Element {
  return (
    <div className={styles.overwriteBox}>
      <div className={styles.overwriteTitle}>File already exists</div>
      <div className={styles.overwriteCompare}>
        <div className={styles.overwriteFile}>
          <div className={styles.overwriteLabel}>Source:</div>
          <div className={styles.overwriteName}>{prompt.sourceName}</div>
          <div className={styles.overwriteMeta}>
            {formatSize(prompt.sourceSize)}{prompt.sourceDate > 0 ? ` | ${formatDate(prompt.sourceDate)}` : ''}
          </div>
        </div>
        <div className={styles.overwriteFile}>
          <div className={styles.overwriteLabel}>Existing:</div>
          <div className={styles.overwriteName}>{prompt.sourceName}</div>
          <div className={styles.overwriteMeta}>
            {formatSize(prompt.destSize)}{prompt.destDate > 0 ? ` | ${formatDate(prompt.destDate)}` : ''}
          </div>
        </div>
      </div>
      <div className={styles.overwriteActions}>
        <button className={styles.owBtn} onClick={() => resolveOverwriteAction('overwrite')}>Overwrite</button>
        <button className={styles.owBtn} onClick={() => resolveOverwriteAction('skip')}>Skip</button>
        <button className={styles.owBtn} onClick={() => resolveOverwriteAction('overwrite-all')}>Overwrite All</button>
        <button className={styles.owBtn} onClick={() => resolveOverwriteAction('skip-all')}>Skip All</button>
      </div>
    </div>
  )
}

function OperationCardView({ op }: { op: FileOperation }): React.JSX.Element {
  const cancel = useOperationsStore((s) => s.cancelOperation)
  const remove = useOperationsStore((s) => s.removeOperation)
  const setShowDialog = useOperationsStore((s) => s.setShowDialog)

  const totalPct = op.totalBytes > 0
    ? Math.round((op.processedBytes / op.totalBytes) * 100)
    : op.totalFiles > 0
      ? Math.round((op.processedFiles / op.totalFiles) * 100)
      : 0

  const isFileInProgress = op.status === 'running' && op.currentFile !== ''
  const isError = op.status === 'error'
  const isCancelled = op.status === 'cancelled'
  const isRunning = op.status === 'running'
  const isEnumerating = op.status === 'enumerating'
  const isQueued = op.status === 'queued'
  const isActive = isRunning || isEnumerating || isQueued

  const typeLabel = op.type === 'copy' ? 'Copying' : op.type === 'move' ? 'Moving' : 'Deleting'

  // Speed calculation
  const elapsedMs = op.startTime > 0 ? Date.now() - op.startTime : 0
  const bytesPerSec = elapsedMs > 0 ? (op.processedBytes / elapsedMs) * 1000 : 0
  const speed = isRunning ? formatSpeed(bytesPerSec) : ''
  const timeRemaining = isRunning ? formatTimeRemaining(op.processedBytes, op.totalBytes, elapsedMs) : ''

  return (
    <div className={styles.opDialog}>
      <div className={styles.opDialogHeader}>
        <span className={styles.opDialogTitle}>
          {typeLabel}{isRunning ? ` ${totalPct}%` : ''}
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          {isActive && (
            <button className={styles.opDismiss} onClick={() => setShowDialog(false)}>Minimize</button>
          )}
          {(isError || isCancelled) && (
            <button className={styles.opDismiss} onClick={() => remove(op.id)}>Dismiss</button>
          )}
        </div>
      </div>

      {op.type !== 'delete' && (
        <div className={styles.opPaths}>
          <div className={styles.opPathRow}>
            <span className={styles.opPathLabel}>From:</span>
            <span className={styles.opPathValue}>
              {op.sourceEntries[0]?.id?.replace(/[\\/][^\\/]+$/, '') || ''}
            </span>
          </div>
          <div className={styles.opPathRow}>
            <span className={styles.opPathLabel}>To:</span>
            <span className={styles.opPathValue}>{op.destinationDisplay}</span>
          </div>
        </div>
      )}

      {isEnumerating && (
        <div className={styles.opCurrentFile}>Scanning files...</div>
      )}

      {isQueued && (
        <div className={styles.opCurrentFile} style={{ fontStyle: 'italic' }}>Waiting in queue...</div>
      )}

      {isRunning && op.currentFile && (
        <div className={styles.opCurrentFile}>{op.currentFile}</div>
      )}

      {/* Current file progress bar */}
      {isFileInProgress && (
        <div className={styles.opBarSection}>
          <div className={styles.opBarLabel}>
            <span>Current file</span>
            <span>
              {op.currentFileSize > 0
                ? `${formatSize(op.currentFileCopied)} / ${formatSize(op.currentFileSize)} (${Math.round((op.currentFileCopied / op.currentFileSize) * 100)}%)`
                : ''}
            </span>
          </div>
          <div className={styles.opBar}>
            {op.currentFileSize > 0 && op.currentFileCopied > 0 ? (
              <div
                className={styles.opBarFill}
                style={{ width: `${Math.min(100, Math.round((op.currentFileCopied / op.currentFileSize) * 100))}%` }}
              />
            ) : (
              <div className={`${styles.opBarFill} ${styles.opBarFillAnimated}`} />
            )}
          </div>
        </div>
      )}

      {/* Overall progress bar */}
      {isRunning && op.totalFiles > 0 && (
        <div className={styles.opBarSection}>
          <div className={styles.opBarLabel}>
            <span>File {op.processedFiles} of {op.totalFiles}</span>
            <span>{totalPct}%</span>
          </div>
          <div className={styles.opBar}>
            <div className={styles.opBarFill} style={{ width: `${totalPct}%` }} />
          </div>
          <div className={styles.opBytes}>
            {op.totalBytes > 0 && `${formatSize(op.processedBytes)} / ${formatSize(op.totalBytes)}`}
            {speed && ` \u2022 ${speed}`}
            {timeRemaining && ` \u2022 ${timeRemaining}`}
          </div>
        </div>
      )}

      {isEnumerating && (
        <div className={styles.opBarSection}>
          <div className={styles.opBar}>
            <div className={`${styles.opBarFill} ${styles.opBarFillAnimated}`} />
          </div>
        </div>
      )}

      {isError && <div className={styles.opErrorMsg}>{op.error}</div>}
      {isCancelled && <div className={styles.opErrorMsg}>Cancelled at file {op.processedFiles} of {op.totalFiles}</div>}

      {op.overwritePrompt && <OverwritePromptView prompt={op.overwritePrompt} />}

      <div className={styles.opDialogFooter}>
        {isActive && !op.overwritePrompt && (
          <button className={styles.opCancelBtn} onClick={() => cancel(op.id)}>Cancel</button>
        )}
        {(isError || isCancelled) && (
          <button className={styles.opOkBtn} onClick={() => remove(op.id)}>OK</button>
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
    <div className={styles.overlay}>
      <div className={styles.dialogContainer}>
        <OperationCardView op={current} />
        {queueCount > 0 && (
          <div className={styles.queueInfo}>
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
    <button className={styles.queueBtn} onClick={() => setShowDialog(true)}>
      {active.length} op{active.length > 1 ? 's' : ''}{running ? ` ${pct}%` : ''}
    </button>
  )
}
