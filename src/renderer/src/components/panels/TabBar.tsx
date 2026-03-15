import React from 'react'
import styles from '../../styles/tabs.module.css'

export interface TabInfo {
  id: string
  label: string
}

interface TabBarProps {
  tabs: TabInfo[]
  activeTabId: string
  onSelectTab: (tabId: string) => void
  onCloseTab: (tabId: string) => void
  onNewTab: () => void
}

export function TabBar({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab
}: TabBarProps): React.JSX.Element {
  return (
    <div className={styles.tabBar}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`${styles.tab} ${tab.id === activeTabId ? styles.tabActive : ''}`}
          onClick={() => onSelectTab(tab.id)}
          onMouseDown={(e) => {
            // Middle click to close
            if (e.button === 1) {
              e.preventDefault()
              if (tabs.length > 1) onCloseTab(tab.id)
            }
          }}
        >
          <span className={styles.tabName}>{tab.label}</span>
          {tabs.length > 1 && (
            <span
              className={styles.tabClose}
              onClick={(e) => {
                e.stopPropagation()
                onCloseTab(tab.id)
              }}
            >
              x
            </span>
          )}
        </button>
      ))}
      <button className={styles.tabNew} onClick={onNewTab} title="New tab (Ctrl+T)">
        +
      </button>
    </div>
  )
}
