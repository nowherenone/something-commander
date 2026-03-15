import { describe, it, expect, beforeEach } from 'vitest'
import { useOperationsStore } from '../renderer/src/stores/operations-store'
import type { Entry } from '../shared/types/entry'

function makeEntry(name: string): Entry {
  return {
    id: `/test/${name}`,
    name,
    isContainer: false,
    size: 100,
    modifiedAt: 1000000,
    mimeType: 'text/plain',
    iconHint: 'file',
    meta: { extension: 'txt' },
    attributes: { readonly: false, hidden: false, symlink: false }
  }
}

describe('operations-store', () => {
  beforeEach(() => {
    useOperationsStore.setState({ operations: [], showDialog: false })
  })

  it('starts with no operations', () => {
    expect(useOperationsStore.getState().operations).toHaveLength(0)
  })

  it('enqueue adds a queued operation and shows dialog', () => {
    const id = useOperationsStore.getState().enqueue({
      type: 'copy',
      sourceEntries: [makeEntry('a.txt'), makeEntry('b.txt')],
      sourcePluginId: 'local-filesystem',
      destinationDisplay: '/dest',
      destinationLocationId: '/dest',
      destinationPluginId: 'local-filesystem'
    })

    const state = useOperationsStore.getState()
    expect(state.operations).toHaveLength(1)
    expect(state.operations[0].id).toBe(id)
    expect(state.operations[0].status).toBe('queued')
    expect(state.operations[0].totalFiles).toBe(2)
    expect(state.operations[0].overwritePolicy).toBe('ask')
    expect(state.showDialog).toBe(true)
  })

  it('updateOperation updates fields', () => {
    const id = useOperationsStore.getState().enqueue({
      type: 'move',
      sourceEntries: [makeEntry('a.txt')],
      sourcePluginId: 'local-filesystem',
      destinationDisplay: '/dest',
      destinationLocationId: '/dest',
      destinationPluginId: 'local-filesystem'
    })

    useOperationsStore.getState().updateOperation(id, {
      status: 'running',
      currentFile: 'a.txt',
      processedFiles: 1
    })

    const op = useOperationsStore.getState().operations[0]
    expect(op.currentFile).toBe('a.txt')
    expect(op.processedFiles).toBe(1)
    expect(op.status).toBe('running')
  })

  it('cancelOperation sets status to cancelled', () => {
    const id = useOperationsStore.getState().enqueue({
      type: 'delete',
      sourceEntries: [makeEntry('a.txt')],
      sourcePluginId: 'local-filesystem',
      destinationDisplay: '',
      destinationLocationId: '',
      destinationPluginId: 'local-filesystem'
    })

    useOperationsStore.getState().cancelOperation(id)
    expect(useOperationsStore.getState().operations[0].status).toBe('cancelled')
  })

  it('removeOperation removes it and hides dialog if empty', () => {
    const id = useOperationsStore.getState().enqueue({
      type: 'copy',
      sourceEntries: [makeEntry('a.txt')],
      sourcePluginId: 'local-filesystem',
      destinationDisplay: '/dest',
      destinationLocationId: '/dest',
      destinationPluginId: 'local-filesystem'
    })

    useOperationsStore.getState().removeOperation(id)
    expect(useOperationsStore.getState().operations).toHaveLength(0)
    expect(useOperationsStore.getState().showDialog).toBe(false)
  })

  it('clearCompleted removes non-active operations', () => {
    useOperationsStore.getState().enqueue({
      type: 'copy',
      sourceEntries: [makeEntry('a.txt')],
      sourcePluginId: 'local-filesystem',
      destinationDisplay: '/dest',
      destinationLocationId: '/dest',
      destinationPluginId: 'local-filesystem'
    })

    const id2 = useOperationsStore.getState().enqueue({
      type: 'move',
      sourceEntries: [makeEntry('b.txt')],
      sourcePluginId: 'local-filesystem',
      destinationDisplay: '/dest',
      destinationLocationId: '/dest',
      destinationPluginId: 'local-filesystem'
    })

    // Mark first as running, second as done
    const ops = useOperationsStore.getState().operations
    useOperationsStore.getState().updateOperation(ops[0].id, { status: 'running' })
    useOperationsStore.getState().updateOperation(id2, { status: 'done' })
    useOperationsStore.getState().clearCompleted()

    const remaining = useOperationsStore.getState().operations
    // running is kept, done is removed, so 1 remains
    expect(remaining).toHaveLength(1)
    expect(remaining[0].status).toBe('running')
  })

  it('getCurrentOperation returns running or first queued', () => {
    useOperationsStore.getState().enqueue({
      type: 'copy',
      sourceEntries: [makeEntry('a.txt')],
      sourcePluginId: 'local-filesystem',
      destinationDisplay: '/dest',
      destinationLocationId: '/dest',
      destinationPluginId: 'local-filesystem'
    })

    useOperationsStore.getState().enqueue({
      type: 'move',
      sourceEntries: [makeEntry('b.txt')],
      sourcePluginId: 'local-filesystem',
      destinationDisplay: '/dest',
      destinationLocationId: '/dest',
      destinationPluginId: 'local-filesystem'
    })

    const current = useOperationsStore.getState().getCurrentOperation()
    expect(current).toBeDefined()
    expect(current?.status).toBe('queued')
    expect(current?.type).toBe('copy')
  })

  it('calculates totalBytes from entry sizes', () => {
    useOperationsStore.getState().enqueue({
      type: 'copy',
      sourceEntries: [
        makeEntry('a.txt'), // size 100
        makeEntry('b.txt')  // size 100
      ],
      sourcePluginId: 'local-filesystem',
      destinationDisplay: '/dest',
      destinationLocationId: '/dest',
      destinationPluginId: 'local-filesystem'
    })

    expect(useOperationsStore.getState().operations[0].totalBytes).toBe(200)
  })
})
