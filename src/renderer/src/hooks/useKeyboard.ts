import { useEffect } from 'react'
import { useAppStore } from '../stores/app-store'
import { usePanelStore, parentOffset, hasParentEntry } from '../stores/panel-store'

interface KeyboardActions {
  onF3?: () => void
  onF4?: () => void
  onF5?: () => void
  onF6?: () => void
  onF7?: () => void
  onF8?: () => void
  onF9?: () => void
  onAltF7?: () => void
  onCtrlM?: () => void
  onCompare?: () => void
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
        case 'Escape':
          e.preventDefault()
          store.cancelFolderCalculations(activePanel)
          break

        case 'Tab':
          e.preventDefault()
          useAppStore.getState().toggleActivePanel()
          break

        case 'ArrowUp':
          e.preventDefault()
          if (e.shiftKey) {
            const newIdx = Math.max(0, tab.cursorIndex - 1)
            const offset = parentOffset(tab)
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
            const offset = parentOffset(tab)
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
          setCursor(activePanel, tab.entries.length - 1 + (parentOffset(tab)))
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
          const offset = parentOffset(tab)
          const idx = tab.cursorIndex - offset
          if (tab.cursorIndex === 0 && hasParentEntry(tab)) {
            // Go up — either to parent dir or exit archive/sftp
            if (tab.parentId !== null) {
              navigate(activePanel, tab.parentId)
            } else if (tab.pluginId !== 'local-filesystem') {
              const archivePath = tab.locationId?.split('::')[0]
              if (archivePath) {
                const parentDir = archivePath.replace(/[\\/][^\\/]+$/, '')
                store.navigateWithPlugin(activePanel, 'local-filesystem', parentDir)
              }
            } else {
              navigate(activePanel, null)
            }
          } else if (idx >= 0 && idx < tab.entries.length) {
            const entry = tab.entries[idx]
            if (entry.isContainer) {
              navigate(activePanel, entry.id)
            } else {
              // Check if it's an archive — enter it, otherwise open with system app
              window.api.util.isArchive(entry.id).then((isArchive) => {
                if (isArchive) {
                  usePanelStore.getState().navigateWithPlugin(activePanel, 'archive', `${entry.id}::`)
                } else {
                  window.api.util.openFile(entry.id)
                }
              })
            }
          }
          break
        }

        case 'Backspace':
          e.preventDefault()
          if (tab.parentId !== null) {
            navigate(activePanel, tab.parentId)
          } else if (tab.pluginId !== 'local-filesystem') {
            // Exit archive/sftp — go back to local filesystem
            const archivePath = tab.locationId?.split('::')[0]
            if (archivePath) {
              const parentDir = archivePath.replace(/[\\/][^\\/]+$/, '')
              store.navigateWithPlugin(activePanel, 'local-filesystem', parentDir)
            }
          } else {
            navigate(activePanel, null)
          }
          break

        case 'Insert': {
          e.preventDefault()
          const offset = parentOffset(tab)
          const idx = tab.cursorIndex - offset
          if (idx >= 0 && idx < tab.entries.length) {
            toggleSelect(activePanel, tab.entries[idx].id)
          }
          setCursor(activePanel, tab.cursorIndex + 1)
          break
        }

        case ' ': {
          e.preventDefault()
          const offset = parentOffset(tab)
          const idx = tab.cursorIndex - offset
          spaceSelect(activePanel, idx)
          break
        }

        case 'F1':
          e.preventDefault()
          if (e.altKey) {
            useAppStore.getState().openDriveMenu('left')
          }
          break

        case 'F2':
          e.preventDefault()
          if (e.altKey) {
            useAppStore.getState().openDriveMenu('right')
          }
          break

        case 'F3':
          e.preventDefault()
          actions.onF3?.()
          break

        case 'F4':
          e.preventDefault()
          actions.onF4?.()
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
                if (e.shiftKey) {
                  deselectAll(activePanel)
                } else {
                  // Ctrl+D = open drive/bookmark menu
                  useAppStore.getState().openDriveMenu(activePanel)
                }
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
              case 'c':
                e.preventDefault()
                actions.onCompare?.()
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
