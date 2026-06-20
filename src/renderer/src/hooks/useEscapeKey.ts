import { useEffect } from 'react'

interface UseEscapeKeyOptions {
  capture?: boolean
}

/**
 * useEscapeKey - shared Escape handler with sensible focus behavior.
 * - Always listens at window level (capture phase by default).
 * - If an input/textarea is focused, first Escape blurs it; second Escape fires the handler.
 * - Prevents default + stops propagation to avoid fights between handlers.
 */
export function useEscapeKey(
  handler: () => void,
  options: UseEscapeKeyOptions = {}
): void {
  const { capture = true } = options

  useEffect(() => {
    let inputWasFocused = false

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return

      const active = document.activeElement
      const isInput =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        (active as HTMLElement)?.isContentEditable

      if (isInput) {
        if (!inputWasFocused) {
          // First press: just blur the input, don't close yet
          ;(active as HTMLElement).blur()
          inputWasFocused = true
          e.preventDefault()
          e.stopPropagation()
          // Reset flag after a tick in case user presses again quickly
          setTimeout(() => {
            inputWasFocused = false
          }, 150)
          return
        }
        // Second press (or already blurred): let handler run
        inputWasFocused = false
      }

      e.preventDefault()
      e.stopPropagation()
      handler()
    }

    window.addEventListener('keydown', onKeyDown, { capture })
    return () => window.removeEventListener('keydown', onKeyDown, { capture })
  }, [handler, capture])
}
