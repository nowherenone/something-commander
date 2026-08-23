import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { DEFAULT_KEYBINDINGS } from '../renderer/src/stores/keybindings-store'

/**
 * Dead-action registry lint (UX plan F-01..F-04 exit gate).
 *
 * dispatchCommand silently no-ops for unregistered ids — exactly how
 * File ▸ Open, Ctrl+L, and the F1/F4/F10 fn-bar buttons stayed dead. This lint
 * makes "a visible control references an action nobody handles" a test
 * failure instead of a discovery.
 */
const SRC = join(__dirname, '..', 'renderer', 'src')
const appSource = readFileSync(join(SRC, 'App.tsx'), 'utf8')
const menuBarSource = readFileSync(join(SRC, 'components', 'layout', 'MenuBar.tsx'), 'utf8')

/** Action ids handled inline by useKeyboard's nav switch, never registered. */
const NAV_PRIMITIVES = new Set([
  'switchPanel',
  'activate',
  'goUp',
  'spaceSelect',
  'insertSelect',
  'cursorHome',
  'cursorEnd',
  'pageUp',
  'pageDown'
])

function isRegisteredInApp(id: string): boolean {
  // registerCommands({ id: handler }) — match `id:` at an object-literal key.
  return new RegExp(`\\b${id}:`).test(appSource)
}

describe('every visible action has a registered command handler', () => {
  it('registers every MenuBar action id', () => {
    const ids = [...menuBarSource.matchAll(/action:\s*'([a-zA-Z][\w]*)'/g)].map((m) => m[1])
    expect(ids.length).toBeGreaterThan(20)
    const unregistered = [...new Set(ids)].filter((id) => !isRegisteredInApp(id))
    expect(unregistered, `MenuBar actions with no command in App.tsx: ${unregistered.join(', ')}`).toEqual([])
  })

  it('registers every keybinding action (except inline nav primitives)', () => {
    const actions = [...new Set(DEFAULT_KEYBINDINGS.map((b) => b.action))].filter(
      (a) => !NAV_PRIMITIVES.has(a)
    )
    const unregistered = actions.filter((id) => !isRegisteredInApp(id))
    expect(unregistered, `Keybound actions with no command in App.tsx: ${unregistered.join(', ')}`).toEqual([])
  })

  it('wires all ten function-key buttons (no dead fn-bar buttons)', () => {
    for (let n = 1; n <= 10; n++) {
      expect(appSource).toMatch(new RegExp(`onF${n}=`))
    }
    // And FunctionKeyBar passes each through to a button.
    const barSource = readFileSync(join(SRC, 'components', 'layout', 'FunctionKeyBar.tsx'), 'utf8')
    for (let n = 1; n <= 10; n++) {
      expect(barSource).toMatch(new RegExp(`onF${n}\\}`))
    }
  })
})

describe('Ctrl+C is not hijacked away from the clipboard (F-04)', () => {
  it('binds plain Ctrl+C to copyNames and Compare to Ctrl+Shift+C', () => {
    const plainC = DEFAULT_KEYBINDINGS.find((b) => b.key === 'c' && b.ctrl && !b.shift)
    const shiftC = DEFAULT_KEYBINDINGS.find((b) => b.key === 'c' && b.ctrl && b.shift)
    expect(plainC?.action).toBe('copyNames')
    expect(shiftC?.action).toBe('compare')
  })
})
