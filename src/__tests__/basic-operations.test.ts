/**
 * Basic file-manager operations against a real local filesystem.
 * These are the ops users hit every day — copy, move, delete, rename, mkdir.
 * If a refactor "fixes progress" but breaks these, this file fails first.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs/promises'
import { PluginManager } from '../main/plugins/plugin-manager'
import { LocalFilesystemPlugin } from '../main/plugins/local-filesystem'
import { useOperationsStore } from '../renderer/src/stores/operations-store'
import { executeOperation } from '../renderer/src/services/file-operation-service'
import type { Entry } from '../shared/types/entry'

function makeEntry(
  id: string,
  name: string,
  opts: { isContainer?: boolean; size?: number } = {}
): Entry {
  const isContainer = opts.isContainer ?? false
  return {
    id,
    name,
    isContainer,
    size: opts.size ?? (isContainer ? -1 : 100),
    modifiedAt: Date.now(),
    mimeType: isContainer ? 'inode/directory' : 'text/plain',
    iconHint: isContainer ? 'folder' : 'file',
    meta: {},
    attributes: { readonly: false, hidden: false, symlink: false }
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

describe('basic local filesystem operations', () => {
  let tmp: string
  let src: string
  let dest: string
  let manager: PluginManager
  let local: LocalFilesystemPlugin

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sc-basic-ops-'))
    src = path.join(tmp, 'src')
    dest = path.join(tmp, 'dest')
    await fs.mkdir(src)
    await fs.mkdir(dest)

    manager = new PluginManager()
    local = new LocalFilesystemPlugin()
    await local.initialize()
    manager.register(local)

    useOperationsStore.setState({ operations: [], showDialog: false })
  })

  afterEach(async () => {
    await local.dispose()
    await fs.rm(tmp, { recursive: true, force: true })
  })

  // ── Plugin-level ops (what main executes) ─────────────────────────────────

  it('createDirectory makes a folder', async () => {
    const result = await local.executeOperation({
      op: 'createDirectory',
      parentLocationId: src,
      name: 'new-folder'
    })
    expect(result.success).toBe(true)
    const st = await fs.stat(path.join(src, 'new-folder'))
    expect(st.isDirectory()).toBe(true)
  })

  it('rename renames a file in place', async () => {
    const file = path.join(src, 'old.txt')
    await fs.writeFile(file, 'hello')
    const result = await local.executeOperation({
      op: 'rename',
      entry: makeEntry(file, 'old.txt'),
      newName: 'new.txt'
    })
    expect(result.success).toBe(true)
    expect(await exists(file)).toBe(false)
    expect(await fs.readFile(path.join(src, 'new.txt'), 'utf8')).toBe('hello')
  })

  it('delete removes a file', async () => {
    const file = path.join(src, 'gone.txt')
    await fs.writeFile(file, 'x')
    const result = await local.executeOperation({
      op: 'delete',
      entries: [makeEntry(file, 'gone.txt')]
    })
    expect(result.success).toBe(true)
    expect(await exists(file)).toBe(false)
  })

  it('delete removes a directory tree', async () => {
    const dir = path.join(src, 'tree')
    await fs.mkdir(path.join(dir, 'nested'), { recursive: true })
    await fs.writeFile(path.join(dir, 'nested', 'a.txt'), 'a')
    const result = await local.executeOperation({
      op: 'delete',
      entries: [makeEntry(dir, 'tree', { isContainer: true })]
    })
    expect(result.success).toBe(true)
    expect(await exists(dir)).toBe(false)
  })

  it('copy copies a single file', async () => {
    const file = path.join(src, 'doc.txt')
    await fs.writeFile(file, 'payload')
    const result = await local.executeOperation({
      op: 'copy',
      sourceEntries: [makeEntry(file, 'doc.txt', { size: 7 })],
      destinationLocationId: dest,
      destinationPluginId: 'local-filesystem'
    })
    expect(result.success).toBe(true)
    expect(await fs.readFile(path.join(dest, 'doc.txt'), 'utf8')).toBe('payload')
    // source preserved
    expect(await exists(file)).toBe(true)
  })

  it('copy copies a directory recursively', async () => {
    const dir = path.join(src, 'folder')
    await fs.mkdir(path.join(dir, 'sub'), { recursive: true })
    await fs.writeFile(path.join(dir, 'root.txt'), 'root')
    await fs.writeFile(path.join(dir, 'sub', 'child.txt'), 'child')
    const result = await local.executeOperation({
      op: 'copy',
      sourceEntries: [makeEntry(dir, 'folder', { isContainer: true })],
      destinationLocationId: dest,
      destinationPluginId: 'local-filesystem'
    })
    expect(result.success).toBe(true)
    expect(await fs.readFile(path.join(dest, 'folder', 'root.txt'), 'utf8')).toBe('root')
    expect(await fs.readFile(path.join(dest, 'folder', 'sub', 'child.txt'), 'utf8')).toBe('child')
  })

  it('move renames across folders on the same volume', async () => {
    const file = path.join(src, 'moveme.txt')
    await fs.writeFile(file, 'data')
    const result = await local.executeOperation({
      op: 'move',
      sourceEntries: [makeEntry(file, 'moveme.txt', { size: 4 })],
      destinationLocationId: dest,
      destinationPluginId: 'local-filesystem'
    })
    expect(result.success).toBe(true)
    expect(await exists(file)).toBe(false)
    expect(await fs.readFile(path.join(dest, 'moveme.txt'), 'utf8')).toBe('data')
  })

  it('enumerateFiles walks a directory tree with sizes', async () => {
    const dir = path.join(src, 'walk')
    await fs.mkdir(path.join(dir, 'sub'), { recursive: true })
    await fs.writeFile(path.join(dir, 'a.txt'), 'aaaa')
    await fs.writeFile(path.join(dir, 'sub', 'b.txt'), 'bb')
    const list = await local.enumerateFiles([dir], dest)
    const files = list.filter((f) => !f.isDirectory)
    expect(files).toHaveLength(2)
    const a = files.find((f) => f.relativePath.endsWith('a.txt'))
    const b = files.find((f) => f.relativePath.endsWith('b.txt'))
    expect(a?.size).toBe(4)
    expect(b?.size).toBe(2)
    expect(list.some((f) => f.isDirectory)).toBe(true)
  })

  it('streamCopyFile copies bytes between local paths with progress', async () => {
    const payload = Buffer.alloc(512 * 1024, 0xab)
    const file = path.join(src, 'big.bin')
    await fs.writeFile(file, payload)
    const progress: number[] = []
    const result = await manager.streamCopyFile(
      'local-filesystem',
      file,
      'local-filesystem',
      dest,
      'big.bin',
      (n) => progress.push(n)
    )
    expect(result.success).toBe(true)
    expect(result.bytesWritten).toBe(payload.length)
    const out = await fs.readFile(path.join(dest, 'big.bin'))
    expect(out.equals(payload)).toBe(true)
    expect(progress.length).toBeGreaterThan(0)
    expect(progress[progress.length - 1]).toBe(payload.length)
  })

  it('readDirectory lists created entries', async () => {
    await fs.writeFile(path.join(src, 'listed.txt'), 'x')
    await fs.mkdir(path.join(src, 'subdir'))
    const listing = await local.readDirectory(src)
    const names = listing.entries.map((e) => e.name).sort()
    expect(names).toContain('listed.txt')
    expect(names).toContain('subdir')
  })

  // ── Renderer executeOperation queue (copy / move / delete) ────────────────

  it('executeOperation delete removes selected entries via the op queue', async () => {
    const file = path.join(src, 'queue-del.txt')
    await fs.writeFile(file, 'bye')

    vi.mocked(window.api.plugins.executeOperation).mockImplementation(
      async (_pluginId: string, op: { op: string; entries?: Entry[] }) => {
        if (op.op === 'delete' && op.entries) {
          return local.executeOperation({ op: 'delete', entries: op.entries })
        }
        return { success: true }
      }
    )
    vi.mocked(window.api.util.enumerateFiles).mockResolvedValue([])

    // refresh is called after delete — stub panel store is fine via setup
    const opId = useOperationsStore.getState().enqueue({
      type: 'delete',
      sourceEntries: [makeEntry(file, 'queue-del.txt')],
      sourcePluginId: 'local-filesystem',
      destinationDisplay: '',
      destinationLocationId: '',
      destinationPluginId: 'local-filesystem'
    })

    await executeOperation(opId)

    // op is removed when done
    expect(useOperationsStore.getState().operations.find((o) => o.id === opId)).toBeUndefined()
    expect(await exists(file)).toBe(false)
  })

  it('executeOperation copy local→local writes dest and keeps source', async () => {
    const file = path.join(src, 'queue-copy.txt')
    await fs.writeFile(file, 'copy-me')
    const destFile = path.join(dest, 'queue-copy.txt')

    vi.mocked(window.api.util.enumerateFiles).mockResolvedValue([
      {
        sourcePath: file,
        destPath: destFile,
        size: 7,
        isDirectory: false,
        relativePath: 'queue-copy.txt'
      }
    ])
    vi.mocked(window.api.util.checkExists).mockResolvedValue(false)
    vi.mocked(window.api.util.streamCopyFile).mockImplementation(
      async (_sp, sourceEntryId, _dp, destLocationId, destFileName) => {
        const result = await manager.streamCopyFile(
          'local-filesystem',
          sourceEntryId,
          'local-filesystem',
          destLocationId,
          destFileName
        )
        return result
      }
    )

    const opId = useOperationsStore.getState().enqueue({
      type: 'copy',
      sourceEntries: [makeEntry(file, 'queue-copy.txt', { size: 7 })],
      sourcePluginId: 'local-filesystem',
      destinationDisplay: dest,
      destinationLocationId: dest,
      destinationPluginId: 'local-filesystem'
    })

    await executeOperation(opId)

    expect(await fs.readFile(destFile, 'utf8')).toBe('copy-me')
    expect(await fs.readFile(file, 'utf8')).toBe('copy-me')
  })

  it('executeOperation move local→local uses plugin executeOperation', async () => {
    const file = path.join(src, 'queue-move.txt')
    await fs.writeFile(file, 'moved')
    const destFile = path.join(dest, 'queue-move.txt')

    vi.mocked(window.api.plugins.exists).mockResolvedValue(false)
    vi.mocked(window.api.plugins.executeOperation).mockImplementation(async (pluginId, op) => {
      if (pluginId === 'local-filesystem') {
        return local.executeOperation(op as Parameters<typeof local.executeOperation>[0])
      }
      return { success: true }
    })

    const opId = useOperationsStore.getState().enqueue({
      type: 'move',
      sourceEntries: [makeEntry(file, 'queue-move.txt', { size: 5 })],
      sourcePluginId: 'local-filesystem',
      destinationDisplay: dest,
      destinationLocationId: dest,
      destinationPluginId: 'local-filesystem'
    })

    await executeOperation(opId)

    expect(await exists(file)).toBe(false)
    expect(await fs.readFile(destFile, 'utf8')).toBe('moved')
    expect(window.api.plugins.executeOperation).toHaveBeenCalledWith(
      'local-filesystem',
      expect.objectContaining({ op: 'move' })
    )
  })

  it('delete enqueue with empty destination still runs (confirm dialog path)', async () => {
    // Regression: confirmOperation used to reject delete with "Destination path is empty"
    const file = path.join(src, 'confirm-del.txt')
    await fs.writeFile(file, 'x')

    vi.mocked(window.api.plugins.executeOperation).mockImplementation(async (_id, op) => {
      if (op && typeof op === 'object' && 'op' in op && op.op === 'delete') {
        return local.executeOperation(op as { op: 'delete'; entries: Entry[] })
      }
      return { success: true }
    })

    const opId = useOperationsStore.getState().enqueue({
      type: 'delete',
      sourceEntries: [makeEntry(file, 'confirm-del.txt')],
      sourcePluginId: 'local-filesystem',
      destinationDisplay: '',
      destinationLocationId: '',
      destinationPluginId: 'local-filesystem'
    })
    expect(opId).toBeTruthy()

    await executeOperation(opId)
    expect(await exists(file)).toBe(false)
  })
})
