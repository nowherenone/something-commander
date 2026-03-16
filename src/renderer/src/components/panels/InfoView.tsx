import React, { useEffect, useState } from 'react'
import { formatSize } from '../../utils/format'

interface InfoViewProps {
  pluginId: string
  locationId: string | null
  locationDisplay: string
}

export function InfoView({ pluginId, locationId, locationDisplay }: InfoViewProps): React.JSX.Element {
  const [diskSpace, setDiskSpace] = useState<{ free: number; total: number } | null>(null)
  const [plugins, setPlugins] = useState<Array<{ id: string; displayName: string; version: string }>>([])

  useEffect(() => {
    if (locationId) {
      window.api.util.getDiskSpace(locationId).then(setDiskSpace)
    }
    window.api.plugins.list().then(setPlugins)
  }, [locationId])

  const usedPct = diskSpace && diskSpace.total > 0
    ? Math.round(((diskSpace.total - diskSpace.free) / diskSpace.total) * 100)
    : 0

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 16, fontSize: 12, color: 'var(--text-secondary)' }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>
        Information
      </div>

      {/* Location */}
      <Section title="Current Location">
        <Row label="Path" value={locationDisplay || 'N/A'} mono />
        <Row label="Plugin" value={pluginId} />
      </Section>

      {/* Disk Space */}
      {diskSpace && diskSpace.total > 0 && (
        <Section title="Disk Space">
          <Row label="Total" value={formatSize(diskSpace.total)} />
          <Row label="Free" value={formatSize(diskSpace.free)} />
          <Row label="Used" value={`${formatSize(diskSpace.total - diskSpace.free)} (${usedPct}%)`} />
          <div style={{ marginTop: 8, height: 12, background: 'var(--border-color)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${usedPct}%`, background: usedPct > 90 ? 'var(--danger)' : 'var(--accent)', display: 'block' }} />
          </div>
        </Section>
      )}

      {/* Loaded Plugins */}
      <Section title="Loaded Plugins">
        {plugins.map((p) => (
          <Row key={p.id} label={p.displayName} value={`v${p.version}`} />
        ))}
      </Section>

      {/* System */}
      <Section title="System">
        <Row label="Platform" value={navigator.platform} />
        <Row label="User Agent" value={navigator.userAgent.slice(0, 60) + '...'} />
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }): React.JSX.Element {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', gap: 8 }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ color: 'var(--text-primary)', fontFamily: mono ? 'var(--font-mono)' : undefined, fontSize: mono ? 11 : undefined, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value}
      </span>
    </div>
  )
}
