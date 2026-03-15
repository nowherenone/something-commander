import React, { useState, useCallback, useEffect, useRef } from 'react'
import styles from '../../styles/menubar.module.css'

interface MenuAction {
  label: string
  shortcut?: string
  action: string
  separator?: boolean
}

interface MenuDef {
  label: string
  items: MenuAction[]
}

interface MenuBarProps {
  onAction: (action: string) => void
}

const MENUS: MenuDef[] = [
  {
    label: 'File',
    items: [
      { label: 'Open (Enter)', shortcut: 'Enter', action: 'open' },
      { label: 'View', shortcut: 'F3', action: 'view' },
      { label: 'Edit', shortcut: 'F4', action: 'edit' },
      { label: '', action: '', separator: true },
      { label: 'Copy', shortcut: 'F5', action: 'copy' },
      { label: 'Move', shortcut: 'F6', action: 'move' },
      { label: 'New Folder', shortcut: 'F7', action: 'mkdir' },
      { label: 'Delete', shortcut: 'F8', action: 'delete' },
      { label: '', action: '', separator: true },
      { label: 'Multi-Rename', shortcut: 'Ctrl+M', action: 'multiRename' },
      { label: '', action: '', separator: true },
      { label: 'Quit', shortcut: 'Alt+F4', action: 'quit' }
    ]
  },
  {
    label: 'View',
    items: [
      { label: 'Refresh', shortcut: 'Ctrl+R', action: 'refresh' },
      { label: 'Toggle Hidden', shortcut: 'Ctrl+H', action: 'toggleHidden' },
      { label: '', action: '', separator: true },
      { label: 'Compare Directories', shortcut: 'Ctrl+C', action: 'compare' },
      { label: 'Search', shortcut: 'Alt+F7', action: 'search' },
      { label: '', action: '', separator: true },
      { label: 'Drives & Bookmarks', shortcut: 'Ctrl+D', action: 'driveMenu' }
    ]
  },
  {
    label: 'Tabs',
    items: [
      { label: 'New Tab', shortcut: 'Ctrl+T', action: 'newTab' },
      { label: 'Close Tab', shortcut: 'Ctrl+W', action: 'closeTab' }
    ]
  },
  {
    label: 'Net',
    items: [
      { label: 'Connect SFTP...', action: 'sftpConnect' },
      { label: 'Disconnect SFTP', action: 'sftpDisconnect' }
    ]
  },
  {
    label: 'Tools',
    items: [
      { label: 'Plugin Manager', action: 'pluginManager' },
      { label: 'Command Line', action: 'toggleCommandLine' },
      { label: '', action: '', separator: true },
      { label: 'Settings', shortcut: 'F9', action: 'settings' }
    ]
  }
]

export function MenuBar({ onAction }: MenuBarProps): React.JSX.Element {
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const barRef = useRef<HTMLDivElement>(null)

  const handleMenuClick = useCallback((label: string) => {
    setOpenMenu((prev) => (prev === label ? null : label))
  }, [])

  const handleAction = useCallback(
    (action: string) => {
      setOpenMenu(null)
      onAction(action)
    },
    [onAction]
  )

  // Close on click outside
  useEffect(() => {
    if (!openMenu) return
    const handler = (e: MouseEvent): void => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpenMenu(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [openMenu])

  // Close on Escape
  useEffect(() => {
    if (!openMenu) return
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpenMenu(null)
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [openMenu])

  return (
    <div className={styles.menuBar} ref={barRef}>
      {MENUS.map((menu) => (
        <div key={menu.label} style={{ position: 'relative' }}>
          <button
            className={`${styles.menuItem} ${openMenu === menu.label ? styles.menuItemActive : ''}`}
            onClick={() => handleMenuClick(menu.label)}
            onMouseEnter={() => openMenu && setOpenMenu(menu.label)}
          >
            {menu.label}
          </button>
          {openMenu === menu.label && (
            <div className={styles.menuDropdown}>
              {menu.items.map((item, i) =>
                item.separator ? (
                  <div key={i} className={styles.menuSep} />
                ) : (
                  <button
                    key={item.action}
                    className={styles.menuAction}
                    onClick={() => handleAction(item.action)}
                  >
                    <span>{item.label}</span>
                    {item.shortcut && (
                      <span className={styles.menuShortcut}>{item.shortcut}</span>
                    )}
                  </button>
                )
              )}
            </div>
          )}
        </div>
      ))}
      <div className={styles.spacer} />
      <span className={styles.titleText}>Flemanager</span>
    </div>
  )
}
