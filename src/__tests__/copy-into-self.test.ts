/**
 * Drives shipped `wouldCopyIntoSelf` / path helpers used by F5/F6 preflight.
 * Regression: copy must NOT block when destination is merely under the source
 * *listing* path — only when a selected container would nest into itself.
 */
import { describe, expect, it } from 'vitest'
import {
  isSameOrDescendantPath,
  normalizeLocationPath,
  wouldCopyIntoSelf
} from '../renderer/src/utils/entry-helpers'

describe('normalizeLocationPath', () => {
  it('unifies separators and strips trailing slashes', () => {
    expect(normalizeLocationPath('D:\\work\\out\\')).toBe('D:/work/out')
    expect(normalizeLocationPath('/home/user/docs/')).toBe('/home/user/docs')
  })

  it('preserves archive :: roots', () => {
    expect(normalizeLocationPath('D:\\a.zip::')).toBe('D:/a.zip::')
    expect(normalizeLocationPath('D:\\a.zip::folder/')).toBe('D:/a.zip::folder')
  })
})

describe('isSameOrDescendantPath', () => {
  it('detects same path and true descendants', () => {
    expect(isSameOrDescendantPath('/work/src', '/work/src')).toBe(true)
    expect(isSameOrDescendantPath('/work/src', '/work/src/nested')).toBe(true)
    expect(isSameOrDescendantPath('D:\\work\\src', 'D:\\work\\src\\nested')).toBe(true)
  })

  it('does not treat sibling prefix paths as descendants', () => {
    expect(isSameOrDescendantPath('/home/a', '/home/ab')).toBe(false)
    expect(isSameOrDescendantPath('/work/src', '/work/src2')).toBe(false)
    expect(isSameOrDescendantPath('D:\\work\\src', 'D:\\work\\src-backup')).toBe(false)
  })
})

describe('wouldCopyIntoSelf (shipped preflight)', () => {
  it('allows copying files into a subfolder of the current source listing', () => {
    // Classic false-positive case: left=/work, right=/work/out, copy file.txt
    const entries = [
      { id: '/home/nowhere/work/file.txt', isContainer: false },
      { id: '/home/nowhere/work/readme.md', isContainer: false }
    ]
    expect(wouldCopyIntoSelf(entries, '/home/nowhere/work/out')).toBe(false)
    expect(wouldCopyIntoSelf(entries, '/home/nowhere/work')).toBe(false)
  })

  it('allows same-directory file copy (both panels on same folder)', () => {
    const entries = [{ id: 'D:\\docs\\a.txt', isContainer: false }]
    expect(wouldCopyIntoSelf(entries, 'D:\\docs')).toBe(false)
  })

  it('blocks copying a selected folder into itself', () => {
    const entries = [{ id: '/work/src', isContainer: true }]
    expect(wouldCopyIntoSelf(entries, '/work/src')).toBe(true)
  })

  it('blocks copying a selected folder into its subfolder', () => {
    expect(wouldCopyIntoSelf([{ id: '/work/src', isContainer: true }], '/work/src/nested')).toBe(
      true
    )
    expect(
      wouldCopyIntoSelf([{ id: 'D:\\work\\src', isContainer: true }], 'D:\\work\\src\\nested')
    ).toBe(true)
  })

  it('allows copying a folder into a sibling destination', () => {
    const entries = [{ id: '/work/src', isContainer: true }]
    expect(wouldCopyIntoSelf(entries, '/work/out')).toBe(false)
    expect(wouldCopyIntoSelf(entries, '/other')).toBe(false)
  })

  it('allows mixed selection when only files go into a descendant path', () => {
    const entries = [
      { id: '/work/a.txt', isContainer: false },
      { id: '/work/other', isContainer: true }
    ]
    // dest is under /work but not under selected folder /work/other
    expect(wouldCopyIntoSelf(entries, '/work/out')).toBe(false)
  })

  it('blocks when any selected folder contains the destination', () => {
    const entries = [
      { id: '/work/a.txt', isContainer: false },
      { id: '/work/src', isContainer: true }
    ]
    expect(wouldCopyIntoSelf(entries, '/work/src/deep')).toBe(true)
  })
})
