import React, { useState, useCallback } from 'react'
import styles from '../../styles/dialogs.module.css'

interface S3ConnectProps {
  onClose: () => void
  onConnected: (connId: string) => void
}

export function S3Connect({ onClose, onConnected }: S3ConnectProps): React.JSX.Element {
  const [bucket, setBucket] = useState('')
  const [region, setRegion] = useState('us-east-1')
  const [accessKeyId, setAccessKeyId] = useState('')
  const [secretAccessKey, setSecretAccessKey] = useState('')
  const [label, setLabel] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleConnect = useCallback(async () => {
    if (!bucket || !accessKeyId || !secretAccessKey) return
    setConnecting(true)
    setError(null)
    try {
      const connId = await window.api.util.s3Connect(bucket, region, accessKeyId, secretAccessKey, label || undefined)
      onConnected(connId)
    } catch (err) {
      setError(String(err))
    }
    setConnecting(false)
  }, [bucket, region, accessKeyId, secretAccessKey, label, onConnected])

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()} style={{ width: 420 }}>
        <div className={styles.dialogTitle}>Connect to AWS S3</div>
        <div className={styles.dialogBody}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={{ width: 100, fontSize: 12, color: 'var(--text-secondary)' }}>Bucket:</label>
              <input autoFocus value={bucket} onChange={(e) => setBucket(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleConnect(); if (e.key === 'Escape') onClose() }}
                placeholder="my-bucket" className={styles.settingsInput} style={{ flex: 1, width: 'auto' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={{ width: 100, fontSize: 12, color: 'var(--text-secondary)' }}>Region:</label>
              <input value={region} onChange={(e) => setRegion(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleConnect(); if (e.key === 'Escape') onClose() }}
                placeholder="us-east-1" className={styles.settingsInput} style={{ flex: 1, width: 'auto' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={{ width: 100, fontSize: 12, color: 'var(--text-secondary)' }}>Access Key:</label>
              <input value={accessKeyId} onChange={(e) => setAccessKeyId(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleConnect(); if (e.key === 'Escape') onClose() }}
                placeholder="AKIA..." className={styles.settingsInput} style={{ flex: 1, width: 'auto' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={{ width: 100, fontSize: 12, color: 'var(--text-secondary)' }}>Secret Key:</label>
              <input type="password" value={secretAccessKey} onChange={(e) => setSecretAccessKey(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleConnect(); if (e.key === 'Escape') onClose() }}
                placeholder="secret" className={styles.settingsInput} style={{ flex: 1, width: 'auto' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={{ width: 100, fontSize: 12, color: 'var(--text-secondary)' }}>Label:</label>
              <input value={label} onChange={(e) => setLabel(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleConnect(); if (e.key === 'Escape') onClose() }}
                placeholder="optional display name" className={styles.settingsInput} style={{ flex: 1, width: 'auto' }} />
            </div>
            {error && <div style={{ color: 'var(--danger)', fontSize: 12, padding: '4px 0' }}>{error}</div>}
          </div>
        </div>
        <div className={styles.dialogFooter}>
          <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={onClose}>Cancel</button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleConnect}
            disabled={connecting || !bucket || !accessKeyId || !secretAccessKey}>
            {connecting ? 'Connecting...' : 'Connect'}
          </button>
        </div>
      </div>
    </div>
  )
}
