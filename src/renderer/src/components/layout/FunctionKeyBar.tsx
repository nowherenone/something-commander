import React from 'react'
import styles from '../../styles/function-bar.module.css'

interface FnKeyProps {
  fkey: string
  label: string
  onClick?: () => void
}

function FnKey({ fkey, label, onClick }: FnKeyProps): React.JSX.Element {
  return (
    <button className={styles.fnButton} onClick={onClick}>
      <span className={styles.fnKey}>{fkey}</span>
      <span className={styles.fnLabel}>{label}</span>
    </button>
  )
}

interface FunctionKeyBarProps {
  onF3?: () => void
  onF5?: () => void
  onF6?: () => void
  onF7?: () => void
  onF8?: () => void
  onF9?: () => void
}

export function FunctionKeyBar({ onF3, onF5, onF6, onF7, onF8, onF9 }: FunctionKeyBarProps): React.JSX.Element {
  return (
    <div className={styles.bar}>
      <FnKey fkey="F1" label="Help" />
      <FnKey fkey="F2" label="Rename" />
      <FnKey fkey="F3" label="View" onClick={onF3} />
      <FnKey fkey="F4" label="Edit" />
      <FnKey fkey="F5" label="Copy" onClick={onF5} />
      <FnKey fkey="F6" label="Move" onClick={onF6} />
      <FnKey fkey="F7" label="MkDir" onClick={onF7} />
      <FnKey fkey="F8" label="Delete" onClick={onF8} />
      <FnKey fkey="F9" label="Settings" onClick={onF9} />
      <FnKey fkey="F10" label="Quit" />
    </div>
  )
}
