import { describe, expect, it } from 'vitest'
import { cssColorToHex } from '../renderer/src/utils/css-color'

describe('cssColorToHex (shipped)', () => {
  it('normalizes hex and short hex', () => {
    expect(cssColorToHex('#ABC')).toBe('#aabbcc')
    expect(cssColorToHex('#112233')).toBe('#112233')
  })

  it('parses rgb()', () => {
    expect(cssColorToHex('rgb(255, 0, 128)')).toBe('#ff0080')
  })

  it('falls back for garbage', () => {
    expect(cssColorToHex('')).toBe('#000000')
    expect(cssColorToHex('not-a-color')).toBe('#000000')
  })
})
