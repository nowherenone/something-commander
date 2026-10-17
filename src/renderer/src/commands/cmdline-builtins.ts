/**
 * Command-line built-ins that act on the panel instead of a shell:
 * `cd`, `mkdir`, `j <bookmark>`, plus "type a file name to open it".
 * Path math lives in @shared/cmdline (pure, unit-tested); this file only
 * wires it to the stores and IPC.
 */
import {
  innerStyleFor,
  matchBookmark,
  resolveInnerCd,
  resolveLocalCd,
  singleWord,
  type BuiltinName
} from '@shared/cmdline'
import type { Entry } from '@shared/types'
import { usePanelStore } from '../stores/panel-store'
import { useBookmarksStore } from '../stores/bookmarks-store'
import { previousLocation, rendererPlatform, type PanelId } from './cmdline-commands'

export interface BuiltinOutcome {
  /** Error text for the output pane; absent on success. */
  error?: string
  /** Informational output (e.g. the bookmark list for a bare `j`). */
  info?: string
}

let homeDir: string | null = null
async function home(): Promise<string> {
  if (homeDir === null) homeDir = await window.api.util.getHomeDir()
  return homeDir
}

const URL_LIKE = /^[a-z][a-z0-9+.-]*:\/\//i

async function cdLocal(panel: PanelId, arg: string | undefined): Promise<BuiltinOutcome> {
  const tab = usePanelStore.getState().getActiveTab(panel)
  const isLocal = tab.pluginId === 'local-filesystem'
  const res = resolveLocalCd(arg, {
    platform: rendererPlatform(),
    cwd: isLocal ? tab.locationId : null,
    home: await home(),
    previous: null
  })
  if (!res.ok) return { error: res.error }
  const info = await window.api.plugins.statEntry('local-filesystem', res.path)
  if (!info) return { error: `cd: no such directory: ${res.path}` }
  if (!info.isDirectory) return { error: `cd: not a directory: ${res.path}` }
  if (isLocal) await usePanelStore.getState().navigate(panel, res.path)
  else await usePanelStore.getState().navigateWithPlugin(panel, 'local-filesystem', res.path)
  return {}
}

async function cdPlugin(panel: PanelId, arg: string): Promise<BuiltinOutcome> {
  const store = usePanelStore.getState()
  const tab = store.getActiveTab(panel)
  const a = arg.trim()

  if (a === '..' || a === '../') {
    if (tab.parentId === null) return { error: 'cd: already at the top of this location' }
    await store.navigate(panel, tab.parentId)
    return {}
  }
  if (URL_LIKE.test(a)) {
    const resolved = await window.api.plugins.resolveLocation(tab.pluginId, a)
    if (resolved === null) return { error: `cd: can't open ${a} from this panel` }
    await store.navigate(panel, resolved)
    return {}
  }
  // A Windows drive path from a remote panel jumps back to the local disk.
  if (rendererPlatform() === 'win32' && /^[A-Za-z]:/.test(a)) return cdLocal(panel, a)
  const inner = innerStyleFor(tab.pluginId)
  if (inner && tab.locationId) {
    const res = resolveInnerCd(a, tab.locationId, inner.style, inner.lastSep)
    if (!res.ok) return { error: res.error }
    await store.navigate(panel, res.path)
    return {}
  }
  // Generic fallback (SMB, plugin roots): a container in the current listing.
  const match = tab.entries.find((e) => e.isContainer && e.name === a)
  if (match) {
    await store.navigate(panel, match.id)
    return {}
  }
  return { error: `cd: can't resolve "${a}" here` }
}

async function cd(panel: PanelId, args: string[]): Promise<BuiltinOutcome> {
  const arg = args[0]
  if (arg === '-') {
    const prev = previousLocation(panel)
    if (!prev) return { error: 'cd: no previous directory' }
    await usePanelStore.getState().navigateWithPlugin(panel, prev.pluginId, prev.locationId)
    return {}
  }
  const tab = usePanelStore.getState().getActiveTab(panel)
  if (tab.pluginId === 'local-filesystem') return cdLocal(panel, arg)
  // Bare `cd` / `cd ~` from a remote panel goes home on the local disk.
  if (arg === undefined || arg === '' || arg === '~') return cdLocal(panel, arg)
  return cdPlugin(panel, arg)
}

async function mkdir(panel: PanelId, args: string[]): Promise<BuiltinOutcome> {
  const store = usePanelStore.getState()
  const tab = store.getActiveTab(panel)
  const name = args[0]
  if (!tab.locationId) return { error: 'mkdir: no current directory here' }
  const ops = await window.api.plugins.getSupportedOperations(tab.pluginId)
  if (!ops.includes('createDirectory')) return { error: 'mkdir: this location does not support new folders' }
  const result = await window.api.plugins.executeOperation(tab.pluginId, {
    op: 'createDirectory',
    parentLocationId: tab.locationId,
    name
  })
  if (!result?.success) {
    return { error: `mkdir: ${result?.errors?.[0]?.message || 'could not create folder'}` }
  }
  await store.refresh(panel)
  return {}
}

async function jump(panel: PanelId, args: string[]): Promise<BuiltinOutcome> {
  const bookmarks = useBookmarksStore.getState().bookmarks
  const query = args.join(' ')
  if (!query) {
    if (bookmarks.length === 0) return { info: 'No bookmarks yet. Add one from the drive menu (Alt+F1 / Alt+F2).' }
    return { info: bookmarks.map((b) => `${b.name}\t${b.path}`).join('\n') }
  }
  const bm = matchBookmark(bookmarks, query)
  if (!bm) return { error: `j: no bookmark matches "${query}"` }
  await usePanelStore.getState().navigateWithPlugin(panel, bm.pluginId || 'local-filesystem', bm.path)
  return {}
}

export async function runBuiltin(panel: PanelId, name: BuiltinName, args: string[]): Promise<BuiltinOutcome> {
  try {
    if (name === 'cd') return await cd(panel, args)
    if (name === 'mkdir') return await mkdir(panel, args)
    return await jump(panel, args)
  } catch (err) {
    return { error: `${name}: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/**
 * "Type a file's name to open it": the whole line is one word naming an
 * existing, non-executable file in the panel. Executables go to the shell.
 */
export function findOpenableEntry(entries: readonly Entry[], line: string): Entry | null {
  const platform = rendererPlatform()
  const word = singleWord(line, platform)
  if (!word || /[\\/]/.test(word)) return null
  const fold = platform === 'win32' || platform === 'darwin'
  const eq = (a: string): boolean => (fold ? a.toLowerCase() === word.toLowerCase() : a === word)
  const entry = entries.find((e) => eq(e.name)) ?? null
  if (!entry || entry.isContainer || entry.attributes?.executable) return null
  return entry
}
