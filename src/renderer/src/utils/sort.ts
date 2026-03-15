import type { Entry } from '@shared/types'

export type SortField = 'name' | 'extension' | 'size' | 'modifiedAt'
export type SortDirection = 'asc' | 'desc'

export interface SortConfig {
  field: SortField
  direction: SortDirection
}

export function sortEntries(entries: Entry[], config: SortConfig): Entry[] {
  const sorted = [...entries]
  const dir = config.direction === 'asc' ? 1 : -1

  sorted.sort((a, b) => {
    // Containers always come first
    if (a.isContainer && !b.isContainer) return -1
    if (!a.isContainer && b.isContainer) return 1

    switch (config.field) {
      case 'name':
        return dir * a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      case 'extension': {
        const extA = (a.meta.extension as string) || ''
        const extB = (b.meta.extension as string) || ''
        const cmp = extA.localeCompare(extB, undefined, { sensitivity: 'base' })
        return cmp !== 0 ? dir * cmp : a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      }
      case 'size':
        return dir * (a.size - b.size)
      case 'modifiedAt':
        return dir * (a.modifiedAt - b.modifiedAt)
      default:
        return 0
    }
  })

  return sorted
}
