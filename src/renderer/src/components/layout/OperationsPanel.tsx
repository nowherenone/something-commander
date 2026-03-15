import React from 'react'
import { useOperationsStore, type FileOperation } from '../../stores/operations-store'
import styles from '../../styles/operations.module.css'

function OperationCard({ op }: { op: FileOperation }): React.JSX.Element {
  const cancel = useOperationsStore((s) => s.cancelOperation)
  const remove = useOperationsStore((s) => s.removeOperation)

  const pct = op.totalFiles > 0 ? Math.round((op.processedFiles / op.totalFiles) * 100) : 0
  const isDone = op.status === 'done'
  const isError = op.status === 'error'
  const isCancelled = op.status === 'cancelled'
  const isRunning = op.status === 'running'

  return (
    <div className={styles.opCard}>
      <div className={styles.opHeader}>
        <span className={styles.opType}>{op.type}</span>
        {isRunning && (
          <button className={styles.opCancel} onClick={() => cancel(op.id)} title="Cancel">
            x
          </button>
        )}
        {(isDone || isError || isCancelled) && (
          <button className={styles.opCancel} onClick={() => remove(op.id)} title="Dismiss">
            x
          </button>
        )}
      </div>
      <div className={styles.opDest}>
        To: {op.destinationDisplay}
      </div>
      {isRunning && op.currentFile && (
        <div className={styles.opFile}>{op.currentFile}</div>
      )}
      <div className={styles.opProgress}>
        <div className={styles.opBar}>
          <div
            className={`${styles.opBarFill} ${isError ? styles.opBarFillError : ''}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className={styles.opCount}>
          {op.processedFiles}/{op.totalFiles}
        </span>
      </div>
      {isDone && <div className={styles.opDone}>Completed</div>}
      {isError && <div className={styles.opError}>{op.error || 'Error'}</div>}
      {isCancelled && <div className={styles.opError}>Cancelled</div>}
    </div>
  )
}

export function OperationsPanel(): React.JSX.Element | null {
  const operations = useOperationsStore((s) => s.operations)

  if (operations.length === 0) return null

  return (
    <div className={styles.operationsPanel}>
      {operations.map((op) => (
        <OperationCard key={op.id} op={op} />
      ))}
    </div>
  )
}
