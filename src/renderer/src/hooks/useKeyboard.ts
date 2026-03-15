import { useEffect } from 'react'
import { useAppStore } from '../stores/app-store'
import { usePanelStore } from '../stores/panel-store'

interface KeyboardActions {
  onF5?: () => void
  onF6?: () => void
  onF7?: () => void
  onF8?: () => void
}

export function useKeyboard(actions: KeyboardActions): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const activePanel = useAppStore.getState().activePanel
      const panelState = usePanelStore.getState()[activePanel]
      const { navigate, setCursor, toggleSelect, selectAll, deselectAll, invertSelection } =
        usePanelStore.getState()

      // Don't handle keyboard when an input is focused
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement
      ) {
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
            // Extend selection
            const newIdx = Math.max(0, panelState.cursorIndex - 1)
            const entry = panelState.entries[panelState.cursorIndex]
            if (entry) toggleSelect(activePanel, entry.id)
            setCursor(activePanel, newIdx)
          } else {
            setCursor(activePanel, panelState.cursorIndex - 1)
          }
          break

        case 'ArrowDown':
          e.preventDefault()
          if (e.shiftKey) {
            const newIdx = Math.min(
              panelState.entries.length - 1 + (panelState.parentId !== null ? 1 : 0),
              panelState.cursorIndex + 1
            )
            const entry = panelState.entries[panelState.cursorIndex]
            if (entry) toggleSelect(activePanel, entry.id)
            setCursor(activePanel, newIdx)
          } else {
            setCursor(
              activePanel,
              panelState.cursorIndex + 1
            )
          }
          break

        case 'Home':
          e.preventDefault()
          setCursor(activePanel, 0)
          break

        case 'End':
          e.preventDefault()
          setCursor(
            activePanel,
            panelState.entries.length - 1 + (panelState.parentId !== null ? 1 : 0)
          )
          break

        case 'Enter': {
          e.preventDefault()
          // Account for ".." entry offset
          const offset = panelState.parentId !== null ? 1 : 0
          const idx = panelState.cursorIndex - offset
          if (panelState.cursorIndex === 0 && panelState.parentId !== null) {
            // Go up
            navigate(activePanel, panelState.parentId)
          } else if (idx >= 0 && idx < panelState.entries.length) {
            const entry = panelState.entries[idx]
            if (entry.isContainer) {
              navigate(activePanel, entry.id)
            }
          }
          break
        }

        case 'Backspace':
          e.preventDefault()
          if (panelState.parentId !== null) {
            navigate(activePanel, panelState.parentId)
          } else {
            navigate(activePanel, null)
          }
          break

        case 'Insert': {
          e.preventDefault()
          const offset = panelState.parentId !== null ? 1 : 0
          const idx = panelState.cursorIndex - offset
          if (idx >= 0 && idx < panelState.entries.length) {
            toggleSelect(activePanel, panelState.entries[idx].id)
          }
          setCursor(activePanel, panelState.cursorIndex + 1)
          break
        }

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
          actions.onF7?.()
          break

        case 'F8':
        case 'Delete':
          e.preventDefault()
          actions.onF8?.()
          break

        case 'a':
          if (e.ctrlKey) {
            e.preventDefault()
            selectAll(activePanel)
          }
          break

        case 'd':
          if (e.ctrlKey) {
            e.preventDefault()
            deselectAll(activePanel)
          }
          break

        case 'i':
          if (e.ctrlKey) {
            e.preventDefault()
            invertSelection(activePanel)
          }
          break
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [actions])
}
