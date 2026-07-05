import { describe, it, expect } from 'vitest'
import { buildDirView } from '../renderer/src/stores/panel-store-helpers'
import type { Entry } from '../shared/types/entry'

function makeEntry(name: string, hidden = false): Entry {
  return {
    id: `/test/${name}`,
    name,
    isContainer: false,
    size: 1,
    modifiedAt: 0,
    mimeType: '',
    iconHint: 'file',
    meta: { extension: name.split('.').pop() || '' },
    attributes: { readonly: false, hidden, symlink: false }
  }
}

describe('buildDirView hidden filter', () => {
  const result = {
    entries: [makeEntry('visible.txt'), makeEntry('.hidden', true)],
    location: '/test',
    parentId: null
  }

  it('hides dotfiles when showHidden is false', () => {
    const view = buildDirView(result, {
      showHidden: false,
      sortConfig: { field: 'name', direction: 'asc' },
      hasParentRow: true
    })
    expect(view.entries.map((e) => e.name)).toEqual(['visible.txt'])
  })

  it('shows dotfiles when showHidden is true', () => {
    const view = buildDirView(result, {
      showHidden: true,
      sortConfig: { field: 'name', direction: 'asc' },
      hasParentRow: true
    })
    expect(view.entries.map((e) => e.name)).toEqual(['.hidden', 'visible.txt'])
  })
})