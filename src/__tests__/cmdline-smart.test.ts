import { describe, it, expect } from 'vitest'
import {
  tokenAtCaret,
  splitPartialPath,
  quotePath,
  completionText,
  commonPrefix,
  fuzzyMatch,
  fuzzyFilter,
  expandPlaceholders,
  hasPlaceholders,
  type PlaceholderContext
} from '../shared/cmdline-smart'

describe('tokenAtCaret', () => {
  it('finds the word at the end', () => {
    expect(tokenAtCaret('git che', 7, false)).toEqual({ start: 4, end: 7, value: 'che', index: 1 })
    expect(tokenAtCaret('gi', 2, false)).toEqual({ start: 0, end: 2, value: 'gi', index: 0 })
  })
  it('empty word after a space', () => {
    expect(tokenAtCaret('ls ', 3, false)).toEqual({ start: 3, end: 3, value: '', index: 1 })
    expect(tokenAtCaret('', 0, false)).toEqual({ start: 0, end: 0, value: '', index: 0 })
  })
  it('dequotes and unescapes', () => {
    expect(tokenAtCaret("cat 'my fi", 10, false)).toMatchObject({ start: 4, value: 'my fi', index: 1 })
    expect(tokenAtCaret('cat my\\ fi', 10, false)).toMatchObject({ start: 4, value: 'my fi' })
    expect(tokenAtCaret('type C:\\Us', 10, true)).toMatchObject({ start: 5, value: 'C:\\Us' })
  })
  it('caret in the middle of a later word', () => {
    expect(tokenAtCaret('cp abc def', 5, false)).toEqual({ start: 3, end: 6, value: 'ab', index: 1 })
  })
})

describe('splitPartialPath', () => {
  it('posix and windows separators', () => {
    expect(splitPartialPath('src/ma', false)).toEqual({ dirPart: 'src/', base: 'ma' })
    expect(splitPartialPath('ma', false)).toEqual({ dirPart: '', base: 'ma' })
    expect(splitPartialPath('C:\\Users\\m', true)).toEqual({ dirPart: 'C:\\Users\\', base: 'm' })
    expect(splitPartialPath('a\\b', false)).toEqual({ dirPart: '', base: 'a\\b' })
  })
})

describe('completionText', () => {
  it('files get a trailing space, dirs the separator', () => {
    expect(completionText('src/main.ts', false, 'posix', '/')).toBe('src/main.ts ')
    expect(completionText('src', true, 'posix', '/')).toBe('src/')
  })
  it('quotes when needed and keeps ~ expandable', () => {
    expect(completionText('my dir', true, 'posix', '/')).toBe("'my dir'/")
    expect(completionText('~/my file', false, 'posix', '/')).toBe("~/'my file' ")
    expect(quotePath('~/', 'posix')).toBe('~/')
  })
  it('PowerShell keeps the separator inside the quotes', () => {
    expect(completionText('My Docs', true, 'powershell', '\\')).toBe("'My Docs\\'")
    expect(completionText('Docs', true, 'powershell', '\\')).toBe('Docs\\')
  })
  it('cmd', () => {
    expect(completionText('Program Files', true, 'cmd', '\\')).toBe('"Program Files"\\')
  })
})

describe('commonPrefix', () => {
  it('works', () => {
    expect(commonPrefix(['config', 'configure', 'conf'])).toBe('conf')
    expect(commonPrefix(['Abc', 'abd'], true)).toBe('Ab')
    expect(commonPrefix([])).toBe('')
  })
})

describe('fuzzy', () => {
  it('subsequence match, null on miss', () => {
    expect(fuzzyMatch('gco', 'git checkout')).not.toBeNull()
    expect(fuzzyMatch('xyz', 'git checkout')).toBeNull()
  })
  it('ranks contiguous and word-start matches higher', () => {
    const items = ['docker compose up', 'git commit -m wip', 'echo commit']
    const r = fuzzyFilter(items, 'commit')
    expect(r.map((x) => x.item).slice(0, 2)).toEqual(['echo commit', 'git commit -m wip'])
    expect(fuzzyFilter(['abc', 'xaxbxc'], 'abc')[0].item).toBe('abc')
  })
  it('empty query keeps recency order', () => {
    expect(fuzzyFilter(['b', 'a', 'c'], '').map((x) => x.item)).toEqual(['b', 'a', 'c'])
  })
  it('highlights positions', () => {
    expect(fuzzyMatch('com', 'git commit')!.positions).toEqual([4, 5, 6])
  })
})

describe('placeholders', () => {
  const ctx: PlaceholderContext = {
    cursorName: 'my file.txt',
    selectedPaths: ['/w/a.txt', '/w/b c.txt'],
    panelPath: '/w',
    otherPanelPath: '/other dir'
  }
  it('expands whole-word placeholders with quoting', () => {
    const r = expandPlaceholders('cp %F %P', ctx, 'posix')
    expect(r.text).toBe("cp /w/a.txt '/w/b c.txt' '/other dir'")
    expect(r.used).toEqual(['%F', '%P'])
    expect(expandPlaceholders('vim %f', ctx, 'posix').text).toBe("vim 'my file.txt'")
    expect(expandPlaceholders('ls %p %s', ctx, 'posix').text).toBe("ls /w /w/a.txt '/w/b c.txt'")
    expect(expandPlaceholders('code %f', ctx, 'powershell').text).toBe("code 'my file.txt'")
  })
  it('leaves embedded % alone (date, printf, %PATH%)', () => {
    expect(expandPlaceholders('date +%F', ctx, 'posix').text).toBe('date +%F')
    expect(expandPlaceholders('printf "%s\\n" x', ctx, 'posix').text).toBe('printf "%s\\n" x')
    expect(expandPlaceholders('echo %PATH%', ctx, 'cmd').text).toBe('echo %PATH%')
    expect(hasPlaceholders('date +%F')).toBe(false)
    expect(hasPlaceholders('vim %f')).toBe(true)
  })
  it('%% escapes', () => {
    const r = expandPlaceholders('echo %%f', ctx, 'posix')
    expect(r.text).toBe('echo %f')
    expect(r.used).toEqual([])
    expect(hasPlaceholders('echo %%f')).toBe(false)
  })
  it('reports missing values', () => {
    const r = expandPlaceholders('vim %f', { ...ctx, cursorName: null }, 'posix')
    expect(r.missing).toEqual(['%f'])
    expect(r.text).toBe('vim %f')
  })
})
