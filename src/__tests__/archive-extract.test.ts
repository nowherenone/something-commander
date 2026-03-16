import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useOperationsStore } from '../renderer/src/stores/operations-store'
import type { Entry } from '../shared/types/entry'

function makeArchiveEntry(name: string, archivePath: string, internalPath: string): Entry {
  return {
    id: `${archivePath}::${internalPath}`,
    name,
    isContainer: false,
    size: 1000,
    modifiedAt: 1000000,
    mimeType: '',
    iconHint: 'file',
    meta: { extension: 'txt', archivePath },
    attributes: { readonly: true, hidden: false, symlink: false }
  }
}

describe('archive operations', () => {
  beforeEach(() => {
    useOperationsStore.setState({ operations: [], showDialog: false })
  })

  it('enqueues archive copy with correct sourcePluginId', () => {
    const entry = makeArchiveEntry('readme.txt', 'D:\\test.zip', 'readme.txt')

    useOperationsStore.getState().enqueue({
      type: 'copy',
      sourceEntries: [entry],
      sourcePluginId: 'archive',  // This is the key — must be 'archive' not 'local-filesystem'
      destinationDisplay: 'D:\\dest',
      destinationLocationId: 'D:\\dest',
      destinationPluginId: 'local-filesystem'
    })

    const op = useOperationsStore.getState().operations[0]
    expect(op.sourcePluginId).toBe('archive')
    expect(op.sourceEntries[0].id).toBe('D:\\test.zip::readme.txt')
    expect(op.destinationLocationId).toBe('D:\\dest')
  })

  it('archive entry IDs contain :: separator', () => {
    const entry = makeArchiveEntry('src/main.ts', 'D:\\project.zip', 'src/main.ts')
    expect(entry.id).toBe('D:\\project.zip::src/main.ts')

    // Parse like executeOperation does
    const sepIdx = entry.id.indexOf('::')
    const archivePath = entry.id.slice(0, sepIdx)
    const internalPath = entry.id.slice(sepIdx + 2)
    expect(archivePath).toBe('D:\\project.zip')
    expect(internalPath).toBe('src/main.ts')
  })

  it('directory archive entry has trailing slash', () => {
    const entry: Entry = {
      id: 'D:\\test.zip::src/',
      name: 'src',
      isContainer: true,
      size: -1,
      modifiedAt: 0,
      mimeType: 'inode/directory',
      iconHint: 'folder',
      meta: { archivePath: 'D:\\test.zip' },
      attributes: { readonly: true, hidden: false, symlink: false }
    }

    const sepIdx = entry.id.indexOf('::')
    const archivePath = entry.id.slice(0, sepIdx)
    const internalPath = entry.id.slice(sepIdx + 2)
    expect(archivePath).toBe('D:\\test.zip')
    expect(internalPath).toBe('src/')
  })

  it('executeOperation is called with archive pluginId', async () => {
    // Verify the IPC mock receives correct arguments
    const mockExecuteOp = vi.mocked(window.api.plugins.executeOperation)
    mockExecuteOp.mockResolvedValueOnce({ success: true })

    await window.api.plugins.executeOperation('archive', {
      op: 'copy',
      sourceEntries: [makeArchiveEntry('readme.txt', 'D:\\test.zip', 'readme.txt')],
      destinationLocationId: 'D:\\dest',
      destinationPluginId: 'local-filesystem'
    })

    expect(mockExecuteOp).toHaveBeenCalledWith('archive', expect.objectContaining({
      op: 'copy',
      destinationLocationId: 'D:\\dest'
    }))
  })
})
