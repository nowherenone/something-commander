import { describe, it, expect } from 'vitest'
import { sortEntries, type SortConfig } from '../renderer/src/utils/sort'
import type { Entry } from '../shared/types/entry'

function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: '/test/file.txt',
    name: 'file.txt',
    isContainer: false,
    size: 100,
    modifiedAt: 1000000,
    mimeType: 'text/plain',
    iconHint: 'file',
    meta: { extension: 'txt' },
    attributes: { readonly: false, hidden: false, symlink: false },
    ...overrides
  }
}

describe('sortEntries', () => {
  it('puts containers (directories) before files', () => {
    const entries: Entry[] = [
      makeEntry({ id: '/b.txt', name: 'b.txt', isContainer: false }),
      makeEntry({ id: '/a', name: 'a', isContainer: true }),
      makeEntry({ id: '/c.txt', name: 'c.txt', isContainer: false }),
      makeEntry({ id: '/d', name: 'd', isContainer: true })
    ]
    const config: SortConfig = { field: 'name', direction: 'asc' }
    const sorted = sortEntries(entries, config)

    expect(sorted[0].name).toBe('a')
    expect(sorted[1].name).toBe('d')
    expect(sorted[0].isContainer).toBe(true)
    expect(sorted[1].isContainer).toBe(true)
    expect(sorted[2].isContainer).toBe(false)
    expect(sorted[3].isContainer).toBe(false)
  })

  it('sorts by name ascending', () => {
    const entries: Entry[] = [
      makeEntry({ id: '/c.txt', name: 'c.txt' }),
      makeEntry({ id: '/a.txt', name: 'a.txt' }),
      makeEntry({ id: '/b.txt', name: 'b.txt' })
    ]
    const sorted = sortEntries(entries, { field: 'name', direction: 'asc' })
    expect(sorted.map((e) => e.name)).toEqual(['a.txt', 'b.txt', 'c.txt'])
  })

  it('sorts by name descending', () => {
    const entries: Entry[] = [
      makeEntry({ id: '/a.txt', name: 'a.txt' }),
      makeEntry({ id: '/c.txt', name: 'c.txt' }),
      makeEntry({ id: '/b.txt', name: 'b.txt' })
    ]
    const sorted = sortEntries(entries, { field: 'name', direction: 'desc' })
    expect(sorted.map((e) => e.name)).toEqual(['c.txt', 'b.txt', 'a.txt'])
  })

  it('sorts by size', () => {
    const entries: Entry[] = [
      makeEntry({ id: '/big', name: 'big', size: 5000 }),
      makeEntry({ id: '/small', name: 'small', size: 10 }),
      makeEntry({ id: '/med', name: 'med', size: 500 })
    ]
    const sorted = sortEntries(entries, { field: 'size', direction: 'asc' })
    expect(sorted.map((e) => e.name)).toEqual(['small', 'med', 'big'])
  })

  it('sorts by modifiedAt', () => {
    const entries: Entry[] = [
      makeEntry({ id: '/old', name: 'old', modifiedAt: 100 }),
      makeEntry({ id: '/new', name: 'new', modifiedAt: 300 }),
      makeEntry({ id: '/mid', name: 'mid', modifiedAt: 200 })
    ]
    const sorted = sortEntries(entries, { field: 'modifiedAt', direction: 'desc' })
    expect(sorted.map((e) => e.name)).toEqual(['new', 'mid', 'old'])
  })

  it('sorts by extension', () => {
    const entries: Entry[] = [
      makeEntry({ id: '/f.ts', name: 'f.ts', meta: { extension: 'ts' } }),
      makeEntry({ id: '/f.css', name: 'f.css', meta: { extension: 'css' } }),
      makeEntry({ id: '/f.js', name: 'f.js', meta: { extension: 'js' } })
    ]
    const sorted = sortEntries(entries, { field: 'extension', direction: 'asc' })
    expect(sorted.map((e) => e.meta.extension)).toEqual(['css', 'js', 'ts'])
  })

  it('does not mutate original array', () => {
    const entries: Entry[] = [
      makeEntry({ id: '/b', name: 'b' }),
      makeEntry({ id: '/a', name: 'a' })
    ]
    const sorted = sortEntries(entries, { field: 'name', direction: 'asc' })
    expect(entries[0].name).toBe('b')
    expect(sorted[0].name).toBe('a')
  })
})
