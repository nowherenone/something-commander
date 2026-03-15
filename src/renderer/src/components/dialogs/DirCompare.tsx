import React, { useState, useCallback, useMemo } from 'react'
import type { Entry } from '@shared/types'
import { formatSize, formatDate } from '../../utils/format'
import dialogStyles from '../../styles/dialogs.module.css'
import styles from '../../styles/dircompare.module.css'

type CompareStatus = 'equal' | 'newer-left' | 'newer-right' | 'only-left' | 'only-right'

interface CompareItem {
  name: string
  isContainer: boolean
  status: CompareStatus
  leftSize: number
  rightSize: number
  leftDate: number
  rightDate: number
}

interface DirCompareProps {
  leftPath: string
  rightPath: string
  leftEntries: Entry[]
  rightEntries: Entry[]
  onClose: () => void
  onSyncLeftToRight: (names: string[]) => void
  onSyncRightToLeft: (names: string[]) => void
}

function compareEntries(left: Entry[], right: Entry[]): CompareItem[] {
  const leftMap = new Map(left.map((e) => [e.name, e]))
  const rightMap = new Map(right.map((e) => [e.name, e]))
  const allNames = new Set([...leftMap.keys(), ...rightMap.keys()])
  const items: CompareItem[] = []

  for (const name of allNames) {
    const l = leftMap.get(name)
    const r = rightMap.get(name)

    if (l && r) {
      let status: CompareStatus = 'equal'
      if (l.isContainer && r.isContainer) {
        status = 'equal'
      } else if (l.size !== r.size) {
        status = l.modifiedAt > r.modifiedAt ? 'newer-left' : 'newer-right'
      } else if (Math.abs(l.modifiedAt - r.modifiedAt) > 2000) {
        status = l.modifiedAt > r.modifiedAt ? 'newer-left' : 'newer-right'
      }
      items.push({
        name,
        isContainer: l.isContainer || r.isContainer,
        status,
        leftSize: l.size,
        rightSize: r.size,
        leftDate: l.modifiedAt,
        rightDate: r.modifiedAt
      })
    } else if (l) {
      items.push({
        name,
        isContainer: l.isContainer,
        status: 'only-left',
        leftSize: l.size,
        rightSize: -1,
        leftDate: l.modifiedAt,
        rightDate: 0
      })
    } else if (r) {
      items.push({
        name,
        isContainer: r.isContainer,
        status: 'only-right',
        leftSize: -1,
        rightSize: r.size,
        leftDate: 0,
        rightDate: r.modifiedAt
      })
    }
  }

  items.sort((a, b) => {
    if (a.isContainer && !b.isContainer) return -1
    if (!a.isContainer && b.isContainer) return 1
    return a.name.localeCompare(b.name)
  })

  return items
}

export function DirCompare({
  leftPath,
  rightPath,
  leftEntries,
  rightEntries,
  onClose,
  onSyncLeftToRight,
  onSyncRightToLeft
}: DirCompareProps): React.JSX.Element {
  const [showEqual, setShowEqual] = useState(true)

  const items = useMemo(
    () => compareEntries(leftEntries, rightEntries),
    [leftEntries, rightEntries]
  )

  const filtered = useMemo(
    () => (showEqual ? items : items.filter((i) => i.status !== 'equal')),
    [items, showEqual]
  )

  const stats = useMemo(() => {
    let equal = 0, newerLeft = 0, newerRight = 0, onlyLeft = 0, onlyRight = 0
    for (const i of items) {
      switch (i.status) {
        case 'equal': equal++; break
        case 'newer-left': newerLeft++; break
        case 'newer-right': newerRight++; break
        case 'only-left': onlyLeft++; break
        case 'only-right': onlyRight++; break
      }
    }
    return { equal, newerLeft, newerRight, onlyLeft, onlyRight, total: items.length }
  }, [items])

  const handleSyncToRight = useCallback(() => {
    const names = items
      .filter((i) => i.status === 'only-left' || i.status === 'newer-left')
      .map((i) => i.name)
    onSyncLeftToRight(names)
  }, [items, onSyncLeftToRight])

  const handleSyncToLeft = useCallback(() => {
    const names = items
      .filter((i) => i.status === 'only-right' || i.status === 'newer-right')
      .map((i) => i.name)
    onSyncRightToLeft(names)
  }, [items, onSyncRightToLeft])

  const getRowClass = (status: CompareStatus): string => {
    switch (status) {
      case 'equal': return styles.rowEqual
      case 'newer-left': return styles.rowNewer
      case 'newer-right': return styles.rowOlder
      case 'only-left': return styles.rowOnlyLeft
      case 'only-right': return styles.rowOnlyRight
    }
  }

  return (
    <div className={dialogStyles.overlay} onClick={onClose}>
      <div
        className={`${dialogStyles.dialog} ${styles.compareDialog}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={dialogStyles.dialogTitle}>
          Compare Directories
        </div>

        <div className={styles.toolbar}>
          <button
            className={`${styles.toolBtn} ${showEqual ? '' : styles.toolBtnActive}`}
            onClick={() => setShowEqual(!showEqual)}
          >
            {showEqual ? 'Hide Equal' : 'Show All'}
          </button>
          <button className={styles.toolBtn} onClick={handleSyncToRight}>
            Sync newer/missing →
          </button>
          <button className={styles.toolBtn} onClick={handleSyncToLeft}>
            ← Sync newer/missing
          </button>

          <div className={styles.legend}>
            <span className={styles.legendItem}>
              <span className={styles.legendDot} style={{ background: '#4caf50' }} /> Newer
            </span>
            <span className={styles.legendItem}>
              <span className={styles.legendDot} style={{ background: '#ff9800' }} /> Older
            </span>
            <span className={styles.legendItem}>
              <span className={styles.legendDot} style={{ background: '#2196f3' }} /> Left only
            </span>
            <span className={styles.legendItem}>
              <span className={styles.legendDot} style={{ background: '#e91e63' }} /> Right only
            </span>
          </div>
        </div>

        <div className={styles.stats}>
          <span>Total: {stats.total}</span>
          <span>Equal: {stats.equal}</span>
          <span style={{ color: '#4caf50' }}>Newer left: {stats.newerLeft}</span>
          <span style={{ color: '#ff9800' }}>Newer right: {stats.newerRight}</span>
          <span style={{ color: '#2196f3' }}>Only left: {stats.onlyLeft}</span>
          <span style={{ color: '#e91e63' }}>Only right: {stats.onlyRight}</span>
        </div>

        <div
          className={dialogStyles.dialogBody}
          style={{ padding: 0, overflow: 'auto', background: 'var(--bg-primary)' }}
        >
          <table className={styles.compareTable}>
            <thead>
              <tr>
                <th style={{ width: '30%' }}>Name</th>
                <th style={{ width: '10%' }}>Status</th>
                <th className={styles.sizeCell} style={{ width: '12%' }}>Left Size</th>
                <th style={{ width: '15%' }}>Left Date</th>
                <th className={styles.sizeCell} style={{ width: '12%' }}>Right Size</th>
                <th style={{ width: '15%' }}>Right Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.name} className={getRowClass(item.status)}>
                  <td>
                    {item.isContainer ? '\uD83D\uDCC1 ' : '\uD83D\uDCC4 '}
                    {item.name}
                  </td>
                  <td style={{ fontSize: 10 }}>
                    {item.status === 'equal' && '='}
                    {item.status === 'newer-left' && '\u2190 newer'}
                    {item.status === 'newer-right' && 'newer \u2192'}
                    {item.status === 'only-left' && '\u2190 only'}
                    {item.status === 'only-right' && 'only \u2192'}
                  </td>
                  <td className={styles.sizeCell}>
                    {item.leftSize >= 0 ? formatSize(item.leftSize) : '-'}
                  </td>
                  <td>{item.leftDate > 0 ? formatDate(item.leftDate) : '-'}</td>
                  <td className={styles.sizeCell}>
                    {item.rightSize >= 0 ? formatSize(item.rightSize) : '-'}
                  </td>
                  <td>{item.rightDate > 0 ? formatDate(item.rightDate) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={dialogStyles.dialogFooter}>
          <span style={{ flex: 1, color: 'var(--text-muted)', fontSize: 11 }}>
            Left: {leftPath} | Right: {rightPath}
          </span>
          <button className={`${dialogStyles.btn} ${dialogStyles.btnPrimary}`} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
