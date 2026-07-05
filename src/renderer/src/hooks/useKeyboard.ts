import { useEffect } from 'react'
import { useAppStore } from '../stores/app-store'
import { usePanelStore, parentOffset, hasParentEntry } from '../stores/panel-store'
import { useKeybindingsStore } from '../stores/keybindings-store'
import { useOverlayStore } from '../stores/overlay-store'
import { dispatchCommand } from '../commands/registry'

export interface KeyboardNavActions {
  /** Called when Enter activates the cursor row. */
  onActivate?: (entry: { id: string; isContainer: boolean; name?: string }) => void
  /** Called when Backspace (or parent-row activation) navigates up. */
  onGoUp?: () => void
}

/**
 * Wire the global keyboard. Navigation primitives (arrows, space, enter,
 * numpad +/-/*) are handled inline because they need direct access to the
 * active tab's cursor/selection. Everything else goes through the
 * keybindings-store → command registry pipeline so menu clicks, F-key
 * shortcuts, and context-menu items share the same dispatch.
 */
export function useKeyboard(actions: KeyboardNavActions = {}): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const activePanel = useAppStore.getState().activePanel
      const store = usePanelStore.getState()
      const tab = store.getActiveTab(activePanel)

      // Inline rename: let the input handle keys; Escape cancels rename.
      if (tab.renamingEntryId) {
        if (
          document.activeElement instanceof HTMLInputElement &&
          document.activeElement.classList.contains('inline-rename-input')
        ) {
          return
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          store.clearInlineRename(activePanel)
          return
        }
      }

      // Don't handle keyboard when another input is focused.
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement
      ) {
        if (e.key === 'Escape') {
          ;(document.activeElement as HTMLElement).blur()
          e.preventDefault()
        }
        return
      }

      // Navigation primitives: depend on panel cursor state, not reassignable.
      switch (e.key) {
        case 'Escape':
          e.preventDefault()
          // Top priority: overlay stack (top wins)
          const overlays = useOverlayStore.getState()
          if (overlays.overlays.length > 0) {
            overlays.dismissTop()
            return
          }
          // Try keybinding (e.g. 'cancel' command)
          const cancelAction = useKeybindingsStore.getState().matchAction(e)
          if (cancelAction && dispatchCommand(cancelAction)) {
            return
          }
          // Fallback: cancel any running folder size calculations
          store.cancelFolderCalculations(activePanel)
          return

        case 'Tab':
          e.preventDefault()
          useAppStore.getState().toggleActivePanel()
          return

        case 'ArrowUp': {
          e.preventDefault()
          if (e.shiftKey) {
            const offset = parentOffset(tab)
            const entryIdx = tab.cursorIndex - offset
            if (entryIdx >= 0 && entryIdx < tab.entries.length) {
              store.toggleSelect(activePanel, tab.entries[entryIdx].id)
            }
          }
          store.setCursor(activePanel, tab.cursorIndex - 1)
          return
        }

        case 'ArrowDown': {
          e.preventDefault()
          if (e.shiftKey) {
            const offset = parentOffset(tab)
            const entryIdx = tab.cursorIndex - offset
            if (entryIdx >= 0 && entryIdx < tab.entries.length) {
              store.toggleSelect(activePanel, tab.entries[entryIdx].id)
            }
          }
          store.setCursor(activePanel, tab.cursorIndex + 1)
          return
        }

        case 'Home':
          e.preventDefault()
          store.setCursor(activePanel, 0)
          return

        case 'End':
          e.preventDefault()
          store.setCursor(activePanel, tab.entries.length - 1 + parentOffset(tab))
          return

        case 'PageUp':
          e.preventDefault()
          store.setCursor(activePanel, Math.max(0, tab.cursorIndex - 20))
          return

        case 'PageDown':
          e.preventDefault()
          store.setCursor(activePanel, tab.cursorIndex + 20)
          return

        case 'Enter': {
          e.preventDefault()
          if (e.ctrlKey) {
            dispatchCommand('rename')
            return
          }
          const offset = parentOffset(tab)
          const idx = tab.cursorIndex - offset
          if (tab.cursorIndex === 0 && hasParentEntry(tab)) {
            actions.onGoUp?.()
          } else if (idx >= 0 && idx < tab.entries.length) {
            const entry = tab.entries[idx]
            if (actions.onActivate) actions.onActivate(entry)
            else if (entry.isContainer) store.navigate(activePanel, entry.id)
          }
          return
        }

        case 'Backspace':
          e.preventDefault()
          actions.onGoUp?.()
          return

        case 'Insert': {
          e.preventDefault()
          const offset = parentOffset(tab)
          const idx = tab.cursorIndex - offset
          if (idx >= 0 && idx < tab.entries.length) {
            store.toggleSelect(activePanel, tab.entries[idx].id)
          }
          store.setCursor(activePanel, tab.cursorIndex + 1)
          return
        }

        case '+':
          if (e.code !== 'NumpadAdd') break
          e.preventDefault()
          if (e.ctrlKey) store.selectAll(activePanel)
          else if (e.altKey) store.selectSameExt(activePanel)
          else dispatchCommand('selectGroup')
          return

        case '-':
          if (e.code !== 'NumpadSubtract') break
          e.preventDefault()
          if (e.ctrlKey) store.deselectAll(activePanel)
          else dispatchCommand('unselectGroup')
          return

        case '*':
          if (e.code !== 'NumpadMultiply') break
          e.preventDefault()
          store.invertSelection(activePanel)
          return

        case ' ': {
          e.preventDefault()
          const offset = parentOffset(tab)
          const idx = tab.cursorIndex - offset
          store.spaceSelect(activePanel, idx)
          return
        }
      }

      // Fall through: try keybinding → command-registry dispatch.
      const action = useKeybindingsStore.getState().matchAction(e)
      if (action && dispatchCommand(action)) {
        e.preventDefault()
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [actions])
}
