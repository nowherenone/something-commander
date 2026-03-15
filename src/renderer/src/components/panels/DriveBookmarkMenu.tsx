import React, { useState, useCallback, useEffect, useRef } from 'react'
import { useBookmarksStore } from '../../stores/bookmarks-store'
import styles from '../../styles/drivebar.module.css'

interface DriveInfo {
  name: string
  path: string
}

interface DriveBookmarkMenuProps {
  currentLocation: string
  currentPluginId: string
  onNavigate: (path: string) => void
  isOpen: boolean
  onToggle: (open: boolean) => void
}

export function DriveBookmarkMenu({
  currentLocation,
  currentPluginId,
  onNavigate,
  isOpen,
  onToggle
}: DriveBookmarkMenuProps): React.JSX.Element {
  const [drives, setDrives] = useState<DriveInfo[]>([])
  const [cursorIdx, setCursorIdx] = useState(0)
  const [addingBookmark, setAddingBookmark] = useState(false)
  const [bookmarkName, setBookmarkName] = useState('')
  const bookmarks = useBookmarksStore((s) => s.bookmarks)
  const addBookmark = useBookmarksStore((s) => s.addBookmark)
  const removeBookmark = useBookmarksStore((s) => s.removeBookmark)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Load drives when opened
  useEffect(() => {
    if (!isOpen) return
    window.api.plugins.readDirectory('local-filesystem', null).then((result) => {
      const driveEntries = result.entries
        .filter((e) => e.isContainer)
        .map((e) => ({ name: e.name, path: e.id }))
      setDrives(driveEntries)
    })
    setCursorIdx(0)
    setAddingBookmark(false)
  }, [isOpen])

  // Build flat list of all items for keyboard navigation
  const allItems = [
    ...drives.map((d) => ({ type: 'drive' as const, label: d.name, path: d.path })),
    ...bookmarks.map((b) => ({ type: 'bookmark' as const, label: b.name, path: b.path, id: b.id }))
  ]

  const handleSelect = useCallback(
    (path: string) => {
      onNavigate(path)
      onToggle(false)
    },
    [onNavigate, onToggle]
  )

  const handleAddBookmark = useCallback(() => {
    if (!bookmarkName.trim()) return
    addBookmark(bookmarkName.trim(), currentLocation, currentPluginId)
    setBookmarkName('')
    setAddingBookmark(false)
  }, [bookmarkName, currentLocation, currentPluginId, addBookmark])

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    const handler = (e: KeyboardEvent): void => {
      e.stopPropagation()
      e.preventDefault()

      if (addingBookmark) {
        // Let input handle its own keys except Escape
        if (e.key === 'Escape') {
          setAddingBookmark(false)
        }
        return
      }

      switch (e.key) {
        case 'ArrowDown':
          setCursorIdx((i) => Math.min(i + 1, allItems.length - 1))
          break
        case 'ArrowUp':
          setCursorIdx((i) => Math.max(i - 1, 0))
          break
        case 'Enter':
          if (allItems[cursorIdx]) {
            handleSelect(allItems[cursorIdx].path)
          }
          break
        case 'Escape':
          onToggle(false)
          break
        case 'Delete':
          if (allItems[cursorIdx]?.type === 'bookmark') {
            removeBookmark((allItems[cursorIdx] as { id: string }).id)
          }
          break
      }
    }

    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [isOpen, cursorIdx, allItems, handleSelect, onToggle, removeBookmark, addingBookmark])

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: MouseEvent): void => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onToggle(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isOpen, onToggle])

  return (
    <div ref={dropdownRef} style={{ position: 'relative', height: '100%' }}>
      <button
        className={`${styles.driveButton} ${isOpen ? styles.driveButtonOpen : ''}`}
        onClick={() => onToggle(!isOpen)}
        title="Drives & Bookmarks (Ctrl+D)"
      >
        {'\u2261'}
      </button>

      {isOpen && (
        <div className={styles.dropdown}>
          {/* Drives section */}
          {drives.length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>Drives</div>
              {drives.map((drive, i) => (
                <button
                  key={drive.path}
                  className={`${styles.item} ${cursorIdx === i ? styles.itemActive : ''}`}
                  onClick={() => handleSelect(drive.path)}
                  onMouseEnter={() => setCursorIdx(i)}
                >
                  <span className={styles.itemIcon}>{'\uD83D\uDCBE'}</span>
                  <span className={styles.itemName}>{drive.name}</span>
                </button>
              ))}
            </div>
          )}

          {/* Bookmarks section */}
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Bookmarks</div>
            {bookmarks.length === 0 && !addingBookmark && (
              <div style={{ padding: '4px 10px', fontSize: 11, color: 'var(--text-muted)' }}>
                No bookmarks yet
              </div>
            )}
            {bookmarks.map((bm, bi) => {
              const idx = drives.length + bi
              return (
                <button
                  key={bm.id}
                  className={`${styles.item} ${cursorIdx === idx ? styles.itemActive : ''}`}
                  onClick={() => handleSelect(bm.path)}
                  onMouseEnter={() => setCursorIdx(idx)}
                >
                  <span className={styles.itemIcon}>{'\u2605'}</span>
                  <span className={styles.itemName}>{bm.name}</span>
                  <span className={styles.itemPath}>{bm.path.length > 25 ? '...' + bm.path.slice(-22) : bm.path}</span>
                  <span
                    className={styles.removeBtn}
                    onClick={(e) => {
                      e.stopPropagation()
                      removeBookmark(bm.id)
                    }}
                  >
                    x
                  </span>
                </button>
              )
            })}

            {/* Add bookmark */}
            {addingBookmark ? (
              <div style={{ padding: '4px 10px', display: 'flex', gap: 4 }}>
                <input
                  autoFocus
                  value={bookmarkName}
                  onChange={(e) => setBookmarkName(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation()
                    if (e.key === 'Enter') handleAddBookmark()
                    if (e.key === 'Escape') setAddingBookmark(false)
                  }}
                  placeholder="Bookmark name"
                  style={{
                    flex: 1,
                    padding: '2px 6px',
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 2,
                    fontSize: 11,
                    fontFamily: 'var(--font-family)'
                  }}
                />
              </div>
            ) : (
              <button
                className={styles.addBookmark}
                onClick={() => {
                  setBookmarkName(currentLocation.split(/[\\/]/).pop() || currentLocation)
                  setAddingBookmark(true)
                }}
              >
                + Add current folder
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
