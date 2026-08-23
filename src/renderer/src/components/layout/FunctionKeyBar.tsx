import React from 'react'
import styles from '../../styles/function-bar.module.css'

interface FnKeyProps {
  fkey: string
  label: string
  onClick?: () => void
}

function FnKey({ fkey, label, onClick }: FnKeyProps): React.JSX.Element {
  return (
    <button
      className={styles.fnButton}
      onClick={onClick}
      // Mouse users don't expect a clicked key-bar button to keep focus and
      // re-fire on their next Enter/Space; keyboard activation keeps focus.
      onMouseUp={(e) => e.currentTarget.blur()}
    >
      <span className={styles.fnKey}>{fkey}</span>
      <span className={styles.fnLabel}>{label}</span>
    </button>
  )
}

interface FunctionKeyBarProps {
  onF1?: () => void
  onF2?: () => void
  onF3?: () => void
  onF4?: () => void
  onF5?: () => void
  onF6?: () => void
  onF7?: () => void
  onF8?: () => void
  onF9?: () => void
  onF10?: () => void
}

export function FunctionKeyBar({ onF1, onF2, onF3, onF4, onF5, onF6, onF7, onF8, onF9, onF10 }: FunctionKeyBarProps): React.JSX.Element {
  return (
    <div className={styles.bar}>
      <FnKey fkey="F1" label="Help" onClick={onF1} />
      <FnKey fkey="F2" label="Rename" onClick={onF2} />
      <FnKey fkey="F3" label="View" onClick={onF3} />
      <FnKey fkey="F4" label="Edit" onClick={onF4} />
      <FnKey fkey="F5" label="Copy" onClick={onF5} />
      <FnKey fkey="F6" label="Move" onClick={onF6} />
      <FnKey fkey="F7" label="MkDir" onClick={onF7} />
      <FnKey fkey="F8" label="Delete" onClick={onF8} />
      <FnKey fkey="F9" label="Settings" onClick={onF9} />
      <FnKey fkey="F10" label="Quit" onClick={onF10} />
    </div>
  )
}
