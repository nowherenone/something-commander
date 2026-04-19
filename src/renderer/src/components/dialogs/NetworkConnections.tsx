import React, { useState, useCallback, useEffect } from 'react'
import { Modal } from '../primitives/Modal'
import { FormRow } from '../primitives/FormRow'
import styles from '../../styles/dialogs.module.css'

type ConnectionType = 'sftp' | 's3' | 'smb'

interface ActiveConnection {
  pluginId: string
  connId: string
  label: string
  locationId: string
}

interface SavedSmb {
  host: string
  share: string
  username: string
  password: string
  domain: string
  label: string
}

interface NetworkConnectionsProps {
  onClose: () => void
  onConnected: (pluginId: string, locationId: string) => void
}

export function NetworkConnections({ onClose, onConnected }: NetworkConnectionsProps): React.JSX.Element {
  const [activeConns, setActiveConns] = useState<ActiveConnection[]>([])
  const [addingType, setAddingType] = useState<ConnectionType | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)

  // Form fields (shared across types)
  const [host, setHost] = useState('')
  const [port, setPort] = useState('22')
  const [share, setShare] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [domain, setDomain] = useState('')
  const [label, setLabel] = useState('')
  // S3 fields
  const [bucket, setBucket] = useState('')
  const [region, setRegion] = useState('us-east-1')
  const [accessKeyId, setAccessKeyId] = useState('')
  const [secretAccessKey, setSecretAccessKey] = useState('')
  const [saveConnection, setSaveConnection] = useState(true)

  // Saved SMB connections
  const [savedSmb, setSavedSmb] = useState<SavedSmb[]>([])

  const loadConnections = useCallback(async () => {
    const plugins: ConnectionType[] = ['sftp', 's3', 'smb']
    const results = await Promise.all(
      plugins.map((pluginId) =>
        window.api.plugins.readDirectory(pluginId, null).then((result) =>
          result.entries.map((e) => ({
            pluginId,
            connId: e.id.replace(/[:/]+$/, ''),
            label: e.name,
            locationId: e.id
          }))
        ).catch(() => [] as ActiveConnection[])
      )
    )
    setActiveConns(results.flat())

    const saved = await window.api.store.get('smb-connections')
    if (Array.isArray(saved)) setSavedSmb(saved as SavedSmb[])
  }, [])

  useEffect(() => { loadConnections() }, [loadConnections])

  const resetForm = useCallback(() => {
    setHost(''); setPort('22'); setShare(''); setUsername(''); setPassword('')
    setDomain(''); setLabel(''); setBucket(''); setRegion('us-east-1')
    setAccessKeyId(''); setSecretAccessKey(''); setError(null)
    setSaveConnection(true)
  }, [])

  const handleAdd = useCallback((type: ConnectionType) => {
    resetForm()
    setAddingType(type)
  }, [resetForm])

  const handleConnect = useCallback(async () => {
    setConnecting(true)
    setError(null)
    try {
      let connId: string
      let locationId: string
      const pluginId: string = addingType!

      switch (addingType) {
        case 'sftp':
          connId = await window.api.util.sftpConnect(host, parseInt(port) || 22, username, password || undefined)
          locationId = `${connId}::/`
          break
        case 's3':
          connId = await window.api.util.s3Connect(bucket, region, accessKeyId, secretAccessKey, label || undefined)
          locationId = `${connId}::`
          break
        case 'smb': {
          // Save before connecting
          if (saveConnection) {
            const entry: SavedSmb = { host, share, username, password, domain, label }
            const existing = savedSmb.findIndex((c) => c.host === host && c.share === share && c.username === username)
            const updated = existing >= 0
              ? savedSmb.map((c, i) => i === existing ? entry : c)
              : [...savedSmb, entry]
            setSavedSmb(updated)
            await window.api.store.set('smb-connections', updated)
          }
          connId = await window.api.util.smbConnect(host, share, username, password, domain || undefined, label || undefined)
          locationId = `${connId}/`
          break
        }
        default:
          throw new Error('Unknown connection type')
      }

      setAddingType(null)
      await loadConnections()
      onConnected(pluginId, locationId)
    } catch (err) {
      setError(String(err))
    }
    setConnecting(false)
  }, [addingType, host, port, share, username, password, domain, label, bucket, region, accessKeyId, secretAccessKey, saveConnection, savedSmb, loadConnections, onConnected])

  const handleDisconnect = useCallback(async (conn: ActiveConnection) => {
    try {
      switch (conn.pluginId) {
        case 'sftp':
          await window.api.util.sftpDisconnect(conn.connId)
          break
        case 's3':
          await window.api.util.s3Disconnect(conn.connId)
          break
        case 'smb':
          await window.api.util.smbDisconnect(conn.connId)
          break
      }
    } catch { /* ignore */ }
    await loadConnections()
  }, [loadConnections])

  const handleRemoveSaved = useCallback(async (index: number) => {
    const updated = savedSmb.filter((_, i) => i !== index)
    setSavedSmb(updated)
    await window.api.store.set('smb-connections', updated)
  }, [savedSmb])

  const handleLoadSaved = useCallback((conn: SavedSmb) => {
    setHost(conn.host); setShare(conn.share); setUsername(conn.username)
    setPassword(conn.password); setDomain(conn.domain); setLabel(conn.label)
    setAddingType('smb')
  }, [])

  const pluginLabel = (id: string): string =>
    id === 'sftp' ? 'SFTP' : id === 's3' ? 'S3' : id === 'smb' ? 'SMB' : id.toUpperCase()

  const canConnect = addingType === 'sftp' ? !!(host && username)
    : addingType === 's3' ? !!(bucket && accessKeyId && secretAccessKey)
    : addingType === 'smb' ? !!(host && share && username)
    : false

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter' && canConnect) handleConnect()
    if (e.key === 'Escape') {
      if (addingType) setAddingType(null)
      else onClose()
    }
  }

  return (
    <Modal
      onClose={onClose}
      title="Network Connections"
      width={520}
      closeOnEscape={false}
      dialogStyle={{ maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
      bodyStyle={{ flex: 1, overflowY: 'auto' }}
      footer={<button className={`${styles.btn} ${styles.btnSecondary}`} onClick={onClose}>Close</button>}
    >
      {/* Active connections */}
      {activeConns.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Active Connections</div>
          {activeConns.map((conn) => (
            <div key={`${conn.pluginId}-${conn.connId}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
              <span style={{ fontSize: 12, color: 'var(--accent)', width: 36 }}>{pluginLabel(conn.pluginId)}</span>
              <span style={{ flex: 1, fontSize: 12, color: 'var(--text-primary)' }}>{conn.label}</span>
              <button
                className={`${styles.btn} ${styles.btnSecondary}`}
                style={{ padding: '2px 8px', fontSize: 11 }}
                onClick={() => { onConnected(conn.pluginId, conn.locationId) }}
              >Open</button>
              <button
                className={`${styles.btn} ${styles.btnSecondary}`}
                style={{ padding: '2px 8px', fontSize: 11, color: 'var(--danger)' }}
                onClick={() => handleDisconnect(conn)}
              >Disconnect</button>
            </div>
          ))}
        </div>
      )}

      {/* Saved SMB connections (not currently active) */}
      {savedSmb.filter((s) => !activeConns.some((a) => a.pluginId === 'smb' && a.connId === `${s.username}@${s.host}/${s.share}`)).length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Saved Connections</div>
          {savedSmb.map((conn, i) => {
            const connId = `${conn.username}@${conn.host}/${conn.share}`
            const isActive = activeConns.some((a) => a.pluginId === 'smb' && a.connId === connId)
            if (isActive) return null
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 36 }}>SMB</span>
                <span style={{ flex: 1, fontSize: 12, color: 'var(--text-primary)' }}>
                  {conn.label || `\\\\${conn.host}\\${conn.share}`}
                </span>
                <button
                  className={`${styles.btn} ${styles.btnSecondary}`}
                  style={{ padding: '2px 8px', fontSize: 11 }}
                  onClick={() => handleLoadSaved(conn)}
                >Connect</button>
                <button
                  className={`${styles.btn} ${styles.btnSecondary}`}
                  style={{ padding: '2px 8px', fontSize: 11, color: 'var(--danger)' }}
                  onClick={() => handleRemoveSaved(i)}
                >Remove</button>
              </div>
            )
          })}
        </div>
      )}

      {/* No connections at all */}
      {activeConns.length === 0 && savedSmb.length === 0 && !addingType && (
        <div style={{ padding: '12px 0', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
          No connections yet. Add one below.
        </div>
      )}

      {/* Add new connection form */}
      {addingType ? (
        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
            New {pluginLabel(addingType)} Connection
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {addingType === 'sftp' && (
              <>
                <FormRow label="Host:" value={host} onChange={setHost} onKeyDown={onKeyDown} autoFocus placeholder="hostname or IP" />
                <FormRow label="Port:" value={port} onChange={setPort} onKeyDown={onKeyDown} placeholder="22" inputWidth={80} />
                <FormRow label="Username:" value={username} onChange={setUsername} onKeyDown={onKeyDown} placeholder="user" />
                <FormRow label="Password:" value={password} onChange={setPassword} onKeyDown={onKeyDown} placeholder="password" type="password" />
              </>
            )}
            {addingType === 's3' && (
              <>
                <FormRow label="Bucket:" value={bucket} onChange={setBucket} onKeyDown={onKeyDown} autoFocus placeholder="my-bucket" />
                <FormRow label="Region:" value={region} onChange={setRegion} onKeyDown={onKeyDown} placeholder="us-east-1" />
                <FormRow label="Access Key:" value={accessKeyId} onChange={setAccessKeyId} onKeyDown={onKeyDown} placeholder="AKIA..." />
                <FormRow label="Secret Key:" value={secretAccessKey} onChange={setSecretAccessKey} onKeyDown={onKeyDown} placeholder="secret" type="password" />
                <FormRow label="Label:" value={label} onChange={setLabel} onKeyDown={onKeyDown} placeholder="optional" />
              </>
            )}
            {addingType === 'smb' && (
              <>
                <FormRow label="Host:" value={host} onChange={setHost} onKeyDown={onKeyDown} autoFocus placeholder="192.168.1.100" />
                <FormRow label="Share:" value={share} onChange={setShare} onKeyDown={onKeyDown} placeholder="shared-folder" />
                <FormRow label="Username:" value={username} onChange={setUsername} onKeyDown={onKeyDown} placeholder="user" />
                <FormRow label="Password:" value={password} onChange={setPassword} onKeyDown={onKeyDown} placeholder="password" type="password" />
                <FormRow label="Domain:" value={domain} onChange={setDomain} onKeyDown={onKeyDown} placeholder="optional" />
                <FormRow label="Label:" value={label} onChange={setLabel} onKeyDown={onKeyDown} placeholder="optional" />
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 100 }}>
                  <input type="checkbox" checked={saveConnection} onChange={(e) => setSaveConnection(e.target.checked)} />
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Remember this connection</span>
                </div>
              </>
            )}
            {error && <div style={{ color: 'var(--danger)', fontSize: 12, padding: '4px 0' }}>{error}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => setAddingType(null)}>Back</button>
              <button
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={handleConnect}
                disabled={connecting || !canConnect}
              >
                {connecting ? 'Connecting...' : 'Connect'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>Add Connection</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => handleAdd('smb')}>+ SMB / Samba</button>
            <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => handleAdd('sftp')}>+ SFTP</button>
            <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => handleAdd('s3')}>+ AWS S3</button>
          </div>
        </div>
      )}
    </Modal>
  )
}
