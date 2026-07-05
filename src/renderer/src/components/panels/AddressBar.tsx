import React, { useState, useCallback, useMemo } from 'react'
import type { BreadcrumbSegment } from '../../utils/breadcrumb-segments'
import styles from '../../styles/panels.module.css'

interface AddressBarProps {
  location: string
  segments: BreadcrumbSegment[]
  onNavigate: (path: string) => void
  onSegmentClick: (locationId: string | null) => void
}

export function AddressBar({
  location,
  segments,
  onNavigate,
  onSegmentClick
}: AddressBarProps): React.JSX.Element {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState('')

  const sep = useMemo(
    () => (navigator.platform.startsWith('Win') ? ' \\ ' : ' / '),
    []
  )

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
        <React.Fragment key={`${seg.locationId ?? 'root'}-${i}`}>
          {i > 0 && <span className={styles.addressSep}>{sep}</span>}
          <span
            className={styles.addressSegment}
            onClick={() => onSegmentClick(seg.locationId)}
          >
            {seg.label}
          </span>
        </React.Fragment>
      ))}
    </div>
  )
}