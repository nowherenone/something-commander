/**
 * MenuBar keyboard access (UX plan F-06 + F-24): arrow traversal inside open
 * menus, menu hopping, and Escape closing a menu WITHOUT firing the layer
 * beneath it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, act, cleanup, fireEvent } from '@testing-library/react'
import React from 'react'
import { MenuBar } from '../renderer/src/components/layout/MenuBar'

function key(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
}

describe('MenuBar keyboard model', () => {
  let bubbleSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    // Stands in for useKeyboard's window bubble listener — if the menubar
    // consumes a key, this must never fire.
    bubbleSpy = vi.fn()
    window.addEventListener('keydown', bubbleSpy)
    render(React.createElement(MenuBar, { onAction: () => {} }))
  })

  afterEach(() => {
    window.removeEventListener('keydown', bubbleSpy)
    cleanup()
  })

  function openMenu(label: string): void {
    const button = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent === label
    )
    expect(button, `${label} menu button`).toBeTruthy()
    act(() => {
      button!.click()
    })
  }

  const items = (): HTMLButtonElement[] =>
    Array.from(document.querySelectorAll('div[role="menu"] > button[role="menuitem"]'))

  it('renders menubar/menu/menuitem roles', () => {
    expect(document.querySelector('[role="menubar"]')).toBeTruthy()
    openMenu('File')
    const dropdown = document.querySelector('div[role="menu"]')
    expect(dropdown).toBeTruthy()
    expect(items().length).toBeGreaterThan(5)
  })

  it('ArrowDown moves focus between items', () => {
    openMenu('File')
    const list = items()
    act(() => list[0].focus())
    act(() => {
      window.dispatchEvent(key('ArrowDown'))
    })
    expect(document.activeElement).toBe(list[1])
  })

  it('ArrowDown from the last item wraps to the first', () => {
    openMenu('File')
    const list = items()
    act(() => list[list.length - 1].focus())
    act(() => {
      window.dispatchEvent(key('ArrowDown'))
    })
    expect(document.activeElement).toBe(list[0])
  })

  it('ArrowRight hops to the next menu', () => {
    openMenu('File')
    act(() => {
      window.dispatchEvent(key('ArrowRight'))
    })
    // File is the first menu — right hop lands on Mark with its dropdown open.
    const labels = Array.from(document.querySelectorAll('button[aria-haspopup="menu"]')).map(
      (b) => b.textContent
    )
    expect(labels).toContain('Mark')
    expect(document.querySelector('div[role="menu"]')?.getAttribute('aria-label')).toBe('Mark')
  })

  it('Escape closes the menu and never reaches listeners beneath (F-24)', () => {
    openMenu('File')
    expect(document.querySelector('div[role="menu"]')).toBeTruthy()
    act(() => {
      window.dispatchEvent(key('Escape'))
    })
    expect(document.querySelector('div[role="menu"]')).toBeNull()
    // The capture-phase close must consume the event so panel handlers
    // (overlay dismissal / cancel commands) don't also fire.
    expect(bubbleSpy).not.toHaveBeenCalled()
  })

  it('Tab dismisses the menu instead of walking into the hidden dropdown', () => {
    openMenu('File')
    act(() => {
      window.dispatchEvent(key('Tab'))
    })
    expect(document.querySelector('div[role="menu"]')).toBeNull()
  })

  it('activating a menu item dispatches its action and closes the menu', () => {
    const onAction = vi.fn()
    cleanup()
    window.removeEventListener('keydown', bubbleSpy)
    render(React.createElement(MenuBar, { onAction }))
    openMenu('File')
    const quitItem = items().find((b) => b.textContent?.includes('Quit'))
    act(() => {
      quitItem!.click()
    })
    expect(onAction).toHaveBeenCalledWith('quit')
    expect(document.querySelector('div[role="menu"]')).toBeNull()
  })

  // The version dropdown is a second, right-anchored menu — it must get the
  // same keyboard treatment as the main menus (F-06 gap found in audit).
  function openVersionMenu(): void {
    // __APP_VERSION__ is a build-time define (undefined under vitest), so
    // identify the version button as the right-side menu trigger that is not
    // one of the four main menus.
    const mainLabels = ['File', 'Mark', 'View', 'Tools']
    const versionButton = Array.from(
      document.querySelectorAll('button[aria-haspopup="menu"]')
    ).find((b) => !mainLabels.includes(b.textContent || ''))
    expect(versionButton, 'version button').toBeTruthy()
    act(() => {
      versionButton!.click() // same toggle path a mouse user takes
    })
  }

  it('version dropdown: arrows walk its items (F-06)', () => {
    openVersionMenu()
    const list = items() // only one [role="menu"] dropdown is open at a time
    expect(list.length).toBeGreaterThanOrEqual(2) // Check for Updates / About
    act(() => {
      list[0].focus()
      window.dispatchEvent(key('ArrowDown'))
    })
    expect(document.activeElement).toBe(list[1])
    act(() => {
      window.dispatchEvent(key('ArrowUp'))
    })
    expect(document.activeElement).toBe(list[0])
  })

  it('version dropdown: Home/End jump within items (F-06)', () => {
    openVersionMenu()
    const list = items()
    act(() => list[0].focus())
    act(() => {
      window.dispatchEvent(key('End'))
    })
    expect(document.activeElement).toBe(list[list.length - 1])
    act(() => {
      window.dispatchEvent(key('Home'))
    })
    expect(document.activeElement).toBe(list[0])
  })

  it('version dropdown: Escape closes it without firing layers beneath (F-06/F-24)', () => {
    openVersionMenu()
    expect(document.querySelector('div[role="menu"]')).toBeTruthy()
    act(() => {
      window.dispatchEvent(key('Escape'))
    })
    expect(document.querySelector('div[role="menu"]')).toBeNull()
    expect(bubbleSpy).not.toHaveBeenCalled()
  })

  it('version dropdown: activating About dispatches the about action', () => {
    const onAction = vi.fn()
    cleanup()
    window.removeEventListener('keydown', bubbleSpy)
    render(React.createElement(MenuBar, { onAction }))
    openVersionMenu()
    const aboutItem = items().find((b) => b.textContent?.includes('About'))
    act(() => {
      aboutItem!.click()
    })
    expect(onAction).toHaveBeenCalledWith('about')
  })

  it('version dropdown: Left/Right hand off to the nearest main menu (F-06)', () => {
    openVersionMenu()
    act(() => {
      window.dispatchEvent(key('ArrowRight'))
    })
    const dropdown = document.querySelector('div[role="menu"]')
    expect(dropdown?.getAttribute('aria-label')).toBe('File')
  })
})
