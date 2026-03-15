import React from 'react'
import { useAppStore } from '../../stores/app-store'
import { usePanelStore } from '../../stores/panel-store'
import { formatSize } from '../../utils/format'

export function BottomStatusBar(): React.JSX.Element {
  const activePanel = useAppStore((s) => s.activePanel)
  const getActiveTab = usePanelStore((s) => s.getActiveTab)
  const tab = getActiveTab(activePanel)

  const totalSize = tab.entries.reduce((sum, e) => sum + (e.size > 0 ? e.size : 0), 0)
  const fileCount = tab.entries.filter((e) => !e.isContainer).length
  const dirCount = tab.entries.filter((e) => e.isContainer).length
  const selectedCount = tab.selectedEntryIds.size
  let selectedSize = 0
  for (const e of tab.entries) {
    if (tab.selectedEntryIds.has(e.id) && e.size > 0) selectedSize += e.size
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 22,
        padding: '0 12px',
        background: 'var(--bg-secondary)',
        borderTop: '1px solid var(--border-color)',
        fontSize: 11,
        color: 'var(--text-muted)',
        flexShrink: 0
      }}
    >
      <span>
        {fileCount} file{fileCount !== 1 ? 's' : ''}, {dirCount} dir{dirCount !== 1 ? 's' : ''}
        {' | '}{formatSize(totalSize)}
      </span>
      {selectedCount > 0 && (
        <span style={{ color: 'var(--accent)' }}>
          {selectedCount} selected ({formatSize(selectedSize)})
        </span>
      )}
      <span>{tab.locationDisplay}</span>
    </div>
  )
}
