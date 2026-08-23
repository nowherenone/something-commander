import { describe, it, expect } from 'vitest'
import {
  formatSize,
  formatDate,
  formatSpeed,
  formatEta,
  MAX_ETA_SECONDS
} from '../renderer/src/utils/format'

describe('formatSize', () => {
  it('returns empty string for negative values', () => {
    expect(formatSize(-1)).toBe('')
    expect(formatSize(-1, 'short')).toBe('')
  })

  it('formats zero bytes — full', () => {
    expect(formatSize(0)).toBe('0')
    expect(formatSize(0, 'full')).toBe('0')
  })

  it('formats zero bytes — short', () => {
    expect(formatSize(0, 'short')).toBe('0')
  })

  it('full format — shows raw bytes with locale separators', () => {
    expect(formatSize(500, 'full')).toContain('500')
    expect(formatSize(2048, 'full')).toContain('2')
    expect(formatSize(5_000_000, 'full')).toContain('000')
  })

  it('short format — kilobytes', () => {
    expect(formatSize(2048, 'short')).toContain('kB')
  })

  it('short format — megabytes', () => {
    expect(formatSize(5 * 1000 * 1000, 'short')).toContain('MB')
  })

  it('short format — gigabytes', () => {
    expect(formatSize(3.5 * 1000 * 1000 * 1000, 'short')).toContain('GB')
  })

  it('short format — no decimal places', () => {
    const result = formatSize(1_500_000, 'short')
    expect(result).not.toMatch(/\.\d/)
  })
})

describe('formatDate', () => {
  it('returns empty string for zero timestamp', () => {
    expect(formatDate(0)).toBe('')
  })

  it('formats a valid timestamp', () => {
    const ts = new Date('2024-06-15T14:30:00').getTime()
    const result = formatDate(ts)
    expect(result).toContain('2024')
    expect(result).toContain('06')
    expect(result).toContain('15')
  })
})

describe('formatSpeed', () => {
  it('returns empty string until at least ~1 B/s has moved', () => {
    expect(formatSpeed(0)).toBe('')
    expect(formatSpeed(0.4)).toBe('')
    expect(formatSpeed(-5)).toBe('')
    expect(formatSpeed(NaN)).toBe('')
  })

  it('formats measurable speeds with a unit', () => {
    expect(formatSpeed(1024)).toContain('B/s')
    expect(formatSpeed(5 * 1000 * 1000)).toContain('MB/s')
  })

  it('never renders "0 B/s"', () => {
    // Sub-byte-per-second speeds used to round down to "0 B/s".
    expect(formatSpeed(0.9)).not.toContain('0 B')
  })
})

describe('formatEta (F-08: no garbage estimates)', () => {
  it('returns empty while no bytes have moved', () => {
    expect(formatEta(0, 1000, 5000)).toBe('')
  })

  it('returns empty during the first second', () => {
    expect(formatEta(500, 10_000, 400)).toBe('')
  })

  it('returns empty when the total is unknown or already reached', () => {
    expect(formatEta(500, 0, 5000)).toBe('')
    expect(formatEta(1000, 1000, 5000)).toBe('')
  })

  it('returns empty when speed is below ~1 B/s instead of printing years', () => {
    // 100 bytes in 10 minutes ≈ 0.16 B/s — old code printed multi-year ETAs here.
    expect(formatEta(100, 10_000_000, 600_000)).toBe('')
  })

  it('estimates seconds and minutes for healthy speeds', () => {
    // 1000 B in 2000 ms → 500 B/s; remaining 9000 B → ~18s
    expect(formatEta(1000, 10_000, 2000)).toBe('~18s')
    // 1_000_000 B in 2000 ms → 500 MB/s... use exact: 2MB total, 1MB done in 2s → 500kB/s? keep simple:
    expect(formatEta(1_000_000, 3_000_000, 2000)).toBe('~4s')
  })

  it('clamps absurd horizons to ~99m59s instead of ~1469812m7s', () => {
    // 1 KB moved of 1 GB after 2 s → ~12.7 days remaining → clamped
    const eta = formatEta(1000, 1024 * 1024 * 1024, 2000)
    expect(eta).toBe(`~${Math.floor(MAX_ETA_SECONDS / 60)}m${MAX_ETA_SECONDS % 60}s`)
  })

  it('never emits a negative estimate when bytes overshoot the total', () => {
    expect(formatEta(1500, 1000, 2000)).toBe('')
  })
})
