import { describe, it, expect } from 'vitest'
import { formatSize, formatDate } from '../renderer/src/utils/format'

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
