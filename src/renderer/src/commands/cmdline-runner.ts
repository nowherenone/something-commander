/**
 * Renderer side of streaming runs: one IPC subscription fans events out to
 * per-run listeners. Run ids are chosen here, before start, so no chunk can
 * arrive for an id nobody listens to yet.
 */
import type { CmdDataEvent, CmdExitEvent, CmdRunEvent } from '@shared/types/cmdline'

type Listener = (ev: CmdRunEvent) => void
const listeners = new Map<string, Listener>()
let unsubscribe: (() => void) | null = null
let counter = 0

function ensureSubscribed(): void {
  if (unsubscribe || !window.api?.cmd) return
  unsubscribe = window.api.cmd.onEvent((ev) => listeners.get(ev.runId)?.(ev))
}

export interface RunHandle {
  runId: string
  /** Resolves when the process exits (or failed to start). */
  done: Promise<CmdExitEvent>
  stop: () => void
}

export function startRun(
  opts: { command: string; cwd: string; shell?: string },
  onData: (ev: CmdDataEvent) => void
): RunHandle {
  ensureSubscribed()
  const runId = `run-${Date.now().toString(36)}-${++counter}`
  const done = new Promise<CmdExitEvent>((resolve) => {
    listeners.set(runId, (ev) => {
      if (ev.type === 'data') onData(ev)
      else {
        listeners.delete(runId)
        resolve(ev)
      }
    })
    window.api.cmd
      .start(runId, opts)
      .then((res) => {
        if ('error' in res) {
          listeners.delete(runId)
          resolve({ type: 'exit', runId, code: null, signal: null, error: res.error })
        }
      })
      .catch((err: unknown) => {
        listeners.delete(runId)
        resolve({ type: 'exit', runId, code: null, signal: null, error: String(err) })
      })
  })
  return { runId, done, stop: () => void window.api.cmd.stop(runId) }
}

/** One-line status for a finished run; null = clean success. */
export function exitStatus(ev: CmdExitEvent): string | null {
  if (ev.error) return ev.error
  if (ev.stopped) return 'Stopped'
  if (ev.signal) return `Terminated by ${ev.signal}`
  if (ev.code !== 0 && ev.code !== null) return `Exited with code ${ev.code}`
  return null
}

let commandsCache: Promise<string[]> | null = null
/** PATH commands from main (cached for the session). */
export function pathCommands(): Promise<string[]> {
  if (!commandsCache) {
    commandsCache = (window.api.cmd?.listCommands() ?? Promise.resolve([])).catch(() => {
      commandsCache = null
      return []
    })
  }
  return commandsCache
}
