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
    inputWidth !== undefined ? { width: inputWidth } : { flex: 1, width: 'auto' }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <label style={{ width: labelWidth, fontSize: 12, color: 'var(--text-secondary)' }}>
        {label}
      </label>
      <input
        autoFocus={autoFocus}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className={styles.settingsInput}
        style={inputStyle}
        disabled={disabled}
      />
    </div>
  )
}
