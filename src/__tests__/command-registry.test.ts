import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  registerCommand,
  registerCommands,
  dispatchCommand,
  hasCommand,
  _resetCommandRegistry
} from '../renderer/src/commands/registry'

describe('command-registry', () => {
  beforeEach(() => _resetCommandRegistry())

  it('dispatches a registered handler', () => {
    const handler = vi.fn()
    registerCommand('foo', handler)
    const result = dispatchCommand('foo')
    expect(result).toBe(true)
    expect(handler).toHaveBeenCalledOnce()
  })

  it('returns false for unknown action ids', () => {
    const result = dispatchCommand('does-not-exist')
    expect(result).toBe(false)
  })

  it('reports registration status via hasCommand', () => {
    expect(hasCommand('bar')).toBe(false)
    registerCommand('bar', () => {})
    expect(hasCommand('bar')).toBe(true)
  })

  it('disposer removes only its own registration', () => {
    const handler = vi.fn()
    const dispose = registerCommand('foo', handler)
    dispose()
    expect(dispatchCommand('foo')).toBe(false)
    expect(handler).not.toHaveBeenCalled()
  })

  it('disposer does not clobber a later registration under the same id', () => {
    const first = vi.fn()
    const dispose = registerCommand('foo', first)
    const second = vi.fn()
    registerCommand('foo', second)
    dispose() // should be a no-op because `second` has taken the slot
    expect(hasCommand('foo')).toBe(true)
    dispatchCommand('foo')
    expect(second).toHaveBeenCalledOnce()
    expect(first).not.toHaveBeenCalled()
  })

  it('registerCommands returns a disposer that removes every entry', () => {
    const a = vi.fn()
    const b = vi.fn()
    const dispose = registerCommands({ a, b })
    expect(hasCommand('a')).toBe(true)
    expect(hasCommand('b')).toBe(true)
    dispose()
    expect(hasCommand('a')).toBe(false)
    expect(hasCommand('b')).toBe(false)
  })

  it('swallows async handler rejections instead of surfacing them', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    registerCommand('async-fail', async () => {
      throw new Error('boom')
    })
    dispatchCommand('async-fail')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})
