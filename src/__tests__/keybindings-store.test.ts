import { describe, it, expect, beforeEach } from 'vitest'
import { useKeybindingsStore, DEFAULT_KEYBINDINGS } from '../renderer/src/stores/keybindings-store'

describe('keybindings-store', () => {
  beforeEach(() => {
    useKeybindingsStore.setState({ bindings: [...DEFAULT_KEYBINDINGS] })
  })

  it('has default bindings loaded', () => {
    expect(useKeybindingsStore.getState().bindings.length).toBeGreaterThan(10)
  })

  it('matchAction finds Tab -> switchPanel', () => {
    const event = new KeyboardEvent('keydown', { key: 'Tab' })
    const action = useKeybindingsStore.getState().matchAction(event)
    expect(action).toBe('switchPanel')
  })

  it('matchAction finds F5 -> copy', () => {
    const event = new KeyboardEvent('keydown', { key: 'F5' })
    const action = useKeybindingsStore.getState().matchAction(event)
    expect(action).toBe('copy')
  })

  it('matchAction finds Ctrl+A -> selectAll', () => {
    const event = new KeyboardEvent('keydown', { key: 'a', ctrlKey: true })
    const action = useKeybindingsStore.getState().matchAction(event)
    expect(action).toBe('selectAll')
  })

  it('matchAction finds Ctrl+M -> multiRename', () => {
    const event = new KeyboardEvent('keydown', { key: 'm', ctrlKey: true })
    const action = useKeybindingsStore.getState().matchAction(event)
    expect(action).toBe('multiRename')
  })

  it('matchAction returns null for unbound keys', () => {
    const event = new KeyboardEvent('keydown', { key: 'z' })
    const action = useKeybindingsStore.getState().matchAction(event)
    expect(action).toBeNull()
  })

  it('resetBindings restores defaults', () => {
    useKeybindingsStore.getState().updateBinding(0, { key: 'X', action: 'test' })
    expect(useKeybindingsStore.getState().bindings[0].action).toBe('test')

    useKeybindingsStore.getState().resetBindings()
    expect(useKeybindingsStore.getState().bindings[0].action).toBe(DEFAULT_KEYBINDINGS[0].action)
  })
})
