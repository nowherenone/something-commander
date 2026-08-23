/**
 * MultiRename per-file failure handling (UX plan F-07): failures collect as a
 * per-file list with friendly messages instead of one raw-error toast.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, fireEvent, cleanup, waitFor } from '@testing-library/react'
import React from 'react'
import { MultiRename } from '../renderer/src/components/dialogs/MultiRename'
import type { Entry } from '@shared/types'

const api = (window as unknown as { api: { plugins: { executeOperation: ReturnType<typeof vi.fn> } } }).api

function entry(name: string): Entry {
  return {
    id: `/tmp/${name}`,
    name,
    isContainer: false,
    size: 10,
    modifiedAt: 0,
    mimeType: '',
    iconHint: 'file',
    meta: {},
    attributes: { readonly: false, hidden: false, symlink: false }
  }
}

describe('MultiRename failures (F-07)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps the dialog open with a per-file list and friendly messages on failure', async () => {
    const onDone = vi.fn()
    const { container, getByPlaceholderText, getByText } = render(
      React.createElement(MultiRename, {
        entries: [entry('alpha.txt'), entry('beta.txt')],
        pluginId: 'local-filesystem',
        onClose: vi.fn(),
        onDone
      })
    )

    // Make both rows "changed": replace 'a' → 'X' (alpha→XlphX, beta stays beta? no — beta has no 'a'... use 'a'→'X' only renames alpha; use 't'→'Z' hits both).
    const search = getByPlaceholderText('Text to find') as HTMLInputElement
    fireEvent.change(search, { target: { value: 't' } })
    const replace = getByPlaceholderText('Replacement ([C] = counter)') as HTMLInputElement
    fireEvent.change(replace, { target: { value: 'Z' } })

    // First rename succeeds, second fails with a raw OS error.
    api.plugins.executeOperation
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({
        success: false,
        errors: [{ message: 'EBUSY: resource busy or locked, open /tmp/beta.txt' }]
      })

    const apply = getByText(/Rename 2 files/)
    fireEvent.click(apply)

    await waitFor(() =>
      expect(container.querySelector('[data-testid="rename-failures"]')).toBeTruthy()
    )
    const failures = container.querySelector('[data-testid="rename-failures"]')
    expect(failures).toBeTruthy()
    // Friendly wording, not the raw EBUSY string.
    expect(failures?.textContent).toContain('in use by another program')
    expect(failures?.textContent).not.toContain('EBUSY')
    expect(failures?.textContent).toContain('beta.txt → beZa.ZxZ')
    // Dialog stays open; onDone only fires on full success.
    expect(onDone).not.toHaveBeenCalled()
  })

  it('closes with a success toast when every rename succeeds', async () => {
    const onDone = vi.fn()
    const { getByPlaceholderText, getByText } = render(
      React.createElement(MultiRename, {
        entries: [entry('alpha.txt')],
        pluginId: 'local-filesystem',
        onClose: vi.fn(),
        onDone
      })
    )
    const search = getByPlaceholderText('Text to find') as HTMLInputElement
    fireEvent.change(search, { target: { value: 'alpha' } })
    const replace = getByPlaceholderText('Replacement ([C] = counter)') as HTMLInputElement
    fireEvent.change(replace, { target: { value: 'gamma' } })

    api.plugins.executeOperation.mockResolvedValue({ success: true })
    fireEvent.click(getByText(/Rename 1 file/))
    await Promise.resolve()
    await Promise.resolve()

    expect(onDone).toHaveBeenCalled()
  })
})
