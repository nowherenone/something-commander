import React, { useState, useCallback, useEffect, useRef } from 'react'
import { useBookmarksStore } from '../../stores/bookmarks-store'
import styles from '../../styles/drivebar.module.css'

interface DriveInfo {
  name: string
  path: string
}

interface NetworkConnection {
  pluginId: string
  label: string
  locationId: string
}

// Module-level cache shared by both panel instances — drives change rarely
let drivesCache: DriveInfo[] = []
let drivesCacheTime = 0
const DRIVES_CACHE_TTL = 30_000 // 30 seconds

interface DriveBookmarkMenuProps {
  currentLocation: string
  currentPluginId: string
  onNavigate: (path: string) => void
  onNavigatePlugin: (pluginId: string, locationId: string) => void
  isOpen: boolean
  onToggle: (open: boolean) => void
}

export function DriveBookmarkMenu({
  currentLocation,
  currentPluginId,
  onNavigate,
  onNavigatePlugin,
  isOpen,
  onToggle
}: DriveBookmarkMenuProps): React.JSX.Element {
  const [drives, setDrives] = useState<DriveInfo[]>([])
  const [networkConns, setNetworkConns] = useState<NetworkConnection[]>([])
  const [cursorIdx, setCursorIdx] = useState(0)
  const [addingBookmark, setAddingBookmark] = useState(false)
  const [bookmarkName, setBookmarkName] = useState('')
  const bookmarks = useBookmarksStore((s) => s.bookmarks)
  const addBookmark = useBookmarksStore((s) => s.addBookmark)
  const removeBookmark = useBookmarksStore((s) => s.removeBookmark)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Load drives and network connections when opened
  useEffect(() => {
    if (!isOpen) return
    setAddingBookmark(false)

    const isFresh = drivesCache.length > 0 && (Date.now() - drivesCacheTime) < DRIVES_CACHE_TTL

    const applyDrives = (entries: DriveInfo[]): void => {
      setDrives(entries)
      setCursorIdx(0)
    }

    if (isFresh) {
      applyDrives(drivesCache)
    } else {
      if (drivesCache.length > 0) applyDrives(drivesCache)

      window.api.plugins.readDirectory('local-filesystem', null).then((result) => {
        const entries = result.entries
          .filter((e) => e.isContainer)
          .map((e) => ({ name: e.name, path: e.id }))
        drivesCache = entries
        drivesCacheTime = Date.now()
        setDrives(entries)
      })
    }

    // Load active network connections from all network plugins
    const networkPlugins = ['sftp', 's3', 'smb']
    Promise.all(
      networkPlugins.map((pluginId) =>
        window.api.plugins.readDirectory(pluginId, null).then((result) =>
          result.entries.map((e) => ({
            pluginId,
            label: e.name,
            locationId: e.id
          }))
        ).catch(() => [] as NetworkConnection[])
      )
    ).then((results) => {
      // Also load saved SMB connections that aren't currently active
      window.api.store.get('smb-connections').then((saved) => {
        const active = results.flat()
        if (Array.isArray(saved)) {
          for (const conn of saved as Array<{ host: string; share: string; username: string; label: string }>) {
            const connId = `${conn.username}@${conn.host}/${conn.share}`
            const alreadyActive = active.some((a) => a.pluginId === 'smb' && a.locationId === `${connId}::`)
            if (!alreadyActive) {
              active.push({
                pluginId: 'smb',
                label: `${conn.label || `\\\\${conn.host}\\${conn.share}`} (saved)`,
                locationId: `${connId}::`
              })
            }
          }
        }
        setNetworkConns(active)
      }).catch(() => setNetworkConns(results.flat()))
    })
  }, [isOpen])

  // Build flat list of all items for keyboard navigation (includes the add button as last item)
  const allItems = [
    ...drives.map((d) => ({ type: 'drive' as const, label: d.name, path: d.path, pluginId: 'local-filesystem', locationId: d.path })),
    ...networkConns.map((c) => ({ type: 'network' as const, label: c.label, path: '', pluginId: c.pluginId, locationId: c.locationId, id: '' })),
    ...bookmarks.map((b) => ({ type: 'bookmark' as const, label: b.name, path: b.path, pluginId: 'local-filesystem', locationId: b.path, id: b.id })),
    { type: 'add' as const, label: '+ Add current folder', path: '', pluginId: '', locationId: '' }
  ]

  const handleSelect = useCallback(
    async (item: { type: string; path: string; pluginId: string; locationId: string; label?: string }) => {
      if (item.type === 'network') {
        // For saved (not yet connected) SMB connections, auto-connect first
        if (item.pluginId === 'smb' && item.label?.endsWith('(saved)')) {
          const saved = (await window.api.store.get('smb-connections')) as Array<{
            host: string; share: string; username: string; password: string; domain: string; label: string
          }> | null
          if (saved) {
            // Extract connId parts from locationId: "user@host/share::"
            const connIdPart = item.locationId.replace(/::$/, '')
            const match = connIdPart.match(/^(.+)@(.+)\/(.+)$/)
            if (match) {
              const conn = saved.find((c) => c.username === match[1] && c.host === match[2] && c.share === match[3])
              if (conn) {
                try {
                  await window.api.util.smbConnect(conn.host, conn.share, conn.username, conn.password, conn.domain || undefined, conn.label || undefined)
                } catch {
                  // Connection failed — still navigate, plugin will show error
                }
              }
            }
          }
        }
        onNavigatePlugin(item.pluginId, item.locationId)
      } else {
        onNavigate(item.path)
      }
      onToggle(false)
    },
    [onNavigate, onNavigatePlugin, onToggle]
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
      if (addingBookmark) {
        // Let the input handle all keys except Escape
        if (e.key === 'Escape') {
          e.stopPropagation()
          e.preventDefault()
          setAddingBookmark(false)
        }
        return
      }

      e.stopPropagation()
      e.preventDefault()

      switch (e.key) {
        case 'ArrowDown':
          setCursorIdx((i) => Math.min(i + 1, allItems.length - 1))
          break
        case 'ArrowUp':
          setCursorIdx((i) => Math.max(i - 1, 0))
          break
        case 'Enter':
          if (allItems[cursorIdx]?.type === 'add') {
            setBookmarkName(currentLocation.split(/[\\/]/).pop() || currentLocation)
            setAddingBookmark(true)
          } else if (allItems[cursorIdx]) {
            handleSelect(allItems[cursorIdx])
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
                  onClick={() => handleSelect(allItems[i])}
                  onMouseEnter={() => setCursorIdx(i)}
                >
                  <span className={styles.itemIcon}>{'\uD83D\uDCBE'}</span>
                  <span className={styles.itemName}>{drive.name}</span>
                </button>
              ))}
            </div>
          )}

          {/* Network connections section */}
          {networkConns.length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>Network</div>
              {networkConns.map((conn, ni) => {
                const idx = drives.length + ni
                const pluginLabel = conn.pluginId === 'smb' ? 'SMB' : conn.pluginId === 's3' ? 'S3' : conn.pluginId.toUpperCase()
                return (
                  <button
                    key={`${conn.pluginId}-${conn.locationId}`}
                    className={`${styles.item} ${cursorIdx === idx ? styles.itemActive : ''}`}
                    onClick={() => handleSelect(allItems[idx])}
                    onMouseEnter={() => setCursorIdx(idx)}
                  >
                    <span className={styles.itemIcon}>{'\uD83C\uDF10'}</span>
                    <span className={styles.itemName}>{conn.label}</span>
                    <span className={styles.itemPath}>{pluginLabel}</span>
                  </button>
                )
              })}
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
              const idx = drives.length + networkConns.length + bi
              return (
                <button
                  key={bm.id}
                  className={`${styles.item} ${cursorIdx === idx ? styles.itemActive : ''}`}
                  onClick={() => handleSelect(allItems[idx])}
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
                className={`${styles.addBookmark} ${cursorIdx === drives.length + networkConns.length + bookmarks.length ? styles.itemActive : ''}`}
                onClick={() => {
                  setBookmarkName(currentLocation.split(/[\\/]/).pop() || currentLocation)
                  setAddingBookmark(true)
                }}
                onMouseEnter={() => setCursorIdx(drives.length + networkConns.length + bookmarks.length)}
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
