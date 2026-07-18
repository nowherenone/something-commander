import React from 'react'
import styles from '../../styles/dialogs.module.css'

interface FormRowProps {
  label: string
  value: string
  onChange: (value: string) => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  placeholder?: string
  type?: string
  autoFocus?: boolean
  labelWidth?: number
  inputWidth?: number | string
  disabled?: boolean
}

export function FormRow({
  label,
  value,
  onChange,
  onKeyDown,
  placeholder,
  type,
  autoFocus,
  labelWidth = 100,
  inputWidth,
  disabled
}: FormRowProps): React.JSX.Element {
  const inputStyle: React.CSSProperties =
    inputWidth !== undefined ? { width: inputWidth, flex: 'none' } : { flex: 1, width: 'auto' }

  return (
    <div className={styles.formRow}>
      <label className={styles.formLabel} style={{ width: labelWidth }}>
        {label}
      </label>
      <input
        autoFocus={autoFocus}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className={styles.formInput}
        style={inputStyle}
        disabled={disabled}
      />
    </div>
  )
}
