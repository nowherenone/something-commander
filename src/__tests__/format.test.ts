import { describe, it, expect } from 'vitest'
import { formatSize, formatDate } from '../renderer/src/utils/format'

describe('formatSize', () => {
  it('returns empty string for negative values', () => {
    expect(formatSize(-1)).toBe('')
  })

  it('formats zero bytes', () => {
    expect(formatSize(0)).toBe('0 B')
  })

  it('formats bytes', () => {
    expect(formatSize(500)).toContain('500')
  })

  it('formats kilobytes', () => {
    const result = formatSize(2048)
    expect(result).toContain('kB')
  })

  it('formats megabytes', () => {
    const result = formatSize(5 * 1000 * 1000)
    expect(result).toContain('MB')
  })

  it('formats gigabytes', () => {
    const result = formatSize(3.5 * 1000 * 1000 * 1000)
    expect(result).toContain('GB')
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
