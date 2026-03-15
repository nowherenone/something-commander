import { describe, it, expect, beforeEach } from 'vitest'
import { useBookmarksStore } from '../renderer/src/stores/bookmarks-store'

describe('bookmarks-store', () => {
  beforeEach(() => {
    useBookmarksStore.setState({ bookmarks: [] })
  })

  it('starts with empty bookmarks', () => {
    expect(useBookmarksStore.getState().bookmarks).toHaveLength(0)
  })

  it('addBookmark adds a bookmark', () => {
    useBookmarksStore.getState().addBookmark('Home', '/home/user', 'local-filesystem')
    const bm = useBookmarksStore.getState().bookmarks
    expect(bm).toHaveLength(1)
    expect(bm[0].name).toBe('Home')
    expect(bm[0].path).toBe('/home/user')
  })

  it('removeBookmark removes a bookmark', () => {
    useBookmarksStore.getState().addBookmark('Docs', '/docs', 'local-filesystem')
    const id = useBookmarksStore.getState().bookmarks[0].id
    useBookmarksStore.getState().removeBookmark(id)
    expect(useBookmarksStore.getState().bookmarks).toHaveLength(0)
  })

  it('reorderBookmarks swaps positions', () => {
    useBookmarksStore.getState().addBookmark('A', '/a', 'local-filesystem')
    useBookmarksStore.getState().addBookmark('B', '/b', 'local-filesystem')
    useBookmarksStore.getState().addBookmark('C', '/c', 'local-filesystem')

    useBookmarksStore.getState().reorderBookmarks(2, 0)
    const names = useBookmarksStore.getState().bookmarks.map((b) => b.name)
    expect(names).toEqual(['C', 'A', 'B'])
  })
})
