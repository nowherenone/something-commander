import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  useKeybindingsStore,
  DEFAULT_KEYBINDINGS,
  migrateCmdlineBindings,
  type Keybinding
} from '../renderer/src/stores/keybindings-store'

const match = (init: KeyboardEventInit): string | null =>
  useKeybindingsStore.getState().matchAction(new KeyboardEvent('keydown', init))

describe('command-line keybindings', () => {
  beforeEach(() => {
    useKeybindingsStore.setState({ bindings: [...DEFAULT_KEYBINDINGS] })
  })

  it('Ctrl+Enter pastes the name; rename is F2 only', () => {
    expect(match({ key: 'Enter', ctrlKey: true })).toBe('cmdlinePasteName')
    expect(match({ key: 'Enter', ctrlKey: true, shiftKey: true })).toBe('cmdlinePastePath')
    expect(match({ key: 'p', ctrlKey: true })).toBe('cmdlinePasteDir')
    expect(match({ key: 'F8', altKey: true })).toBe('cmdlineHistory')
    expect(match({ key: 'e', ctrlKey: true })).toBe('focusCommandLine')
    expect(match({ key: 'F2' })).toBe('rename')
    expect(DEFAULT_KEYBINDINGS.filter((b) => b.action === 'rename').map((b) => b.key)).toEqual(['F2'])
  })

  it('new chords do not collide with existing defaults', () => {
    const seen = new Map<string, string>()
    for (const b of DEFAULT_KEYBINDINGS) {
      const k = `${b.key}|${!!b.ctrl}|${!!b.alt}|${!!b.shift}`
      expect(seen.has(k), `${k} bound to ${seen.get(k)} and ${b.action}`).toBe(false)
      seen.set(k, b.action)
    }
  })
})

describe('migrateCmdlineBindings (v4)', () => {
  const legacy: Keybinding[] = [
    { key: 'F2', action: 'rename' },
    { key: 'Enter', ctrl: true, action: 'rename' },
    { key: 'F5', action: 'copy' }
  ]

  it('drops Ctrl+Enter → rename and adds the command-line chords', () => {
    const out = migrateCmdlineBindings(legacy)
    expect(out.find((b) => b.key === 'Enter' && b.ctrl && !b.shift)?.action).toBe('cmdlinePasteName')
    expect(out.filter((b) => b.action === 'rename')).toEqual([{ key: 'F2', action: 'rename' }])
    expect(out.map((b) => b.action)).toEqual(
      expect.arrayContaining(['focusCommandLine', 'cmdlinePastePath', 'cmdlinePasteDir', 'cmdlineHistory'])
    )
  })

  it('does not override a chord the user already uses', () => {
    const out = migrateCmdlineBindings([...legacy, { key: 'p', ctrl: true, action: 'customThing' }])
    expect(out.filter((b) => b.key === 'p' && b.ctrl).map((b) => b.action)).toEqual(['customThing'])
  })

  it('is a no-op for blobs that already know the command-line actions', () => {
    const custom: Keybinding[] = [
      { key: 'Enter', ctrl: true, action: 'rename' },
      { key: 'F6', ctrl: true, action: 'cmdlinePasteName' }
    ]
    expect(migrateCmdlineBindings(custom)).toEqual(custom)
  })

  it('runs on load for a saved pre-v4 blob', async () => {
    localStorage.setItem('flemanager-keybindings', JSON.stringify(legacy))
    vi.resetModules()
    const { useKeybindingsStore: fresh } = await import('../renderer/src/stores/keybindings-store')
    const ctrlEnter = fresh.getState().bindings.filter((b) => b.key === 'Enter' && b.ctrl && !b.shift)
    expect(ctrlEnter.map((b) => b.action)).toEqual(['cmdlinePasteName'])
    localStorage.removeItem('flemanager-keybindings')
  })
})
