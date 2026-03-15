import React, { useState, useCallback } from 'react'
import { formatSize } from '../../utils/format'
import styles from '../../styles/dialogs.module.css'

interface SearchResult {
  path: string
  name: string
  isDirectory: boolean
  size: number
}

interface SearchDialogProps {
  searchRoot: string
  onClose: () => void
  onNavigateTo: (path: string) => void
}

export function SearchDialog({
  searchRoot,
  onClose,
  onNavigateTo
}: SearchDialogProps): React.JSX.Element {
  const [pattern, setPattern] = useState('*')
  const [contentPattern, setContentPattern] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searched, setSearched] = useState(false)

  const handleSearch = useCallback(async () => {
    if (!pattern.trim()) return
    setIsSearching(true)
    setResults([])
    setSearched(true)

    try {
      const res = await window.api.util.searchFiles(
        searchRoot,
        pattern.trim(),
        contentPattern.trim()
      )
      setResults(res)
    } catch (err) {
      console.error('Search error:', err)
    }

    setIsSearching(false)
  }, [searchRoot, pattern, contentPattern])

  const handleGoTo = useCallback(
    (result: SearchResult) => {
      // Navigate to the parent directory of the result
      const parentPath = result.path.replace(/[\\/][^\\/]+$/, '')
      onNavigateTo(parentPath)
      onClose()
    },
    [onNavigateTo, onClose]
  )

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.dialog}
        style={{ width: '70vw', height: '70vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.dialogTitle}>Search Files</div>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <label style={{ color: 'var(--text-secondary)', fontSize: 12, width: 100 }}>
              File name:
            </label>
            <input
              autoFocus
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSearch()
                if (e.key === 'Escape') onClose()
              }}
              placeholder="*.txt, report*, etc."
              style={{
                flex: 1,
                padding: '4px 8px',
                background: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: 3,
                fontFamily: 'var(--font-family)',
                fontSize: 'var(--font-size-small)'
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <label style={{ color: 'var(--text-secondary)', fontSize: 12, width: 100 }}>
              Containing:
            </label>
            <input
              value={contentPattern}
              onChange={(e) => setContentPattern(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSearch()
                if (e.key === 'Escape') onClose()
              }}
              placeholder="Search within files (optional)"
              style={{
                flex: 1,
                padding: '4px 8px',
                background: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: 3,
                fontFamily: 'var(--font-family)',
                fontSize: 'var(--font-size-small)'
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 11, width: 100 }}>
              Search in: {searchRoot}
            </span>
            <button
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={handleSearch}
              disabled={isSearching}
              style={{ marginLeft: 'auto' }}
            >
              {isSearching ? 'Searching...' : 'Search'}
            </button>
          </div>
        </div>
        <div
          className={styles.dialogBody}
          style={{ padding: 0, overflow: 'auto', background: 'var(--bg-primary)' }}
        >
          {results.length === 0 && searched && !isSearching ? (
            <div
              style={{
                padding: 16,
                textAlign: 'center',
                color: 'var(--text-muted)'
              }}
            >
              No files found.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr
                  style={{
                    background: 'var(--bg-header)',
                    position: 'sticky',
                    top: 0
                  }}
                >
                  <th
                    style={{
                      textAlign: 'left',
                      padding: '4px 8px',
                      color: 'var(--text-secondary)',
                      fontWeight: 600
                    }}
                  >
                    Name
                  </th>
                  <th
                    style={{
                      textAlign: 'left',
                      padding: '4px 8px',
                      color: 'var(--text-secondary)',
                      fontWeight: 600
                    }}
                  >
                    Path
                  </th>
                  <th
                    style={{
                      textAlign: 'right',
                      padding: '4px 8px',
                      color: 'var(--text-secondary)',
                      fontWeight: 600,
                      width: 80
                    }}
                  >
                    Size
                  </th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr
                    key={i}
                    style={{ cursor: 'pointer' }}
                    onClick={() => handleGoTo(r)}
                    onMouseEnter={(e) =>
                      ((e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)')
                    }
                    onMouseLeave={(e) =>
                      ((e.currentTarget as HTMLElement).style.background = '')
                    }
                  >
                    <td
                      style={{
                        padding: '3px 8px',
                        color: r.isDirectory ? 'var(--accent)' : 'var(--text-primary)',
                        fontWeight: r.isDirectory ? 600 : 400
                      }}
                    >
                      {r.isDirectory ? '\uD83D\uDCC1 ' : '\uD83D\uDCC4 '}
                      {r.name}
                    </td>
                    <td
                      style={{
                        padding: '3px 8px',
                        color: 'var(--text-muted)',
                        fontSize: 11,
                        maxWidth: 400,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {r.path}
                    </td>
                    <td
                      style={{
                        padding: '3px 8px',
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--text-secondary)'
                      }}
                    >
                      {r.isDirectory ? '' : formatSize(r.size)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {isSearching && (
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)' }}>
              Searching...
            </div>
          )}
        </div>
        <div className={styles.dialogFooter}>
          <span style={{ color: 'var(--text-muted)', fontSize: 11, flex: 1 }}>
            {results.length} result{results.length !== 1 ? 's' : ''} | Click to navigate
          </span>
          <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
