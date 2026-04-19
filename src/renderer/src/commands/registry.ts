/**
 * Shared action dispatcher. Menu clicks, keyboard shortcuts, and context
 * menu items all call `dispatchCommand(actionId)`; whoever owns the handler
 * registers it once at startup via `registerCommand`.
 *
 * Handlers are plain functions, not React, so they can live outside the tree
 * (App.tsx registers them with `useEffect`).
 */

export type CommandHandler = () => void | Promise<void>

const handlers: Map<string, CommandHandler> = new Map()

export function registerCommand(actionId: string, handler: CommandHandler): () => void {
  handlers.set(actionId, handler)
  return () => {
    if (handlers.get(actionId) === handler) handlers.delete(actionId)
  }
}

export function registerCommands(map: Record<string, CommandHandler>): () => void {
  const disposers = Object.entries(map).map(([id, h]) => registerCommand(id, h))
  return () => { for (const d of disposers) d() }
}

export function dispatchCommand(actionId: string): boolean {
  const handler = handlers.get(actionId)
  if (!handler) return false
  try {
    const ret = handler()
    if (ret && typeof (ret as Promise<void>).then === 'function') {
      ;(ret as Promise<void>).catch((err) => console.error(`Command "${actionId}" failed:`, err))
    }
  } catch (err) {
    console.error(`Command "${actionId}" threw:`, err)
  }
  return true
}

export function hasCommand(actionId: string): boolean {
  return handlers.has(actionId)
}

/** For tests only. */
export function _resetCommandRegistry(): void {
  handlers.clear()
}
