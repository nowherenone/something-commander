/**
 * Drives the shipped showToast option normalizer path via the public API
 * after ToastContainer registers the global handler.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'
import React from 'react'
import { ToastContainer, showToast } from '../renderer/src/components/layout/Toast'

describe('showToast API (shipped Toast)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('dedupes identical text so the same message is not stacked', () => {
    render(React.createElement(ToastContainer))
    act(() => {
      showToast('Hello', { variant: 'info' })
      showToast('Hello', { variant: 'info' })
    })
    const bodies = document.querySelectorAll('[role="status"]')
    expect(bodies.length).toBe(1)
    expect(bodies[0].textContent).toContain('Hello')
  })

  it('dedupeKey replaces prior toast with the same key', () => {
    render(React.createElement(ToastContainer))
    act(() => {
      showToast('Update 1 is available.', { dedupeKey: 'app-update', variant: 'info' })
      showToast('Update 1 available — downloading…', {
        dedupeKey: 'app-update',
        variant: 'info'
      })
    })
    const bodies = document.querySelectorAll('[role="status"]')
    expect(bodies.length).toBe(1)
    expect(bodies[0].textContent).toContain('downloading')
  })

  it('accepts legacy duration number as second argument', () => {
    render(React.createElement(ToastContainer))
    act(() => {
      showToast('Legacy', 3000)
    })
    expect(document.querySelectorAll('[role="status"]').length).toBe(1)
  })

  it('bumps a repeat counter (×N) instead of stacking identical messages (F-26)', () => {
    render(React.createElement(ToastContainer))
    act(() => {
      showToast('Disk full')
      showToast('Disk full')
      showToast('Disk full')
    })
    const bodies = document.querySelectorAll('[role="status"]')
    expect(bodies.length).toBe(1)
    expect(bodies[0].textContent).toContain('×3')
  })

  it('collapses toasts beyond the cap into a "+N more" chip (F-26)', () => {
    render(React.createElement(ToastContainer))
    act(() => {
      showToast('One', { duration: 60000 })
      showToast('Two', { duration: 60000 })
      showToast('Three', { duration: 60000 })
      showToast('Four', { duration: 60000 })
      showToast('Five', { duration: 60000 })
    })
    // Only the newest three render; older ones surface via the chip.
    expect(document.querySelectorAll('[role="status"]').length).toBe(3)
    const chip = document.querySelector('[data-testid="toast-overflow"]')
    expect(chip?.textContent).toContain('+2 more')
  })

  it('ages out hidden toasts so the chip drains (F-26)', () => {
    render(React.createElement(ToastContainer))
    act(() => {
      for (let i = 0; i < 5; i++) showToast(`Message ${i}`, { duration: 4000 })
    })
    expect(document.querySelector('[data-testid="toast-overflow"]')).toBeTruthy()
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(document.querySelectorAll('[role="status"]').length).toBe(0)
    expect(document.querySelector('[data-testid="toast-overflow"]')).toBeFalsy()
  })
})
