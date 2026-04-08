import React, { useState, useCallback, useEffect } from 'react'
import styles from '../../styles/dialogs.module.css'

interface SavedSmbConnection {
  host: string
  share: string
  username: string
  password: string
  domain: string
  label: string
}

interface SmbConnectProps {
  onClose: () => void
  onConnected: (connId: string) => void
}

export function SmbConnect({ onClose, onConnected }: SmbConnectProps): React.JSX.Element {
  const [host, setHost] = useState('')
  const [share, setShare] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [domain, setDomain] = useState('')
  const [label, setLabel] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedConnections, setSavedConnections] = useState<SavedSmbConnection[]>([])
  const [saveConnection, setSaveConnection] = useState(true)

  useEffect(() => {
    window.api.store.get('smb-connections').then((data) => {
      if (Array.isArray(data)) setSavedConnections(data as SavedSmbConnection[])
    })
  }, [])

  const loadSaved = useCallback((conn: SavedSmbConnection) => {
    setHost(conn.host)
    setShare(conn.share)
    setUsername(conn.username)
    setPassword(conn.password)
    setDomain(conn.domain)
    setLabel(conn.label)
  }, [])

  const removeSaved = useCallback(async (index: number) => {
    const updated = savedConnections.filter((_, i) => i !== index)
    setSavedConnections(updated)
    await window.api.store.set('smb-connections', updated)
  }, [savedConnections])

  const handleConnect = useCallback(async () => {
    if (!host || !share || !username) return
    setConnecting(true)
    setError(null)

    // Save connection details before attempting (so they persist even on failure)
    if (saveConnection) {
      const entry: SavedSmbConnection = { host, share, username, password, domain, label }
      const existing = savedConnections.findIndex(
        (c) => c.host === host && c.share === share && c.username === username
      )
      let updated: SavedSmbConnection[]
      if (existing >= 0) {
        updated = [...savedConnections]
        updated[existing] = entry
      } else {
        updated = [...savedConnections, entry]
      }
      setSavedConnections(updated)
      await window.api.store.set('smb-connections', updated)
    }

    try {
      const connId = await window.api.util.smbConnect(host, share, username, password, domain || undefined, label || undefined)
      onConnected(connId)
    } catch (err) {
      setError(String(err))
    }
    setConnecting(false)
  }, [host, share, username, password, domain, label, saveConnection, savedConnections, onConnected])

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()} style={{ width: 480 }}>
        <div className={styles.dialogTitle}>Connect to SMB Share</div>
        <div className={styles.dialogBody}>
          {savedConnections.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Saved connections:</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 120, overflowY: 'auto' }}>
                {savedConnections.map((conn, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button
                      className={`${styles.btn} ${styles.btnSecondary}`}
                      style={{ flex: 1, textAlign: 'left', padding: '3px 8px', fontSize: 12 }}
                      onClick={() => loadSaved(conn)}
                    >
                      {conn.label || `\\\\${conn.host}\\${conn.share}`} ({conn.username}{conn.domain ? `@${conn.domain}` : ''})
                    </button>
                    <button
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px 6px', fontSize: 14 }}
                      onClick={() => removeSaved(i)}
                      title="Remove"
                    >x</button>
                  </div>
                ))}
              </div>
              <div style={{ borderBottom: '1px solid var(--border-color)', margin: '8px 0' }} />
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={{ width: 100, fontSize: 12, color: 'var(--text-secondary)' }}>Host:</label>
              <input autoFocus value={host} onChange={(e) => setHost(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleConnect(); if (e.key === 'Escape') onClose() }}
                placeholder="192.168.1.100 or server.local" className={styles.settingsInput} style={{ flex: 1, width: 'auto' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={{ width: 100, fontSize: 12, color: 'var(--text-secondary)' }}>Share:</label>
              <input value={share} onChange={(e) => setShare(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleConnect(); if (e.key === 'Escape') onClose() }}
                placeholder="shared-folder" className={styles.settingsInput} style={{ flex: 1, width: 'auto' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={{ width: 100, fontSize: 12, color: 'var(--text-secondary)' }}>Username:</label>
              <input value={username} onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleConnect(); if (e.key === 'Escape') onClose() }}
                placeholder="user" className={styles.settingsInput} style={{ flex: 1, width: 'auto' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={{ width: 100, fontSize: 12, color: 'var(--text-secondary)' }}>Password:</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleConnect(); if (e.key === 'Escape') onClose() }}
                placeholder="password" className={styles.settingsInput} style={{ flex: 1, width: 'auto' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={{ width: 100, fontSize: 12, color: 'var(--text-secondary)' }}>Domain:</label>
              <input value={domain} onChange={(e) => setDomain(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleConnect(); if (e.key === 'Escape') onClose() }}
                placeholder="optional (e.g. WORKGROUP)" className={styles.settingsInput} style={{ flex: 1, width: 'auto' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={{ width: 100, fontSize: 12, color: 'var(--text-secondary)' }}>Label:</label>
              <input value={label} onChange={(e) => setLabel(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleConnect(); if (e.key === 'Escape') onClose() }}
                placeholder="optional display name" className={styles.settingsInput} style={{ flex: 1, width: 'auto' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={{ width: 100, fontSize: 12, color: 'var(--text-secondary)' }}>Remember:</label>
              <input type="checkbox" checked={saveConnection} onChange={(e) => setSaveConnection(e.target.checked)} />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Save this connection</span>
            </div>
            {error && <div style={{ color: 'var(--danger)', fontSize: 12, padding: '4px 0' }}>{error}</div>}
          </div>
        </div>
        <div className={styles.dialogFooter}>
          <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={onClose}>Cancel</button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleConnect}
            disabled={connecting || !host || !share || !username}>
            {connecting ? 'Connecting...' : 'Connect'}
          </button>
        </div>
      </div>
    </div>
  )
}
