import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from '../renderer/src/stores/app-store'

describe('app-store', () => {
  beforeEach(() => {
    useAppStore.setState({ activePanel: 'left', splitRatio: 0.5 })
  })

  it('starts with left panel active', () => {
    expect(useAppStore.getState().activePanel).toBe('left')
  })

  it('toggleActivePanel switches between left and right', () => {
    useAppStore.getState().toggleActivePanel()
    expect(useAppStore.getState().activePanel).toBe('right')

    useAppStore.getState().toggleActivePanel()
    expect(useAppStore.getState().activePanel).toBe('left')
  })

  it('setActivePanel sets specific panel', () => {
    useAppStore.getState().setActivePanel('right')
    expect(useAppStore.getState().activePanel).toBe('right')

    useAppStore.getState().setActivePanel('left')
    expect(useAppStore.getState().activePanel).toBe('left')
  })

  it('setSplitRatio clamps between 0.15 and 0.85', () => {
    useAppStore.getState().setSplitRatio(0.5)
    expect(useAppStore.getState().splitRatio).toBe(0.5)

    useAppStore.getState().setSplitRatio(0.01)
    expect(useAppStore.getState().splitRatio).toBe(0.15)

    useAppStore.getState().setSplitRatio(0.99)
    expect(useAppStore.getState().splitRatio).toBe(0.85)
  })

  it('starts with 50/50 split', () => {
    expect(useAppStore.getState().splitRatio).toBe(0.5)
  })
})
