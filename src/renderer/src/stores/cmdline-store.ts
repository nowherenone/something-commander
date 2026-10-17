import { create } from 'zustand'
import { HISTORY_CAP, pushHistory } from '@shared/cmdline'

/** Disk key for the persisted history (userData/cmdline-history.json). */
const STORE_KEY = 'cmdline-history'

/**
 * Something the command line should do the next time it is mounted/updated:
 * focus, insert text at the caret, or open the history dropdown. Requests are
 * queued in the store (not fired as DOM events) so they survive the bar
 * mounting in the same tick — e.g. Ctrl+Enter while the bar is hidden.
 */
export type CmdlineRequest =
  | { seq: number; type: 'focus' }
  | { seq: number; type: 'insert'; text: string; raw?: boolean }
  | { seq: number; type: 'history' }

type RequestInput =
  | { type: 'focus' }
  | { type: 'insert'; text: string; raw?: boolean }
  | { type: 'history' }

interface CmdlineState {
  /** Newest first, de-duplicated, capped at HISTORY_CAP. */
  history: string[]
  historyLoaded: boolean
  request: CmdlineRequest | null
  addHistory: (cmd: string) => void
  removeHistory: (cmd: string) => void
  clearHistory: () => void
  /** Queue a request for the CommandLine component. */
  post: (req: RequestInput) => void
  /** Called by CommandLine once it has handled `request`. */
  consume: (seq: number) => void
}

let seq = 0

function persist(history: string[]): void {
  void window.api?.store?.set(STORE_KEY, history)
}

export const useCmdlineStore = create<CmdlineState>((set, get) => ({
  history: [],
  historyLoaded: false,
  request: null,

  addHistory: (cmd) => {
    const history = pushHistory(get().history, cmd)
    set({ history })
    persist(history)
  },

  removeHistory: (cmd) => {
    const history = get().history.filter((h) => h !== cmd)
    set({ history })
    persist(history)
  },

  clearHistory: () => {
    set({ history: [] })
    persist([])
  },

  post: (req) => set({ request: { ...req, seq: ++seq } as CmdlineRequest }),

  consume: (s) => {
    if (get().request?.seq === s) set({ request: null })
  }
}))

let loading: Promise<void> | null = null

/**
 * Load history from disk once. Commands run before the load finishes are
 * kept in front of the saved ones.
 */
export function loadCmdlineHistory(): Promise<void> {
  if (loading) return loading
  loading = (async () => {
    let saved: unknown = null
    try {
      saved = await window.api?.store?.get(STORE_KEY)
    } catch {
      /* ignore — start empty */
    }
    const disk = Array.isArray(saved) ? saved.filter((h): h is string => typeof h === 'string') : []
    const session = useCmdlineStore.getState().history
    let merged = disk.slice(0, HISTORY_CAP)
    for (const cmd of [...session].reverse()) merged = pushHistory(merged, cmd)
    useCmdlineStore.setState({ history: merged, historyLoaded: true })
    if (session.length > 0) persist(merged)
  })()
  return loading
}

/** For tests only. */
export function _resetCmdlineStore(): void {
  loading = null
  useCmdlineStore.setState({ history: [], historyLoaded: false, request: null })
}
