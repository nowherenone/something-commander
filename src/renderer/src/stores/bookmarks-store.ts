import { create } from 'zustand'

export interface Bookmark {
  id: string
  name: string
  path: string
  pluginId: string
}

interface BookmarksState {
  bookmarks: Bookmark[]
  addBookmark: (name: string, path: string, pluginId: string) => void
  removeBookmark: (id: string) => void
  reorderBookmarks: (fromIndex: number, toIndex: number) => void
}

let bmCounter = 0

function persist(bookmarks: Bookmark[]): void {
  window.api.store.set('bookmarks', bookmarks)
}

export const useBookmarksStore = create<BookmarksState>((set) => ({
  bookmarks: [],

  addBookmark: (name, path, pluginId) => {
    set((s) => {
      const bookmark: Bookmark = { id: `bm-${++bmCounter}-${Date.now()}`, name, path, pluginId }
      const newBookmarks = [...s.bookmarks, bookmark]
      persist(newBookmarks)
      return { bookmarks: newBookmarks }
    })
  },

  removeBookmark: (id) => {
    set((s) => {
      const newBookmarks = s.bookmarks.filter((b) => b.id !== id)
      persist(newBookmarks)
      return { bookmarks: newBookmarks }
    })
  },

  reorderBookmarks: (fromIndex, toIndex) => {
    set((s) => {
      const newBookmarks = [...s.bookmarks]
      const [item] = newBookmarks.splice(fromIndex, 1)
      newBookmarks.splice(toIndex, 0, item)
      persist(newBookmarks)
      return { bookmarks: newBookmarks }
    })
  }
}))

/** Called once on app startup. Loads from disk; migrates localStorage data if no disk file yet. */
export async function loadBookmarks(): Promise<void> {
  const diskData = await window.api.store.get('bookmarks') as Bookmark[] | null
  if (diskData && Array.isArray(diskData) && diskData.length > 0) {
    useBookmarksStore.setState({ bookmarks: diskData })
    return
  }
  // One-time migration from localStorage
  try {
    const lsRaw = localStorage.getItem('flemanager-bookmarks')
    if (lsRaw) {
      const parsed = JSON.parse(lsRaw) as Bookmark[]
      if (Array.isArray(parsed) && parsed.length > 0) {
        useBookmarksStore.setState({ bookmarks: parsed })
        await window.api.store.set('bookmarks', parsed)
        localStorage.removeItem('flemanager-bookmarks')
      }
    }
  } catch { /* ignore */ }
}
