import React, { useState, useCallback, useEffect, useRef } from 'react'
import { useAppStore } from '../../stores/app-store'
import { usePanelStore } from '../../stores/panel-store'
import { useSettingsStore } from '../../stores/settings-store'
import styles from '../../styles/menubar.module.css'

declare const __APP_VERSION__: string

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
      { label: 'Rename', shortcut: 'F2', action: 'rename' },
      { label: 'Delete', shortcut: 'F8', action: 'delete' },
      { label: '', action: '', separator: true },
      { label: 'Pack to ZIP', shortcut: 'Alt+F5', action: 'pack' },
      { label: 'Unpack ZIP', shortcut: 'Alt+F9', action: 'unpack' },
      { label: '', action: '', separator: true },
      { label: 'Quit', shortcut: 'Alt+F4', action: 'quit' }
    ]
  },
  {
    label: 'Mark',
    items: [
      { label: 'Select Group...', shortcut: 'Num +', action: 'selectGroup' },
      { label: 'Unselect Group...', shortcut: 'Num -', action: 'unselectGroup' },
      { label: '', action: '', separator: true },
      { label: 'Select All', shortcut: 'Ctrl Num +', action: 'selectAll' },
      { label: 'Unselect All', shortcut: 'Ctrl Num -', action: 'deselectAll' },
      { label: '', action: '', separator: true },
      { label: 'Invert Selection', shortcut: 'Num *', action: 'invertSelection' },
      { label: 'Select All With Same Extension', shortcut: 'Alt Num +', action: 'selectSameExt' }
    ]
  },
  {
    label: 'View',
    items: [
      { label: 'Brief (File List)', shortcut: 'Ctrl+1', action: 'viewBrief' },
      { label: 'Tree', shortcut: 'Ctrl+2', action: 'viewTree' },
      { label: 'Info', shortcut: 'Ctrl+3', action: 'viewInfo' },
      { label: 'Quick View', shortcut: 'Ctrl+Q', action: 'viewQuickview' },
      { label: '', action: '', separator: true },
      { label: 'Refresh', shortcut: 'Ctrl+R', action: 'refresh' },
      { label: 'Toggle Hidden Files', shortcut: 'Ctrl+H', action: 'toggleHidden' },
      { label: '', action: '', separator: true },
      { label: 'Command Line', action: 'toggleCommandLine' },
      { label: 'Function Key Bar', action: 'setBottomFnkeys' },
      { label: '', action: '', separator: true },
      { label: 'New Tab', shortcut: 'Ctrl+T', action: 'newTab' },
      { label: 'Close Tab', shortcut: 'Ctrl+W', action: 'closeTab' },
      { label: '', action: '', separator: true },
      { label: 'Drives & Bookmarks', shortcut: 'Ctrl+D', action: 'driveMenu' }
    ]
  },
  {
    label: 'Tools',
    items: [
      { label: 'Search', shortcut: 'Alt+F7', action: 'search' },
      { label: 'Compare Directories', shortcut: 'Ctrl+C', action: 'compare' },
      { label: 'Multi-Rename', shortcut: 'Ctrl+M', action: 'multiRename' },
      { label: '', action: '', separator: true },
      { label: 'Network Connections...', action: 'networkConnections' },
      { label: '', action: '', separator: true },
      { label: 'Plugin Manager', action: 'pluginManager' },
      { label: '', action: '', separator: true },
      { label: 'Check for Updates...', action: 'checkForUpdates' },
      { label: '', action: '', separator: true },
      { label: 'Settings', shortcut: 'F9', action: 'settings' }
    ]
  }
]

export function MenuBar({ onAction }: MenuBarProps): React.JSX.Element {
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [versionMenuOpen, setVersionMenuOpen] = useState(false)
  const barRef = useRef<HTMLDivElement>(null)

  const activePanel = useAppStore((s) => s.activePanel)
  const viewMode = useAppStore((s) => activePanel === 'left' ? s.leftViewMode : s.rightViewMode)
  const tab = usePanelStore((s) => s.getActiveTab(activePanel))
  const showHidden = tab.showHidden
  const { showCommandLine, bottomBar } = useSettingsStore()

  const getChecked = useCallback((action: string): boolean => {
    switch (action) {
      case 'viewBrief': return viewMode === 'brief'
      case 'viewTree': return viewMode === 'tree'
      case 'viewInfo': return viewMode === 'info'
      case 'viewQuickview': return viewMode === 'quickview'
      case 'toggleHidden': return showHidden
      case 'toggleCommandLine': return showCommandLine
      case 'setBottomFnkeys': return bottomBar === 'fnkeys'
      default: return false
    }
  }, [viewMode, showHidden, showCommandLine, bottomBar])

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
    if (!openMenu && !versionMenuOpen) return
    const handler = (e: MouseEvent): void => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpenMenu(null)
        setVersionMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [openMenu, versionMenuOpen])

  // Close on Escape
  useEffect(() => {
    if (!openMenu && !versionMenuOpen) return
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setOpenMenu(null)
        setVersionMenuOpen(false)
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [openMenu, versionMenuOpen])

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
                    <span>{getChecked(item.action) ? '✓ ' : ''}{item.label}</span>
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
      <div style={{ position: 'relative' }}>
        <button
          className={`${styles.menuItem} ${versionMenuOpen ? styles.menuItemActive : ''}`}
          onClick={() => {
            setOpenMenu(null)
            setVersionMenuOpen(!versionMenuOpen)
          }}
          title="Version and updates"
        >
          v{__APP_VERSION__}
        </button>
        {versionMenuOpen && (
          <div className={styles.menuDropdown} style={{ right: 0, left: 'auto' }}>
            <button
              className={styles.menuAction}
              onClick={() => {
                setVersionMenuOpen(false)
                onAction('checkForUpdates')
              }}
            >
              <span>Check for Updates...</span>
            </button>
            <div className={styles.menuSep} />
            <button
              className={styles.menuAction}
              onClick={() => {
                setVersionMenuOpen(false)
                onAction('about')
              }}
            >
              <span>About</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
