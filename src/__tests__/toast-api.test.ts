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
})
