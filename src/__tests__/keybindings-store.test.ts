import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useKeybindingsStore, DEFAULT_KEYBINDINGS } from '../renderer/src/stores/keybindings-store'

describe('keybindings-store', () => {
  beforeEach(() => {
    useKeybindingsStore.setState({ bindings: [...DEFAULT_KEYBINDINGS] })
  })

  it('has default bindings loaded', () => {
    expect(useKeybindingsStore.getState().bindings.length).toBeGreaterThan(10)
  })

  it('updateBinding replaces a binding at the given index', () => {
    useKeybindingsStore.getState().updateBinding(0, { key: 'X', action: 'test' })
    expect(useKeybindingsStore.getState().bindings[0]).toEqual({ key: 'X', action: 'test' })
  })

  it('resetBindings restores defaults', () => {
    useKeybindingsStore.getState().updateBinding(0, { key: 'X', action: 'test' })
    expect(useKeybindingsStore.getState().bindings[0].action).toBe('test')

    useKeybindingsStore.getState().resetBindings()
    expect(useKeybindingsStore.getState().bindings[0].action).toBe(DEFAULT_KEYBINDINGS[0].action)
  })

  it('matchAction resolves F5 to copy', () => {
    const action = useKeybindingsStore.getState().matchAction(
      new KeyboardEvent('keydown', { key: 'F5' })
    )
    expect(action).toBe('copy')
  })

  it('matchAction resolves Ctrl+A to selectAll (lowercase fallback)', () => {
    const action = useKeybindingsStore.getState().matchAction(
      new KeyboardEvent('keydown', { key: 'a', ctrlKey: true })
    )
    expect(action).toBe('selectAll')
  })

  it('matchAction resolves Ctrl+Shift+D to deselectAll, not the Ctrl+D drive menu', () => {
    const action = useKeybindingsStore.getState().matchAction(
      new KeyboardEvent('keydown', { key: 'D', ctrlKey: true, shiftKey: true })
    )
    expect(action).toBe('deselectAll')
  })

  it('matchAction returns null for unbound keys', () => {
    const action = useKeybindingsStore.getState().matchAction(
      new KeyboardEvent('keydown', { key: 'z' })
    )
    expect(action).toBeNull()
  })

  it('matchAction resolves Ctrl+C to copyNames (F-04: no clipboard hijack)', () => {
    const action = useKeybindingsStore.getState().matchAction(
      new KeyboardEvent('keydown', { key: 'c', ctrlKey: true })
    )
    expect(action).toBe('copyNames')
  })

  it('matchAction resolves Ctrl+Shift+C to compare (relocated from Ctrl+C)', () => {
    const action = useKeybindingsStore.getState().matchAction(
      new KeyboardEvent('keydown', { key: 'C', ctrlKey: true, shiftKey: true })
    )
    expect(action).toBe('compare')
  })

  it('matchAction resolves Ctrl+L to focusAddressBar (F-03)', () => {
    const action = useKeybindingsStore.getState().matchAction(
      new KeyboardEvent('keydown', { key: 'l', ctrlKey: true })
    )
    expect(action).toBe('focusAddressBar')
  })
})

describe('keybindings migration (saved blobs from before a rebind)', () => {
  beforeEach(() => {
    localStorage.removeItem('flemanager-keybindings')
  })

  it('migrates a saved pre-v2 blob that still binds Ctrl+C to compare', async () => {
    // Simulate a user whose stored bindings predate the Ctrl+C rebind.
    const saved = DEFAULT_KEYBINDINGS.filter((b) => !(b.key === 'l' && b.ctrl))
    localStorage.setItem('flemanager-keybindings', JSON.stringify(saved))
    // Reload the module so loadBindings() runs against the saved blob.
    vi.resetModules()
    const { useKeybindingsStore: fresh } = await import('../renderer/src/stores/keybindings-store')
    const bindings = fresh.getState().bindings
    const plainC = bindings.find((b) => b.key === 'c' && b.ctrl && !b.shift)
    const shiftC = bindings.find((b) => b.key === 'c' && b.ctrl && b.shift)
    expect(plainC?.action).toBe('copyNames')
    expect(shiftC?.action).toBe('compare')
  })

  it('keeps genuinely custom chords when migrating', async () => {
    const custom = [...DEFAULT_KEYBINDINGS, { key: 'g', ctrl: true, action: 'customThing' }]
    localStorage.setItem('flemanager-keybindings', JSON.stringify(custom))
    vi.resetModules()
    const { useKeybindingsStore: fresh } = await import('../renderer/src/stores/keybindings-store')
    const bindings = fresh.getState().bindings
    expect(bindings.some((b) => b.action === 'customThing')).toBe(true)
    // And the old hijack is gone even so.
    expect(bindings.find((b) => b.key === 'c' && b.ctrl && !b.shift)?.action).toBe('copyNames')
  })
})
