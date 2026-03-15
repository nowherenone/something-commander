import React, { useState, useCallback } from 'react'
import styles from '../../styles/dialogs.module.css'

interface SftpConnectProps {
  onClose: () => void
  onConnected: (connId: string) => void
}

export function SftpConnect({ onClose, onConnected }: SftpConnectProps): React.JSX.Element {
  const [host, setHost] = useState('')
  const [port, setPort] = useState('22')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleConnect = useCallback(async () => {
    if (!host || !username) return
    setConnecting(true)
    setError(null)

    try {
      const connId = await window.api.util.sftpConnect(host, parseInt(port) || 22, username, password || undefined)
      onConnected(connId)
    } catch (err) {
      setError(String(err))
    }
    setConnecting(false)
  }, [host, port, username, password, onConnected])

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()} style={{ width: 400 }}>
        <div className={styles.dialogTitle}>Connect to SFTP Server</div>
        <div className={styles.dialogBody}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={{ width: 80, fontSize: 12, color: 'var(--text-secondary)' }}>Host:</label>
              <input
                autoFocus
                value={host}
                onChange={(e) => setHost(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleConnect(); if (e.key === 'Escape') onClose() }}
                placeholder="hostname or IP"
                className={styles.settingsInput}
                style={{ flex: 1, width: 'auto' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={{ width: 80, fontSize: 12, color: 'var(--text-secondary)' }}>Port:</label>
              <input
                value={port}
                onChange={(e) => setPort(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleConnect(); if (e.key === 'Escape') onClose() }}
                placeholder="22"
                className={styles.settingsInput}
                style={{ width: 80 }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={{ width: 80, fontSize: 12, color: 'var(--text-secondary)' }}>Username:</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleConnect(); if (e.key === 'Escape') onClose() }}
                placeholder="user"
                className={styles.settingsInput}
                style={{ flex: 1, width: 'auto' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={{ width: 80, fontSize: 12, color: 'var(--text-secondary)' }}>Password:</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleConnect(); if (e.key === 'Escape') onClose() }}
                placeholder="password"
                className={styles.settingsInput}
                style={{ flex: 1, width: 'auto' }}
              />
            </div>
            {error && (
              <div style={{ color: 'var(--danger)', fontSize: 12, padding: '4px 0' }}>{error}</div>
            )}
          </div>
        </div>
        <div className={styles.dialogFooter}>
          <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={onClose}>Cancel</button>
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={handleConnect}
            disabled={connecting || !host || !username}
          >
            {connecting ? 'Connecting...' : 'Connect'}
          </button>
        </div>
      </div>
    </div>
  )
}
