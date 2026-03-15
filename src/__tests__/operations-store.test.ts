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
    useOperationsStore.setState({ operations: [] })
  })

  it('starts with no operations', () => {
    expect(useOperationsStore.getState().operations).toHaveLength(0)
  })

  it('startOperation adds a running operation', () => {
    const id = useOperationsStore.getState().startOperation({
      type: 'copy',
      sourceEntries: [makeEntry('a.txt'), makeEntry('b.txt')],
      sourcePluginId: 'local-filesystem',
      destinationDisplay: '/dest',
      destinationLocationId: '/dest',
      destinationPluginId: 'local-filesystem'
    })

    const ops = useOperationsStore.getState().operations
    expect(ops).toHaveLength(1)
    expect(ops[0].id).toBe(id)
    expect(ops[0].status).toBe('running')
    expect(ops[0].totalFiles).toBe(2)
    expect(ops[0].processedFiles).toBe(0)
  })

  it('updateOperation updates fields', () => {
    const id = useOperationsStore.getState().startOperation({
      type: 'move',
      sourceEntries: [makeEntry('a.txt')],
      sourcePluginId: 'local-filesystem',
      destinationDisplay: '/dest',
      destinationLocationId: '/dest',
      destinationPluginId: 'local-filesystem'
    })

    useOperationsStore.getState().updateOperation(id, {
      currentFile: 'a.txt',
      processedFiles: 1,
      status: 'done'
    })

    const op = useOperationsStore.getState().operations[0]
    expect(op.currentFile).toBe('a.txt')
    expect(op.processedFiles).toBe(1)
    expect(op.status).toBe('done')
  })

  it('cancelOperation sets status to cancelled', () => {
    const id = useOperationsStore.getState().startOperation({
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

  it('removeOperation removes it', () => {
    const id = useOperationsStore.getState().startOperation({
      type: 'copy',
      sourceEntries: [makeEntry('a.txt')],
      sourcePluginId: 'local-filesystem',
      destinationDisplay: '/dest',
      destinationLocationId: '/dest',
      destinationPluginId: 'local-filesystem'
    })

    useOperationsStore.getState().removeOperation(id)
    expect(useOperationsStore.getState().operations).toHaveLength(0)
  })

  it('clearCompleted removes non-running operations', () => {
    useOperationsStore.getState().startOperation({
      type: 'copy',
      sourceEntries: [makeEntry('a.txt')],
      sourcePluginId: 'local-filesystem',
      destinationDisplay: '/dest',
      destinationLocationId: '/dest',
      destinationPluginId: 'local-filesystem'
    })

    const id2 = useOperationsStore.getState().startOperation({
      type: 'move',
      sourceEntries: [makeEntry('b.txt')],
      sourcePluginId: 'local-filesystem',
      destinationDisplay: '/dest',
      destinationLocationId: '/dest',
      destinationPluginId: 'local-filesystem'
    })

    useOperationsStore.getState().updateOperation(id2, { status: 'done' })
    useOperationsStore.getState().clearCompleted()

    const ops = useOperationsStore.getState().operations
    expect(ops).toHaveLength(1)
    expect(ops[0].status).toBe('running')
  })
})
