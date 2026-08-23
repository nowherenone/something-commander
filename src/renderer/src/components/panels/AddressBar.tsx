import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import type { PanelId } from '../../stores/app-store'
import type { BreadcrumbSegment } from '../../utils/breadcrumb-segments'
import styles from '../../styles/panels.module.css'

interface AddressBarProps {
  panelId?: PanelId
  location: string
  segments: BreadcrumbSegment[]
  onNavigate: (path: string) => void
  onSegmentClick: (locationId: string | null) => void
}

export function AddressBar({
  panelId,
  location,
  segments,
  onNavigate,
  onSegmentClick
}: AddressBarProps): React.JSX.Element {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const sep = useMemo(
    () => (navigator.platform.startsWith('Win') ? ' \\ ' : ' / '),
    []
  )

  const startEdit = useCallback(() => {
    setEditValue(location)
    setIsEditing(true)
  }, [location])

  // Ctrl+L ("focusAddressBar" command): the active panel's address bar enters
  // edit mode with the whole path selected, ready to type over.
  useEffect(() => {
    if (!panelId) return
    const onFocusRequest = (e: Event): void => {
      const detail = (e as CustomEvent<{ panelId: PanelId }>).detail
      if (detail?.panelId !== panelId) return
      startEdit()
    }
    window.addEventListener('commander:focus-address-bar', onFocusRequest)
    return () => window.removeEventListener('commander:focus-address-bar', onFocusRequest)
  }, [panelId, startEdit])

  // Select the full path once the edit input mounts.
  useEffect(() => {
    if (!isEditing) return
    inputRef.current?.select()
  }, [isEditing])

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
          ref={inputRef}
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
