import React from 'react'
import { useOperationsStore, type FileOperation, type OverwritePrompt } from '../../stores/operations-store'
import { resolveOverwriteAction } from '../../hooks/useFileOperations'
import { formatSize, formatDate } from '../../utils/format'
import styles from '../../styles/operations.module.css'

function OverwritePromptView({ prompt }: { prompt: OverwritePrompt }): React.JSX.Element {
  return (
    <div className={styles.overwriteBox}>
      <div className={styles.overwriteTitle}>File already exists</div>
      <div className={styles.overwriteCompare}>
        <div className={styles.overwriteFile}>
          <div className={styles.overwriteLabel}>Source:</div>
          <div className={styles.overwriteName}>{prompt.sourceName}</div>
          <div className={styles.overwriteMeta}>
            {formatSize(prompt.sourceSize)} | {formatDate(prompt.sourceDate)}
          </div>
        </div>
        <div className={styles.overwriteFile}>
          <div className={styles.overwriteLabel}>Existing:</div>
          <div className={styles.overwriteName}>{prompt.sourceName}</div>
          <div className={styles.overwriteMeta}>
            {formatSize(prompt.destSize)} | {formatDate(prompt.destDate)}
          </div>
        </div>
      </div>
      <div className={styles.overwriteActions}>
        <button className={styles.owBtn} onClick={() => resolveOverwriteAction('overwrite')}>
          Overwrite
        </button>
        <button className={styles.owBtn} onClick={() => resolveOverwriteAction('skip')}>
          Skip
        </button>
        <button className={styles.owBtn} onClick={() => resolveOverwriteAction('overwrite-all')}>
          Overwrite All
        </button>
        <button className={styles.owBtn} onClick={() => resolveOverwriteAction('skip-all')}>
          Skip All
        </button>
      </div>
    </div>
  )
}

function OperationCardView({ op }: { op: FileOperation }): React.JSX.Element {
  const cancel = useOperationsStore((s) => s.cancelOperation)
  const remove = useOperationsStore((s) => s.removeOperation)

  const filePct = op.totalFiles > 0 ? Math.round((op.processedFiles / op.totalFiles) * 100) : 0
  const bytePct = op.totalBytes > 0 ? Math.round((op.processedBytes / op.totalBytes) * 100) : filePct
  const isDone = op.status === 'done'
  const isError = op.status === 'error'
  const isCancelled = op.status === 'cancelled'
  const isRunning = op.status === 'running'
  const isQueued = op.status === 'queued'

  const typeLabel = op.type === 'copy' ? 'Copying' : op.type === 'move' ? 'Moving' : 'Deleting'

  return (
    <div className={styles.opDialog}>
      <div className={styles.opDialogHeader}>
        <span className={styles.opDialogTitle}>{typeLabel}</span>
        {(isDone || isError || isCancelled) && (
          <button className={styles.opDismiss} onClick={() => remove(op.id)}>
            Dismiss
          </button>
        )}
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

      {isRunning && op.currentFile && (
        <div className={styles.opCurrentFile}>{op.currentFile}</div>
      )}

      {isQueued && (
        <div className={styles.opCurrentFile} style={{ fontStyle: 'italic' }}>Waiting in queue...</div>
      )}

      {/* Current file progress bar (visual only, we don't have per-byte tracking yet) */}
      {isRunning && (
        <div className={styles.opBarSection}>
          <div className={styles.opBarLabel}>Current file</div>
          <div className={styles.opBar}>
            <div className={styles.opBarFill} style={{ width: '100%', opacity: 0.5 }} />
          </div>
        </div>
      )}

      {/* Overall progress bar */}
      <div className={styles.opBarSection}>
        <div className={styles.opBarLabel}>
          <span>
            {isRunning || isDone
              ? `File ${op.processedFiles} of ${op.totalFiles}`
              : isError
                ? 'Error'
                : isCancelled
                  ? 'Cancelled'
                  : 'Queued'}
          </span>
          <span>{filePct}%</span>
        </div>
        <div className={styles.opBar}>
          <div
            className={`${styles.opBarFill} ${isError ? styles.opBarFillError : ''} ${isDone ? styles.opBarFillDone : ''}`}
            style={{ width: `${filePct}%` }}
          />
        </div>
        {op.totalBytes > 0 && (isRunning || isDone) && (
          <div className={styles.opBytes}>
            {formatSize(op.processedBytes)} / {formatSize(op.totalBytes)}
          </div>
        )}
      </div>

      {isError && <div className={styles.opErrorMsg}>{op.error}</div>}
      {isDone && <div className={styles.opDoneMsg}>Operation completed successfully</div>}
      {isCancelled && <div className={styles.opErrorMsg}>Operation cancelled</div>}

      {/* Overwrite prompt */}
      {op.overwritePrompt && <OverwritePromptView prompt={op.overwritePrompt} />}

      {/* Action buttons */}
      <div className={styles.opDialogFooter}>
        {isRunning && !op.overwritePrompt && (
          <button className={styles.opCancelBtn} onClick={() => cancel(op.id)}>
            Cancel
          </button>
        )}
        {(isDone || isError || isCancelled) && (
          <button className={styles.opOkBtn} onClick={() => remove(op.id)}>
            OK
          </button>
        )}
      </div>
    </div>
  )
}

export function OperationDialog(): React.JSX.Element | null {
  const operations = useOperationsStore((s) => s.operations)
  const showDialog = useOperationsStore((s) => s.showDialog)
  const setShowDialog = useOperationsStore((s) => s.setShowDialog)

  if (!showDialog || operations.length === 0) return null

  // Show the current (running or first queued) operation
  const current = operations.find((op) => op.status === 'running')
    || operations.find((op) => op.status === 'queued')
    || operations.find((op) => op.status === 'error')
    || operations[operations.length - 1]

  const queueCount = operations.filter((op) => op.status === 'queued').length
  const runningCount = operations.filter((op) => op.status === 'running').length

  return (
    <div className={styles.overlay}>
      <div className={styles.dialogContainer}>
        <OperationCardView op={current} />

        {/* Queue indicator */}
        {(queueCount > 0 || operations.length > 1) && (
          <div className={styles.queueInfo}>
            {runningCount > 0 && queueCount > 0
              ? `${queueCount} more operation${queueCount > 1 ? 's' : ''} in queue`
              : operations.length > 1
                ? `${operations.length} operations total`
                : ''}
            <button
              className={styles.queueMinimize}
              onClick={() => setShowDialog(false)}
            >
              Minimize
            </button>
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

  const active = operations.filter((op) => op.status === 'running' || op.status === 'queued')
  if (active.length === 0 || showDialog) return null

  return (
    <button
      className={styles.queueBtn}
      onClick={() => setShowDialog(true)}
      title="Show operation queue"
    >
      {active.length} operation{active.length > 1 ? 's' : ''} running
    </button>
  )
}
