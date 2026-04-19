import { describe, it, expect, beforeEach } from 'vitest'
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
})
