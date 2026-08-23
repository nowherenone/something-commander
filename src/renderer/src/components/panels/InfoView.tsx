import React, { useEffect, useState } from 'react'
import { formatSize } from '../../utils/format'
import { useSizeFormat } from '../../stores/settings-store'
import styles from '../../styles/panels.module.css'

interface InfoViewProps {
  pluginId: string
  locationId: string | null
  locationDisplay: string
}

export function InfoView({ pluginId, locationId, locationDisplay }: InfoViewProps): React.JSX.Element {
  const sizeFormat = useSizeFormat()
  const [diskSpace, setDiskSpace] = useState<{ free: number; total: number } | null>(null)
  const [plugins, setPlugins] = useState<Array<{ id: string; displayName: string; version: string }>>([])

  useEffect(() => {
    if (locationId) {
      window.api.util.getDiskSpace(pluginId, locationId).then(setDiskSpace)
    }
    window.api.plugins.list().then(setPlugins)
  }, [pluginId, locationId])

  const usedPct = diskSpace && diskSpace.total > 0
    ? Math.round(((diskSpace.total - diskSpace.free) / diskSpace.total) * 100)
    : 0

  return (
    <div className={styles.infoView}>
      <div className={styles.infoViewTitle}>
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
          <Row label="Total" value={formatSize(diskSpace.total, sizeFormat)} />
          <Row label="Free" value={formatSize(diskSpace.free, sizeFormat)} />
          <Row label="Used" value={`${formatSize(diskSpace.total - diskSpace.free, sizeFormat)} (${usedPct}%)`} />
          <div className={styles.infoDiskBar}>
            <div
              className={`${styles.infoDiskBarFill} ${usedPct > 90 ? styles.infoDiskBarFillError : ''}`}
              style={{ width: `${usedPct}%` }}
            />
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
    <div className={styles.infoViewSection}>
      <div className={styles.infoViewHeading}>
        {title}
      </div>
      {children}
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }): React.JSX.Element {
  return (
    <div className={styles.infoViewRow}>
      <span className={styles.infoViewLabel}>{label}</span>
      <span className={`${styles.infoViewValue} ${mono ? styles.infoViewValueMono : ''}`}>
        {value}
      </span>
    </div>
  )
}
