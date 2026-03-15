import React, { useState, useCallback } from 'react'
import styles from '../../styles/panels.module.css'

interface AddressBarProps {
  location: string
  onNavigate: (path: string) => void
  onSegmentClick: (path: string) => void
}

export function AddressBar({ location, onNavigate, onSegmentClick }: AddressBarProps): React.JSX.Element {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState('')

  const segments = parseSegments(location)

  const startEdit = useCallback(() => {
    setEditValue(location)
    setIsEditing(true)
  }, [location])

  const commitEdit = useCallback(() => {
    setIsEditing(false)
    if (editValue.trim() && editValue !== location) {
      onNavigate(editValue.trim())
    }
  }, [editValue, location, onNavigate])

  if (isEditing) {
    return (
      <div className={styles.addressBar}>
        <input
          className={styles.addressInput}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitEdit()
            if (e.key === 'Escape') setIsEditing(false)
          }}
          autoFocus
        />
      </div>
    )
  }

  return (
    <div className={styles.addressBar} onDoubleClick={startEdit}>
      {segments.map((seg, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className={styles.addressSep}>{' > '}</span>}
          <span
            className={styles.addressSegment}
            onClick={() => onSegmentClick(seg.path)}
          >
            {seg.label}
          </span>
        </React.Fragment>
      ))}
    </div>
  )
}

interface Segment {
  label: string
  path: string
}

function parseSegments(location: string): Segment[] {
  if (!location) return []

  // Handle "My Computer" or similar virtual roots
  if (!location.includes('/') && !location.includes('\\')) {
    return [{ label: location, path: '' }]
  }

  const normalized = location.replace(/\\/g, '/')
  const parts = normalized.split('/').filter(Boolean)
  const segments: Segment[] = []

  // Handle drive letter on Windows (e.g., "C:")
  let accumulated = ''
  for (let i = 0; i < parts.length; i++) {
    if (i === 0 && parts[0].endsWith(':')) {
      accumulated = parts[0] + '/'
    } else {
      accumulated += parts[i] + '/'
    }
    segments.push({
      label: parts[i],
      path: accumulated.replace(/\/$/, '') || '/'
    })
  }

  // If path starts with /, add root
  if (normalized.startsWith('/') && segments.length > 0 && segments[0].label !== '/') {
    segments.unshift({ label: '/', path: '/' })
  }

  return segments
}
