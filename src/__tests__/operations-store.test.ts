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

  it('enqueue adds an enumerating operation and shows dialog', () => {
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
    expect(state.operations[0].status).toBe('enumerating')
    expect(state.operations[0].fileList).toEqual([])
    expect(state.showDialog).toBe(true)
  })

  it('updateOperation updates fields including fileList', () => {
    const id = useOperationsStore.getState().enqueue({
      type: 'copy',
      sourceEntries: [makeEntry('a.txt')],
      sourcePluginId: 'local-filesystem',
      destinationDisplay: '/dest',
      destinationLocationId: '/dest',
      destinationPluginId: 'local-filesystem'
    })

    useOperationsStore.getState().updateOperation(id, {
      status: 'running',
      fileList: [
        { sourcePath: '/test/a.txt', destPath: '/dest/a.txt', size: 100, isDirectory: false, relativePath: 'a.txt' }
      ],
      totalFiles: 1,
      totalBytes: 100,
      currentFile: 'a.txt',
      processedFiles: 1,
      processedBytes: 100
    })

    const op = useOperationsStore.getState().operations[0]
    expect(op.status).toBe('running')
    expect(op.fileList).toHaveLength(1)
    expect(op.totalFiles).toBe(1)
    expect(op.processedFiles).toBe(1)
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

  it('getCurrentOperation returns running or enumerating first', () => {
    useOperationsStore.getState().enqueue({
      type: 'copy',
      sourceEntries: [makeEntry('a.txt')],
      sourcePluginId: 'local-filesystem',
      destinationDisplay: '/dest',
      destinationLocationId: '/dest',
      destinationPluginId: 'local-filesystem'
    })

    const current = useOperationsStore.getState().getCurrentOperation()
    expect(current).toBeDefined()
    expect(current?.status).toBe('enumerating')
  })

  it('clearCompleted keeps running and queued ops', () => {
    const id1 = useOperationsStore.getState().enqueue({
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

    useOperationsStore.getState().updateOperation(id1, { status: 'running' })
    useOperationsStore.getState().updateOperation(id2, { status: 'done' })
    useOperationsStore.getState().clearCompleted()

    expect(useOperationsStore.getState().operations).toHaveLength(1)
    expect(useOperationsStore.getState().operations[0].status).toBe('running')
  })
})
