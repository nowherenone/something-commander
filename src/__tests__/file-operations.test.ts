import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useOperationsStore } from '../renderer/src/stores/operations-store'
import type { Entry } from '../shared/types/entry'
import type { FileItem } from '../renderer/src/stores/operations-store'

function makeEntry(name: string, overrides: Partial<Entry> = {}): Entry {
  return {
    id: `D:\\test\\${name}`,
    name,
    isContainer: false,
    size: 1000,
    modifiedAt: 1000000,
    mimeType: 'text/plain',
    iconHint: 'file',
    meta: { extension: 'txt' },
    attributes: { readonly: false, hidden: false, symlink: false },
    ...overrides
  }
}

function makeDirEntry(name: string): Entry {
  return makeEntry(name, {
    id: `D:\\test\\${name}`,
    isContainer: true,
    size: -1,
    mimeType: 'inode/directory',
    iconHint: 'folder'
  })
}

// Simulates what executeOperation does step-by-step
// (We test the store state transitions, not the actual IPC calls)
describe('file operations flow', () => {
  beforeEach(() => {
    useOperationsStore.setState({ operations: [], showDialog: false })
  })

  describe('single file copy', () => {
    it('goes through queued -> enumerating -> running -> done', () => {
      const store = useOperationsStore.getState()

      // Step 1: Enqueue
      const opId = store.enqueue({
        type: 'copy',
        sourceEntries: [makeEntry('readme.txt')],
        sourcePluginId: 'local-filesystem',
        destinationDisplay: 'D:\\dest',
        destinationLocationId: 'D:\\dest',
        destinationPluginId: 'local-filesystem'
      })

      let op = useOperationsStore.getState().operations[0]
      expect(op.status).toBe('queued')
      expect(op.showDialog).toBeUndefined() // showDialog is on store, not op
      expect(useOperationsStore.getState().showDialog).toBe(true)

      // Step 2: Start enumeration
      useOperationsStore.getState().updateOperation(opId, { status: 'enumerating', currentFile: 'Scanning files...' })
      op = useOperationsStore.getState().operations[0]
      expect(op.status).toBe('enumerating')
      expect(op.currentFile).toBe('Scanning files...')

      // Step 3: Enumeration complete — single file found
      const fileList: FileItem[] = [
        { sourcePath: 'D:\\test\\readme.txt', destPath: 'D:\\dest\\readme.txt', size: 1000, isDirectory: false, relativePath: 'readme.txt' }
      ]
      useOperationsStore.getState().updateOperation(opId, {
        status: 'running',
        fileList,
        totalFiles: 1,
        totalBytes: 1000,
        processedFiles: 0,
        processedBytes: 0,
        currentFile: 'readme.txt'
      })
      op = useOperationsStore.getState().operations[0]
      expect(op.status).toBe('running')
      expect(op.totalFiles).toBe(1)
      expect(op.totalBytes).toBe(1000)

      // Step 4: File copied
      useOperationsStore.getState().updateOperation(opId, {
        processedFiles: 1,
        processedBytes: 1000
      })
      op = useOperationsStore.getState().operations[0]
      expect(op.processedFiles).toBe(1)
      expect(op.processedBytes).toBe(1000)

      // Step 5: Done
      useOperationsStore.getState().updateOperation(opId, { status: 'done', currentFile: '' })
      op = useOperationsStore.getState().operations[0]
      expect(op.status).toBe('done')
    })
  })

  describe('folder copy with multiple files', () => {
    it('enumerates tree into flat file list', () => {
      const store = useOperationsStore.getState()

      const opId = store.enqueue({
        type: 'copy',
        sourceEntries: [makeDirEntry('project')],
        sourcePluginId: 'local-filesystem',
        destinationDisplay: 'D:\\dest',
        destinationLocationId: 'D:\\dest',
        destinationPluginId: 'local-filesystem'
      })

      // Simulate enumeration result: directory + 3 files
      const fileList: FileItem[] = [
        { sourcePath: 'D:\\test\\project', destPath: 'D:\\dest\\project', size: 0, isDirectory: true, relativePath: 'project' },
        { sourcePath: 'D:\\test\\project\\a.txt', destPath: 'D:\\dest\\project\\a.txt', size: 500, isDirectory: false, relativePath: 'project\\a.txt' },
        { sourcePath: 'D:\\test\\project\\b.txt', destPath: 'D:\\dest\\project\\b.txt', size: 300, isDirectory: false, relativePath: 'project\\b.txt' },
        { sourcePath: 'D:\\test\\project\\sub\\c.txt', destPath: 'D:\\dest\\project\\sub\\c.txt', size: 200, isDirectory: false, relativePath: 'project\\sub\\c.txt' }
      ]

      useOperationsStore.getState().updateOperation(opId, {
        status: 'running',
        fileList,
        totalFiles: 3, // Only count non-directory files
        totalBytes: 1000,
        processedFiles: 0,
        processedBytes: 0
      })

      const op = useOperationsStore.getState().operations[0]
      expect(op.fileList).toHaveLength(4) // 1 dir + 3 files
      expect(op.totalFiles).toBe(3) // only files count
      expect(op.totalBytes).toBe(1000)
    })

    it('tracks per-file progress correctly', () => {
      const opId = useOperationsStore.getState().enqueue({
        type: 'copy',
        sourceEntries: [makeDirEntry('project')],
        sourcePluginId: 'local-filesystem',
        destinationDisplay: 'D:\\dest',
        destinationLocationId: 'D:\\dest',
        destinationPluginId: 'local-filesystem'
      })

      useOperationsStore.getState().updateOperation(opId, {
        status: 'running',
        totalFiles: 3,
        totalBytes: 1000
      })

      // File 1 of 3
      useOperationsStore.getState().updateOperation(opId, {
        currentFile: 'project\\a.txt',
        currentFileIndex: 1,
        currentFileSize: 500,
        processedFiles: 0
      })
      let op = useOperationsStore.getState().operations[0]
      expect(op.currentFile).toBe('project\\a.txt')
      expect(op.currentFileSize).toBe(500)

      // File 1 done
      useOperationsStore.getState().updateOperation(opId, {
        processedFiles: 1,
        processedBytes: 500
      })
      op = useOperationsStore.getState().operations[0]
      expect(op.processedFiles).toBe(1)
      expect(op.processedBytes).toBe(500)

      // File 2 of 3
      useOperationsStore.getState().updateOperation(opId, {
        currentFile: 'project\\b.txt',
        currentFileIndex: 2,
        currentFileSize: 300,
        processedFiles: 1,
        processedBytes: 500
      })

      // File 2 done
      useOperationsStore.getState().updateOperation(opId, {
        processedFiles: 2,
        processedBytes: 800
      })

      // File 3 done
      useOperationsStore.getState().updateOperation(opId, {
        processedFiles: 3,
        processedBytes: 1000,
        status: 'done',
        currentFile: ''
      })

      op = useOperationsStore.getState().operations[0]
      expect(op.processedFiles).toBe(3)
      expect(op.processedBytes).toBe(1000)
      expect(op.status).toBe('done')
    })
  })

  describe('cancel operation', () => {
    it('can be cancelled during enumeration', () => {
      const opId = useOperationsStore.getState().enqueue({
        type: 'copy',
        sourceEntries: [makeDirEntry('big-folder')],
        sourcePluginId: 'local-filesystem',
        destinationDisplay: 'D:\\dest',
        destinationLocationId: 'D:\\dest',
        destinationPluginId: 'local-filesystem'
      })

      useOperationsStore.getState().updateOperation(opId, { status: 'enumerating' })
      useOperationsStore.getState().cancelOperation(opId)

      expect(useOperationsStore.getState().operations[0].status).toBe('cancelled')
    })

    it('can be cancelled during running', () => {
      const opId = useOperationsStore.getState().enqueue({
        type: 'copy',
        sourceEntries: [makeDirEntry('folder')],
        sourcePluginId: 'local-filesystem',
        destinationDisplay: 'D:\\dest',
        destinationLocationId: 'D:\\dest',
        destinationPluginId: 'local-filesystem'
      })

      useOperationsStore.getState().updateOperation(opId, {
        status: 'running',
        totalFiles: 10,
        processedFiles: 3
      })

      useOperationsStore.getState().cancelOperation(opId)
      const op = useOperationsStore.getState().operations[0]
      expect(op.status).toBe('cancelled')
      expect(op.processedFiles).toBe(3) // Already copied files stay
    })

    it('cannot cancel done/error operations', () => {
      const opId = useOperationsStore.getState().enqueue({
        type: 'copy',
        sourceEntries: [makeEntry('a.txt')],
        sourcePluginId: 'local-filesystem',
        destinationDisplay: 'D:\\dest',
        destinationLocationId: 'D:\\dest',
        destinationPluginId: 'local-filesystem'
      })

      useOperationsStore.getState().updateOperation(opId, { status: 'done' })
      useOperationsStore.getState().cancelOperation(opId)
      // Should remain 'done', not change to 'cancelled'
      expect(useOperationsStore.getState().operations[0].status).toBe('done')
    })
  })

  describe('delete operation', () => {
    it('tracks delete progress correctly', () => {
      const opId = useOperationsStore.getState().enqueue({
        type: 'delete',
        sourceEntries: [makeEntry('a.txt'), makeEntry('b.txt')],
        sourcePluginId: 'local-filesystem',
        destinationDisplay: 'Trash',
        destinationLocationId: '',
        destinationPluginId: 'local-filesystem'
      })

      useOperationsStore.getState().updateOperation(opId, {
        status: 'running',
        totalFiles: 2,
        totalBytes: 2000
      })

      // Delete file 1
      useOperationsStore.getState().updateOperation(opId, {
        currentFile: 'a.txt',
        processedFiles: 0
      })

      useOperationsStore.getState().updateOperation(opId, {
        processedFiles: 1,
        processedBytes: 1000
      })

      // Delete file 2
      useOperationsStore.getState().updateOperation(opId, {
        processedFiles: 2,
        processedBytes: 2000,
        status: 'done',
        currentFile: ''
      })

      const op = useOperationsStore.getState().operations[0]
      expect(op.status).toBe('done')
      expect(op.processedFiles).toBe(2)
    })
  })

  describe('error handling', () => {
    it('sets error status with file info', () => {
      const opId = useOperationsStore.getState().enqueue({
        type: 'copy',
        sourceEntries: [makeEntry('locked.txt')],
        sourcePluginId: 'local-filesystem',
        destinationDisplay: 'D:\\dest',
        destinationLocationId: 'D:\\dest',
        destinationPluginId: 'local-filesystem'
      })

      useOperationsStore.getState().updateOperation(opId, {
        status: 'error',
        error: 'locked.txt: Permission denied',
        processedFiles: 0
      })

      const op = useOperationsStore.getState().operations[0]
      expect(op.status).toBe('error')
      expect(op.error).toContain('locked.txt')
      expect(op.error).toContain('Permission denied')
    })
  })

  describe('overwrite handling', () => {
    it('stores overwrite prompt with file details', () => {
      const opId = useOperationsStore.getState().enqueue({
        type: 'copy',
        sourceEntries: [makeEntry('exists.txt')],
        sourcePluginId: 'local-filesystem',
        destinationDisplay: 'D:\\dest',
        destinationLocationId: 'D:\\dest',
        destinationPluginId: 'local-filesystem'
      })

      useOperationsStore.getState().updateOperation(opId, {
        status: 'running',
        overwritePrompt: {
          sourcePath: 'D:\\test\\exists.txt',
          sourceName: 'exists.txt',
          sourceSize: 1000,
          sourceDate: 2000000,
          destPath: 'D:\\dest\\exists.txt',
          destSize: 800,
          destDate: 1500000
        }
      })

      const op = useOperationsStore.getState().operations[0]
      expect(op.overwritePrompt).not.toBeNull()
      expect(op.overwritePrompt!.sourceSize).toBe(1000)
      expect(op.overwritePrompt!.destSize).toBe(800)
    })

    it('overwrite-all policy is stored on operation', () => {
      const opId = useOperationsStore.getState().enqueue({
        type: 'copy',
        sourceEntries: [makeEntry('a.txt')],
        sourcePluginId: 'local-filesystem',
        destinationDisplay: 'D:\\dest',
        destinationLocationId: 'D:\\dest',
        destinationPluginId: 'local-filesystem'
      })

      expect(useOperationsStore.getState().operations[0].overwritePolicy).toBe('ask')

      useOperationsStore.getState().updateOperation(opId, { overwritePolicy: 'overwrite-all' })
      expect(useOperationsStore.getState().operations[0].overwritePolicy).toBe('overwrite-all')
    })

    it('skip-all policy is stored on operation', () => {
      const opId = useOperationsStore.getState().enqueue({
        type: 'copy',
        sourceEntries: [makeEntry('a.txt')],
        sourcePluginId: 'local-filesystem',
        destinationDisplay: 'D:\\dest',
        destinationLocationId: 'D:\\dest',
        destinationPluginId: 'local-filesystem'
      })

      useOperationsStore.getState().updateOperation(opId, { overwritePolicy: 'skip-all' })
      expect(useOperationsStore.getState().operations[0].overwritePolicy).toBe('skip-all')
    })
  })

  describe('queue behavior', () => {
    it('multiple enqueued ops are all queued', () => {
      useOperationsStore.getState().enqueue({
        type: 'copy',
        sourceEntries: [makeEntry('a.txt')],
        sourcePluginId: 'local-filesystem',
        destinationDisplay: 'D:\\dest1',
        destinationLocationId: 'D:\\dest1',
        destinationPluginId: 'local-filesystem'
      })

      useOperationsStore.getState().enqueue({
        type: 'move',
        sourceEntries: [makeEntry('b.txt')],
        sourcePluginId: 'local-filesystem',
        destinationDisplay: 'D:\\dest2',
        destinationLocationId: 'D:\\dest2',
        destinationPluginId: 'local-filesystem'
      })

      const ops = useOperationsStore.getState().operations
      expect(ops).toHaveLength(2)
      expect(ops[0].status).toBe('queued')
      expect(ops[1].status).toBe('queued')
    })

    it('getCurrentOperation returns the first queued when none running', () => {
      useOperationsStore.getState().enqueue({
        type: 'copy',
        sourceEntries: [makeEntry('a.txt')],
        sourcePluginId: 'local-filesystem',
        destinationDisplay: 'D:\\dest',
        destinationLocationId: 'D:\\dest',
        destinationPluginId: 'local-filesystem'
      })

      const current = useOperationsStore.getState().getCurrentOperation()
      expect(current?.type).toBe('copy')
      expect(current?.status).toBe('queued')
    })

    it('getCurrentOperation returns running op over queued', () => {
      const id1 = useOperationsStore.getState().enqueue({
        type: 'copy',
        sourceEntries: [makeEntry('a.txt')],
        sourcePluginId: 'local-filesystem',
        destinationDisplay: 'D:\\dest',
        destinationLocationId: 'D:\\dest',
        destinationPluginId: 'local-filesystem'
      })

      useOperationsStore.getState().enqueue({
        type: 'move',
        sourceEntries: [makeEntry('b.txt')],
        sourcePluginId: 'local-filesystem',
        destinationDisplay: 'D:\\dest',
        destinationLocationId: 'D:\\dest',
        destinationPluginId: 'local-filesystem'
      })

      useOperationsStore.getState().updateOperation(id1, { status: 'running' })

      const current = useOperationsStore.getState().getCurrentOperation()
      expect(current?.type).toBe('copy')
      expect(current?.status).toBe('running')
    })
  })

  describe('dialog visibility', () => {
    it('enqueue shows dialog', () => {
      useOperationsStore.getState().enqueue({
        type: 'copy',
        sourceEntries: [makeEntry('a.txt')],
        sourcePluginId: 'local-filesystem',
        destinationDisplay: 'D:\\dest',
        destinationLocationId: 'D:\\dest',
        destinationPluginId: 'local-filesystem'
      })

      expect(useOperationsStore.getState().showDialog).toBe(true)
    })

    it('removing last op hides dialog', () => {
      const id = useOperationsStore.getState().enqueue({
        type: 'copy',
        sourceEntries: [makeEntry('a.txt')],
        sourcePluginId: 'local-filesystem',
        destinationDisplay: 'D:\\dest',
        destinationLocationId: 'D:\\dest',
        destinationPluginId: 'local-filesystem'
      })

      useOperationsStore.getState().removeOperation(id)
      expect(useOperationsStore.getState().showDialog).toBe(false)
    })

    it('minimize/maximize dialog', () => {
      useOperationsStore.getState().enqueue({
        type: 'copy',
        sourceEntries: [makeEntry('a.txt')],
        sourcePluginId: 'local-filesystem',
        destinationDisplay: 'D:\\dest',
        destinationLocationId: 'D:\\dest',
        destinationPluginId: 'local-filesystem'
      })

      expect(useOperationsStore.getState().showDialog).toBe(true)

      useOperationsStore.getState().setShowDialog(false)
      expect(useOperationsStore.getState().showDialog).toBe(false)

      useOperationsStore.getState().setShowDialog(true)
      expect(useOperationsStore.getState().showDialog).toBe(true)
    })
  })
})
