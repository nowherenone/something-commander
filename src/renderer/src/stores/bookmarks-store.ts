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

function loadBookmarks(): Bookmark[] {
  try {
    const saved = localStorage.getItem('flemanager-bookmarks')
    if (saved) return JSON.parse(saved)
  } catch { /* ignore */ }
  return []
}

function saveBookmarks(bookmarks: Bookmark[]): void {
  localStorage.setItem('flemanager-bookmarks', JSON.stringify(bookmarks))
}

let bmCounter = 0

export const useBookmarksStore = create<BookmarksState>((set) => ({
  bookmarks: loadBookmarks(),

  addBookmark: (name, path, pluginId) => {
    set((s) => {
      const bookmark: Bookmark = { id: `bm-${++bmCounter}-${Date.now()}`, name, path, pluginId }
      const newBookmarks = [...s.bookmarks, bookmark]
      saveBookmarks(newBookmarks)
      return { bookmarks: newBookmarks }
    })
  },

  removeBookmark: (id) => {
    set((s) => {
      const newBookmarks = s.bookmarks.filter((b) => b.id !== id)
      saveBookmarks(newBookmarks)
      return { bookmarks: newBookmarks }
    })
  },

  reorderBookmarks: (fromIndex, toIndex) => {
    set((s) => {
      const newBookmarks = [...s.bookmarks]
      const [item] = newBookmarks.splice(fromIndex, 1)
      newBookmarks.splice(toIndex, 0, item)
      saveBookmarks(newBookmarks)
      return { bookmarks: newBookmarks }
    })
  }
}))
