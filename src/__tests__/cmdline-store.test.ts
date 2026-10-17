import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useCmdlineStore, loadCmdlineHistory, _resetCmdlineStore } from '../renderer/src/stores/cmdline-store'
import { HISTORY_CAP } from '../shared/cmdline'

const store = window.api.store as unknown as { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> }

describe('cmdline-store history', () => {
  beforeEach(() => {
    _resetCmdlineStore()
    store.get.mockReset().mockResolvedValue(null)
    store.set.mockReset().mockResolvedValue(undefined)
  })

  it('adds newest first, de-duplicated, and persists via window.api.store', () => {
    const s = useCmdlineStore.getState()
    s.addHistory('ls')
    s.addHistory('pwd')
    s.addHistory('ls')
    expect(useCmdlineStore.getState().history).toEqual(['ls', 'pwd'])
    expect(store.set).toHaveBeenLastCalledWith('cmdline-history', ['ls', 'pwd'])
  })

  it('caps at HISTORY_CAP entries', () => {
    for (let i = 0; i < HISTORY_CAP + 20; i++) useCmdlineStore.getState().addHistory(`c${i}`)
    expect(useCmdlineStore.getState().history).toHaveLength(HISTORY_CAP)
    expect(useCmdlineStore.getState().history[0]).toBe(`c${HISTORY_CAP + 19}`)
  })

  it('loads saved history and keeps commands run before the load finished', async () => {
    store.get.mockResolvedValue(['old2', 'old1', 42])
    useCmdlineStore.getState().addHistory('early')
    await loadCmdlineHistory()
    expect(useCmdlineStore.getState().history).toEqual(['early', 'old2', 'old1'])
    expect(useCmdlineStore.getState().historyLoaded).toBe(true)
  })

  it('loads only once', async () => {
    store.get.mockResolvedValue(['a'])
    await loadCmdlineHistory()
    await loadCmdlineHistory()
    expect(store.get).toHaveBeenCalledTimes(1)
  })

  it('removeHistory and clearHistory persist', () => {
    const s = useCmdlineStore.getState()
    s.addHistory('a')
    s.addHistory('b')
    s.removeHistory('a')
    expect(useCmdlineStore.getState().history).toEqual(['b'])
    s.clearHistory()
    expect(store.set).toHaveBeenLastCalledWith('cmdline-history', [])
  })

  it('post/consume queue a single request', () => {
    const s = useCmdlineStore.getState()
    s.post({ type: 'insert', text: 'x' })
    const req = useCmdlineStore.getState().request!
    expect(req).toMatchObject({ type: 'insert', text: 'x' })
    s.consume(req.seq - 1)
    expect(useCmdlineStore.getState().request).not.toBeNull()
    s.consume(req.seq)
    expect(useCmdlineStore.getState().request).toBeNull()
  })
})
