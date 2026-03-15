import React, { useState, useMemo, useCallback } from 'react'
import type { Entry } from '@shared/types'
import styles from '../../styles/dialogs.module.css'

interface MultiRenameProps {
  entries: Entry[]
  pluginId: string
  onClose: () => void
  onDone: () => void
}

export function MultiRename({
  entries,
  pluginId,
  onClose,
  onDone
}: MultiRenameProps): React.JSX.Element {
  const [searchPattern, setSearchPattern] = useState('')
  const [replacePattern, setReplacePattern] = useState('')
  const [useRegex, setUseRegex] = useState(false)
  const [counter, setCounter] = useState(1)
  const [counterPad, setCounterPad] = useState(1)
  const [caseMode, setCaseMode] = useState<'none' | 'upper' | 'lower' | 'title'>('none')
  const [isApplying, setIsApplying] = useState(false)

  const previews = useMemo(() => {
    return entries.map((entry, index) => {
      let newName = entry.name

      // Search & replace
      if (searchPattern) {
        try {
          if (useRegex) {
            newName = newName.replace(new RegExp(searchPattern, 'g'), replacePattern)
          } else {
            newName = newName.split(searchPattern).join(replacePattern)
          }
        } catch {
          // Invalid regex, skip
        }
      }

      // Counter replacement [C]
      if (newName.includes('[C]')) {
        const num = (counter + index).toString().padStart(counterPad, '0')
        newName = newName.replace(/\[C\]/g, num)
      }

      // Case conversion
      switch (caseMode) {
        case 'upper':
          newName = newName.toUpperCase()
          break
        case 'lower':
          newName = newName.toLowerCase()
          break
        case 'title':
          newName = newName.replace(
            /\w\S*/g,
            (txt) => txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase()
          )
          break
      }

      return { entry, oldName: entry.name, newName, changed: newName !== entry.name }
    })
  }, [entries, searchPattern, replacePattern, useRegex, counter, counterPad, caseMode])

  const changedCount = previews.filter((p) => p.changed).length

  const handleApply = useCallback(async () => {
    setIsApplying(true)
    const toRename = previews.filter((p) => p.changed)

    for (const { entry, newName } of toRename) {
      try {
        await window.api.plugins.executeOperation(pluginId, {
          op: 'rename',
          entry,
          newName
        })
      } catch (err) {
        console.error('Rename error:', err)
      }
    }

    setIsApplying(false)
    onDone()
  }, [previews, pluginId, onDone])

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.dialog}
        style={{ width: '75vw', height: '75vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.dialogTitle}>Multi-Rename Tool (Ctrl+M)</div>

        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8
          }}
        >
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <label style={{ color: 'var(--text-secondary)', fontSize: 12, width: 80 }}>
              Search:
            </label>
            <input
              autoFocus
              value={searchPattern}
              onChange={(e) => setSearchPattern(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
              placeholder="Text to find"
              style={{
                flex: 1,
                padding: '4px 8px',
                background: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: 3,
                fontFamily: 'var(--font-mono)',
                fontSize: 12
              }}
            />
            <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', gap: 4, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={useRegex}
                onChange={(e) => setUseRegex(e.target.checked)}
                style={{ accentColor: 'var(--accent)' }}
              />
              Regex
            </label>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <label style={{ color: 'var(--text-secondary)', fontSize: 12, width: 80 }}>
              Replace:
            </label>
            <input
              value={replacePattern}
              onChange={(e) => setReplacePattern(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
              placeholder="Replacement ([C] = counter)"
              style={{
                flex: 1,
                padding: '4px 8px',
                background: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: 3,
                fontFamily: 'var(--font-mono)',
                fontSize: 12
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <label style={{ color: 'var(--text-secondary)', fontSize: 12, width: 80 }}>
              Case:
            </label>
            <select
              value={caseMode}
              onChange={(e) => setCaseMode(e.target.value as typeof caseMode)}
              className={styles.settingsSelect}
              style={{ width: 100 }}
            >
              <option value="none">No change</option>
              <option value="upper">UPPER</option>
              <option value="lower">lower</option>
              <option value="title">Title Case</option>
            </select>
            <label style={{ color: 'var(--text-secondary)', fontSize: 12, marginLeft: 16 }}>
              Counter start:
            </label>
            <input
              type="number"
              value={counter}
              onChange={(e) => setCounter(Number(e.target.value))}
              className={styles.settingsInput}
              style={{ width: 60 }}
              min={0}
            />
            <label style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Digits:</label>
            <input
              type="number"
              value={counterPad}
              onChange={(e) => setCounterPad(Number(e.target.value))}
              className={styles.settingsInput}
              style={{ width: 50 }}
              min={1}
              max={10}
            />
          </div>
        </div>

        <div className={styles.dialogBody} style={{ padding: 0, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg-header)', position: 'sticky', top: 0 }}>
                <th
                  style={{
                    textAlign: 'left',
                    padding: '4px 12px',
                    color: 'var(--text-secondary)',
                    fontWeight: 600,
                    width: '45%'
                  }}
                >
                  Old Name
                </th>
                <th style={{ width: 20 }}></th>
                <th
                  style={{
                    textAlign: 'left',
                    padding: '4px 12px',
                    color: 'var(--text-secondary)',
                    fontWeight: 600,
                    width: '45%'
                  }}
                >
                  New Name
                </th>
              </tr>
            </thead>
            <tbody>
              {previews.map((p, i) => (
                <tr
                  key={i}
                  style={{
                    background: p.changed ? 'rgba(45, 114, 210, 0.1)' : 'transparent'
                  }}
                >
                  <td
                    style={{
                      padding: '3px 12px',
                      color: 'var(--text-secondary)',
                      fontFamily: 'var(--font-mono)'
                    }}
                  >
                    {p.oldName}
                  </td>
                  <td style={{ color: 'var(--text-muted)', textAlign: 'center' }}>
                    {p.changed ? '\u2192' : ''}
                  </td>
                  <td
                    style={{
                      padding: '3px 12px',
                      color: p.changed ? 'var(--accent)' : 'var(--text-muted)',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: p.changed ? 600 : 400
                    }}
                  >
                    {p.newName}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={styles.dialogFooter}>
          <span style={{ color: 'var(--text-muted)', fontSize: 11, flex: 1 }}>
            {changedCount} of {entries.length} file{entries.length !== 1 ? 's' : ''} will be renamed
          </span>
          <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={onClose}>
            Cancel
          </button>
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={handleApply}
            disabled={changedCount === 0 || isApplying}
          >
            {isApplying ? 'Renaming...' : `Rename ${changedCount} files`}
          </button>
        </div>
      </div>
    </div>
  )
}
