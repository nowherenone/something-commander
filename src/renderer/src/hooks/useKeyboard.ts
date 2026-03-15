import { useEffect } from 'react'
import { useAppStore } from '../stores/app-store'
import { usePanelStore } from '../stores/panel-store'

interface KeyboardActions {
  onF3?: () => void
  onF5?: () => void
  onF6?: () => void
  onF7?: () => void
  onF8?: () => void
  onF9?: () => void
  onAltF7?: () => void
  onCtrlM?: () => void
}

export function useKeyboard(actions: KeyboardActions): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const activePanel = useAppStore.getState().activePanel
      const store = usePanelStore.getState()
      const tab = store.getActiveTab(activePanel)
      const { navigate, setCursor, toggleSelect, spaceSelect, selectAll, deselectAll, invertSelection, addTab, closeTab, toggleHidden } = store

      // Don't handle keyboard when an input is focused
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement
      ) {
        // But allow Escape to blur
        if (e.key === 'Escape') {
          ;(document.activeElement as HTMLElement).blur()
          e.preventDefault()
        }
        return
      }

      switch (e.key) {
        case 'Tab':
          e.preventDefault()
          useAppStore.getState().toggleActivePanel()
          break

        case 'ArrowUp':
          e.preventDefault()
          if (e.shiftKey) {
            const newIdx = Math.max(0, tab.cursorIndex - 1)
            const offset = tab.parentId !== null ? 1 : 0
            const entryIdx = tab.cursorIndex - offset
            if (entryIdx >= 0 && entryIdx < tab.entries.length) {
              toggleSelect(activePanel, tab.entries[entryIdx].id)
            }
            setCursor(activePanel, newIdx)
          } else {
            setCursor(activePanel, tab.cursorIndex - 1)
          }
          break

        case 'ArrowDown':
          e.preventDefault()
          if (e.shiftKey) {
            const offset = tab.parentId !== null ? 1 : 0
            const entryIdx = tab.cursorIndex - offset
            if (entryIdx >= 0 && entryIdx < tab.entries.length) {
              toggleSelect(activePanel, tab.entries[entryIdx].id)
            }
            setCursor(activePanel, tab.cursorIndex + 1)
          } else {
            setCursor(activePanel, tab.cursorIndex + 1)
          }
          break

        case 'Home':
          e.preventDefault()
          setCursor(activePanel, 0)
          break

        case 'End':
          e.preventDefault()
          setCursor(activePanel, tab.entries.length - 1 + (tab.parentId !== null ? 1 : 0))
          break

        case 'PageUp':
          e.preventDefault()
          setCursor(activePanel, Math.max(0, tab.cursorIndex - 20))
          break

        case 'PageDown':
          e.preventDefault()
          setCursor(activePanel, tab.cursorIndex + 20)
          break

        case 'Enter': {
          e.preventDefault()
          const offset = tab.parentId !== null ? 1 : 0
          const idx = tab.cursorIndex - offset
          if (tab.cursorIndex === 0 && tab.parentId !== null) {
            navigate(activePanel, tab.parentId)
          } else if (idx >= 0 && idx < tab.entries.length) {
            if (tab.entries[idx].isContainer) {
              navigate(activePanel, tab.entries[idx].id)
            }
          }
          break
        }

        case 'Backspace':
          e.preventDefault()
          if (tab.parentId !== null) {
            navigate(activePanel, tab.parentId)
          } else {
            navigate(activePanel, null)
          }
          break

        case 'Insert': {
          e.preventDefault()
          const offset = tab.parentId !== null ? 1 : 0
          const idx = tab.cursorIndex - offset
          if (idx >= 0 && idx < tab.entries.length) {
            toggleSelect(activePanel, tab.entries[idx].id)
          }
          setCursor(activePanel, tab.cursorIndex + 1)
          break
        }

        case ' ': {
          e.preventDefault()
          const offset = tab.parentId !== null ? 1 : 0
          const idx = tab.cursorIndex - offset
          spaceSelect(activePanel, idx)
          break
        }

        case 'F3':
          e.preventDefault()
          actions.onF3?.()
          break

        case 'F5':
          e.preventDefault()
          actions.onF5?.()
          break

        case 'F6':
          e.preventDefault()
          actions.onF6?.()
          break

        case 'F7':
          e.preventDefault()
          if (e.altKey) {
            actions.onAltF7?.()
          } else {
            actions.onF7?.()
          }
          break

        case 'F8':
        case 'Delete':
          e.preventDefault()
          actions.onF8?.()
          break

        case 'F9':
          e.preventDefault()
          actions.onF9?.()
          break

        default:
          if (e.ctrlKey) {
            switch (e.key.toLowerCase()) {
              case 'a':
                e.preventDefault()
                selectAll(activePanel)
                break
              case 'd':
                e.preventDefault()
                deselectAll(activePanel)
                break
              case 'i':
                e.preventDefault()
                invertSelection(activePanel)
                break
              case 't':
                e.preventDefault()
                addTab(activePanel)
                break
              case 'w':
                e.preventDefault()
                closeTab(activePanel, tab.id)
                break
              case 'h':
                e.preventDefault()
                toggleHidden(activePanel)
                break
              case 'r':
                e.preventDefault()
                store.refresh(activePanel)
                break
              case 'm':
                e.preventDefault()
                actions.onCtrlM?.()
                break
            }
          }
          break
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [actions])
}
