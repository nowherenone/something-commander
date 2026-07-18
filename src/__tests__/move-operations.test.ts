/**
 * Move operation matrix — routing (executeOperation) + real archive/local I/O.
 *
 * Paths that must work:
 *  1. local → local (same volume)  → moveSingleFile / rename, no stream
 *  2. local → archive              → stream + delete source
 *  3. archive → local              → stream + delete source
 *  4. archive → archive            → stream + delete source
 *  5. copy never uses moveSingleFile
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import { useOperationsStore } from '../renderer/src/stores/operations-store'
import { executeOperation } from '../renderer/src/services/file-operation-service'
import { PluginManager } from '../main/plugins/plugin-manager'
import { ArchivePlugin } from '../main/plugins/archive'
import { LocalFilesystemPlugin } from '../main/plugins/local-filesystem'
import type { Entry } from '../shared/types/entry'

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeEntry(id: string, name: string, isContainer = false, size = 1000): Entry {
  return {
    id,
    name,
    isContainer,
    size: isContainer ? -1 : size,
    modifiedAt: 1000,
    mimeType: isContainer ? 'inode/directory' : 'text/plain',
    iconHint: isContainer ? 'folder' : 'file',
    meta: {},
    attributes: { readonly: false, hidden: false, symlink: false }
  }
}

async function createTestZip(
  tmpDir: string,
  fileName: string,
  entries: Record<string, string>
): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const yazl = require('yazl') as typeof import('yazl')
  const zipPath = path.join(tmpDir, fileName)
  const zip = new yazl.ZipFile()
  for (const [name, content] of Object.entries(entries)) {
    if (name.endsWith('/')) zip.addEmptyDirectory(name.replace(/\/$/, ''))
    else zip.addBuffer(Buffer.from(content), name)
  }
  zip.end()
  await new Promise<void>((resolve, reject) => {
    zip.outputStream.pipe(fsSync.createWriteStream(zipPath)).on('finish', resolve).on('error', reject)
  })
  return zipPath
}

async function listZipEntries(zipPath: string): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const yauzl = require('yauzl') as typeof import('yauzl')
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) return reject(err)
      const names: string[] = []
      zipfile.readEntry()
      zipfile.on('entry', (e: { fileName: string }) => {
        names.push(e.fileName)
        zipfile.readEntry()
      })
      zipfile.on('end', () => resolve(names.sort()))
      zipfile.on('error', reject)
    })
  })
}

async function readZipEntry(zipPath: string, internalPath: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const yauzl = require('yauzl') as typeof import('yauzl')
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) return reject(err)
      zipfile.readEntry()
      zipfile.on('entry', (entry: { fileName: string }) => {
        if (entry.fileName === internalPath) {
          zipfile.openReadStream(entry as never, (streamErr: Error | null, readStream) => {
            if (streamErr || !readStream) return reject(streamErr)
            const chunks: Buffer[] = []
            readStream.on('data', (c: Buffer) => chunks.push(c))
            readStream.on('end', () => resolve(Buffer.concat(chunks).toString()))
            readStream.on('error', reject)
          })
        } else {
          zipfile.readEntry()
        }
      })
      zipfile.on('end', () => reject(new Error(`entry not found: ${internalPath}`)))
      zipfile.on('error', reject)
    })
  })
}

// ─── routing matrix (mocked window.api) ───────────────────────────────────────

describe('move routing (executeOperation)', () => {
  beforeEach(() => {
    useOperationsStore.setState({ operations: [], showDialog: false })
    vi.clearAllMocks()
    vi.mocked(window.api.util.checkExists).mockResolvedValue(false)
    vi.mocked(window.api.util.moveSingleFile).mockResolvedValue({ success: true })
    vi.mocked(window.api.util.streamCopyFile).mockResolvedValue({ success: true, bytesWritten: 100 })
    vi.mocked(window.api.plugins.executeOperation).mockResolvedValue({ success: true })
  })

  it('local → local: rename via moveSingleFile, no stream, no enumerate', async () => {
    const opId = useOperationsStore.getState().enqueue({
      type: 'move',
      sourceEntries: [makeEntry('/home/u/a.txt', 'a.txt', false, 50)],
      sourcePluginId: 'local-filesystem',
      destinationDisplay: '/home/u/dest',
      destinationLocationId: '/home/u/dest',
      destinationPluginId: 'local-filesystem'
    })
    await executeOperation(opId)

    expect(window.api.util.moveSingleFile).toHaveBeenCalledWith(
      '/home/u/a.txt',
      '/home/u/dest/a.txt',
      false
    )
    expect(window.api.util.streamCopyFile).not.toHaveBeenCalled()
    expect(window.api.util.enumerateFiles).not.toHaveBeenCalled()
    expect(window.api.plugins.executeOperation).not.toHaveBeenCalledWith(
      'local-filesystem',
      expect.objectContaining({ op: 'delete' })
    )
  })

  it('local → local Windows paths: joins with backslash', async () => {
    const opId = useOperationsStore.getState().enqueue({
      type: 'move',
      sourceEntries: [makeEntry('D:\\data\\f.txt', 'f.txt')],
      sourcePluginId: 'local-filesystem',
      destinationDisplay: 'D:\\other',
      destinationLocationId: 'D:\\other',
      destinationPluginId: 'local-filesystem'
    })
    await executeOperation(opId)
    expect(window.api.util.moveSingleFile).toHaveBeenCalledWith(
      'D:\\data\\f.txt',
      'D:\\other\\f.txt',
      false
    )
  })

  it('local → local multi-select: one rename per top-level item', async () => {
    const opId = useOperationsStore.getState().enqueue({
      type: 'move',
      sourceEntries: [
        makeEntry('/tmp/a.txt', 'a.txt'),
        makeEntry('/tmp/b.txt', 'b.txt'),
        makeEntry('/tmp/folder', 'folder', true)
      ],
      sourcePluginId: 'local-filesystem',
      destinationDisplay: '/tmp/out',
      destinationLocationId: '/tmp/out',
      destinationPluginId: 'local-filesystem'
    })
    await executeOperation(opId)
    expect(window.api.util.moveSingleFile).toHaveBeenCalledTimes(3)
    expect(window.api.util.streamCopyFile).not.toHaveBeenCalled()
  })

  it('local → archive: stream copy then delete source (no moveSingleFile)', async () => {
    vi.mocked(window.api.util.enumerateFiles).mockResolvedValue([
      {
        sourcePath: '/tmp/a.txt',
        destPath: '/tmp/pack.zip::a.txt',
        size: 100,
        isDirectory: false,
        relativePath: 'a.txt'
      }
    ])

    const opId = useOperationsStore.getState().enqueue({
      type: 'move',
      sourceEntries: [makeEntry('/tmp/a.txt', 'a.txt')],
      sourcePluginId: 'local-filesystem',
      destinationDisplay: 'pack.zip',
      destinationLocationId: '/tmp/pack.zip::',
      destinationPluginId: 'archive'
    })
    await executeOperation(opId)

    expect(window.api.util.moveSingleFile).not.toHaveBeenCalled()
    expect(window.api.util.streamCopyFile).toHaveBeenCalledWith(
      'local-filesystem',
      '/tmp/a.txt',
      'archive',
      expect.anything(),
      'a.txt',
      expect.any(String)
    )
    expect(window.api.plugins.executeOperation).toHaveBeenCalledWith(
      'local-filesystem',
      expect.objectContaining({
        op: 'delete',
        entries: [expect.objectContaining({ id: '/tmp/a.txt' })]
      })
    )
  })

  it('archive → local: stream copy then delete archive entry', async () => {
    vi.mocked(window.api.util.enumerateFiles).mockResolvedValue([
      {
        sourcePath: '/tmp/in.zip::docs/note.txt',
        destPath: '/tmp/out/note.txt',
        size: 42,
        isDirectory: false,
        relativePath: 'note.txt'
      }
    ])

    const opId = useOperationsStore.getState().enqueue({
      type: 'move',
      sourceEntries: [makeEntry('/tmp/in.zip::docs/note.txt', 'note.txt')],
      sourcePluginId: 'archive',
      destinationDisplay: '/tmp/out',
      destinationLocationId: '/tmp/out',
      destinationPluginId: 'local-filesystem'
    })
    await executeOperation(opId)

    expect(window.api.util.moveSingleFile).not.toHaveBeenCalled()
    expect(window.api.util.streamCopyFile).toHaveBeenCalledWith(
      'archive',
      '/tmp/in.zip::docs/note.txt',
      'local-filesystem',
      expect.anything(),
      'note.txt',
      expect.any(String)
    )
    expect(window.api.plugins.executeOperation).toHaveBeenCalledWith(
      'archive',
      expect.objectContaining({
        op: 'delete',
        entries: [expect.objectContaining({ id: '/tmp/in.zip::docs/note.txt' })]
      })
    )
  })

  it('archive → archive: stream copy then delete source entry', async () => {
    vi.mocked(window.api.util.enumerateFiles).mockResolvedValue([
      {
        sourcePath: '/tmp/a.zip::x.txt',
        destPath: '/tmp/b.zip::x.txt',
        size: 10,
        isDirectory: false,
        relativePath: 'x.txt'
      }
    ])

    const opId = useOperationsStore.getState().enqueue({
      type: 'move',
      sourceEntries: [makeEntry('/tmp/a.zip::x.txt', 'x.txt')],
      sourcePluginId: 'archive',
      destinationDisplay: 'b.zip',
      destinationLocationId: '/tmp/b.zip::',
      destinationPluginId: 'archive'
    })
    await executeOperation(opId)

    expect(window.api.util.moveSingleFile).not.toHaveBeenCalled()
    expect(window.api.util.streamCopyFile).toHaveBeenCalledWith(
      'archive',
      '/tmp/a.zip::x.txt',
      'archive',
      expect.anything(),
      'x.txt',
      expect.any(String)
    )
    expect(window.api.plugins.executeOperation).toHaveBeenCalledWith(
      'archive',
      expect.objectContaining({
        op: 'delete',
        entries: [expect.objectContaining({ id: '/tmp/a.zip::x.txt' })]
      })
    )
  })

  it('move folder out of archive: stream files then delete files and dirs', async () => {
    vi.mocked(window.api.util.enumerateFiles).mockResolvedValue([
      {
        sourcePath: '/tmp/a.zip::lib',
        destPath: '/tmp/out/lib',
        size: 0,
        isDirectory: true,
        relativePath: 'lib'
      },
      {
        sourcePath: '/tmp/a.zip::lib/a.ts',
        destPath: '/tmp/out/lib/a.ts',
        size: 3,
        isDirectory: false,
        relativePath: 'lib/a.ts'
      },
      {
        sourcePath: '/tmp/a.zip::lib/b.ts',
        destPath: '/tmp/out/lib/b.ts',
        size: 3,
        isDirectory: false,
        relativePath: 'lib/b.ts'
      }
    ])

    const opId = useOperationsStore.getState().enqueue({
      type: 'move',
      sourceEntries: [makeEntry('/tmp/a.zip::lib/', 'lib', true)],
      sourcePluginId: 'archive',
      destinationDisplay: '/tmp/out',
      destinationLocationId: '/tmp/out',
      destinationPluginId: 'local-filesystem'
    })
    await executeOperation(opId)

    expect(window.api.util.streamCopyFile).toHaveBeenCalledTimes(2)
    // per-file deletes
    expect(window.api.plugins.executeOperation).toHaveBeenCalledWith(
      'archive',
      expect.objectContaining({
        op: 'delete',
        entries: [expect.objectContaining({ id: '/tmp/a.zip::lib/a.ts' })]
      })
    )
    expect(window.api.plugins.executeOperation).toHaveBeenCalledWith(
      'archive',
      expect.objectContaining({
        op: 'delete',
        entries: [expect.objectContaining({ id: '/tmp/a.zip::lib/b.ts' })]
      })
    )
    // source directory cleanup after files
    expect(window.api.plugins.executeOperation).toHaveBeenCalledWith(
      'archive',
      expect.objectContaining({
        op: 'delete',
        entries: [expect.objectContaining({ id: '/tmp/a.zip::lib', isContainer: true })]
      })
    )
  })

  it('copy local → local still streams (never rename)', async () => {
    vi.mocked(window.api.util.enumerateFiles).mockResolvedValue([
      {
        sourcePath: '/tmp/a.txt',
        destPath: '/tmp/dest/a.txt',
        size: 100,
        isDirectory: false,
        relativePath: 'a.txt'
      }
    ])
    const opId = useOperationsStore.getState().enqueue({
      type: 'copy',
      sourceEntries: [makeEntry('/tmp/a.txt', 'a.txt')],
      sourcePluginId: 'local-filesystem',
      destinationDisplay: '/tmp/dest',
      destinationLocationId: '/tmp/dest',
      destinationPluginId: 'local-filesystem'
    })
    await executeOperation(opId)
    expect(window.api.util.streamCopyFile).toHaveBeenCalled()
    expect(window.api.util.moveSingleFile).not.toHaveBeenCalled()
  })

  it('failed stream on move does not delete source', async () => {
    vi.mocked(window.api.util.enumerateFiles).mockResolvedValue([
      {
        sourcePath: '/tmp/in.zip::x.txt',
        destPath: '/tmp/out/x.txt',
        size: 10,
        isDirectory: false,
        relativePath: 'x.txt'
      }
    ])
    vi.mocked(window.api.util.streamCopyFile).mockResolvedValue({
      success: false,
      bytesWritten: 0,
      error: 'disk full'
    })

    const opId = useOperationsStore.getState().enqueue({
      type: 'move',
      sourceEntries: [makeEntry('/tmp/in.zip::x.txt', 'x.txt')],
      sourcePluginId: 'archive',
      destinationDisplay: '/tmp/out',
      destinationLocationId: '/tmp/out',
      destinationPluginId: 'local-filesystem'
    })
    await executeOperation(opId)

    expect(window.api.plugins.executeOperation).not.toHaveBeenCalledWith(
      'archive',
      expect.objectContaining({ op: 'delete' })
    )
  })
})

// ─── real I/O integration ─────────────────────────────────────────────────────

describe('move real I/O (archive ↔ local)', () => {
  let tmpDir: string
  let manager: PluginManager
  let archive: ArchivePlugin
  let local: LocalFilesystemPlugin

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sc-move-'))
    manager = new PluginManager()
    local = new LocalFilesystemPlugin()
    archive = new ArchivePlugin({
      readAt: async (pluginId, entryId, offset, length) => {
        const p = manager.get(pluginId)
        if (!p?.readAt) throw new Error('no readAt')
        return p.readAt(entryId, offset, length)
      },
      getSize: async (pluginId, entryId) => {
        const p = manager.get(pluginId)
        if (!p?.getSize) throw new Error('no getSize')
        return p.getSize(entryId)
      },
      get: (pluginId) => manager.get(pluginId)
    })
    await local.initialize()
    await archive.initialize()
    manager.register(local)
    manager.register(archive)
  })

  afterEach(async () => {
    await archive.dispose()
    await local.dispose()
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('local → local rename is atomic (file gone from src, present at dest)', async () => {
    const src = path.join(tmpDir, 'src.txt')
    const destDir = path.join(tmpDir, 'dest')
    await fs.writeFile(src, 'hello-rename')
    await fs.mkdir(destDir)

    const result = await local.executeOperation({
      op: 'move',
      sourceEntries: [makeEntry(src, 'src.txt')],
      destinationLocationId: destDir
    })
    expect(result.success).toBe(true)
    await expect(fs.access(src)).rejects.toThrow()
    expect(await fs.readFile(path.join(destDir, 'src.txt'), 'utf8')).toBe('hello-rename')
  })

  it('local → local renames a directory tree in one shot', async () => {
    const srcDir = path.join(tmpDir, 'project')
    const destParent = path.join(tmpDir, 'archive-dir')
    await fs.mkdir(path.join(srcDir, 'sub'), { recursive: true })
    await fs.writeFile(path.join(srcDir, 'sub', 'a.txt'), 'nested')
    await fs.mkdir(destParent)

    const result = await local.executeOperation({
      op: 'move',
      sourceEntries: [makeEntry(srcDir, 'project', true)],
      destinationLocationId: destParent
    })
    expect(result.success).toBe(true)
    await expect(fs.access(srcDir)).rejects.toThrow()
    expect(await fs.readFile(path.join(destParent, 'project', 'sub', 'a.txt'), 'utf8')).toBe('nested')
  })

  it('archive → local move: file extracted and removed from zip', async () => {
    const zipPath = await createTestZip(tmpDir, 'in.zip', {
      'docs/note.txt': 'from-zip',
      'stay.txt': 'remain'
    })
    const outDir = path.join(tmpDir, 'out')
    await fs.mkdir(outDir)

    const copy = await manager.streamCopyFile(
      'archive',
      `${zipPath}::docs/note.txt`,
      'local-filesystem',
      outDir,
      'note.txt'
    )
    expect(copy.success).toBe(true)
    expect(await fs.readFile(path.join(outDir, 'note.txt'), 'utf8')).toBe('from-zip')

    const del = await archive.executeOperation({
      op: 'delete',
      entries: [makeEntry(`${zipPath}::docs/note.txt`, 'note.txt')]
    })
    expect(del.success).toBe(true)

    const names = await listZipEntries(zipPath)
    expect(names).not.toContain('docs/note.txt')
    expect(names).toContain('stay.txt')
  })

  it('local → archive move: file packed and removed from disk', async () => {
    const localFile = path.join(tmpDir, 'pack-me.txt')
    await fs.writeFile(localFile, 'into-zip')
    const zipPath = await createTestZip(tmpDir, 'dest.zip', { 'existing.txt': 'x' })

    const copy = await manager.streamCopyFile(
      'local-filesystem',
      localFile,
      'archive',
      `${zipPath}::`,
      'pack-me.txt'
    )
    expect(copy.success).toBe(true)
    expect(await readZipEntry(zipPath, 'pack-me.txt')).toBe('into-zip')

    const del = await local.executeOperation({
      op: 'delete',
      entries: [makeEntry(localFile, 'pack-me.txt')]
    })
    expect(del.success).toBe(true)
    await expect(fs.access(localFile)).rejects.toThrow()

    const names = await listZipEntries(zipPath)
    expect(names).toContain('pack-me.txt')
    expect(names).toContain('existing.txt')
  })

  it('archive → archive move: file appears in dest and leaves source', async () => {
    const srcZip = await createTestZip(tmpDir, 'src.zip', {
      'move-me.txt': 'payload',
      'keep.txt': 'keep'
    })
    const destZip = await createTestZip(tmpDir, 'dst.zip', { 'other.txt': 'o' })

    const copy = await manager.streamCopyFile(
      'archive',
      `${srcZip}::move-me.txt`,
      'archive',
      `${destZip}::`,
      'move-me.txt'
    )
    expect(copy.success).toBe(true)

    const del = await archive.executeOperation({
      op: 'delete',
      entries: [makeEntry(`${srcZip}::move-me.txt`, 'move-me.txt')]
    })
    expect(del.success).toBe(true)

    expect(await listZipEntries(srcZip)).not.toContain('move-me.txt')
    expect(await listZipEntries(srcZip)).toContain('keep.txt')
    expect(await listZipEntries(destZip)).toContain('move-me.txt')
    expect(await readZipEntry(destZip, 'move-me.txt')).toBe('payload')
  })

  it('archive → local move of folder contents (enumerate + stream + delete)', async () => {
    const zipPath = await createTestZip(tmpDir, 'lib.zip', {
      'lib/a.ts': 'aaa',
      'lib/b.ts': 'bbb',
      'root.txt': 'root'
    })
    const outDir = path.join(tmpDir, 'extracted')
    await fs.mkdir(outDir)

    const fileList = await archive.enumerateFiles([`${zipPath}::lib/`], outDir)
    const files = fileList.filter((f) => !f.isDirectory)
    expect(files.length).toBe(2)

    for (const item of files) {
      const { parent, name } = (() => {
        const idx = Math.max(item.destPath.lastIndexOf('/'), item.destPath.lastIndexOf('\\'))
        return { parent: item.destPath.slice(0, idx), name: item.destPath.slice(idx + 1) }
      })()
      await fs.mkdir(parent, { recursive: true })
      const r = await manager.streamCopyFile(
        'archive',
        item.sourcePath,
        'local-filesystem',
        parent,
        name
      )
      expect(r.success).toBe(true)
      await archive.executeOperation({
        op: 'delete',
        entries: [makeEntry(item.sourcePath, name)]
      })
    }

    expect(await fs.readFile(path.join(outDir, 'lib', 'a.ts'), 'utf8')).toBe('aaa')
    expect(await fs.readFile(path.join(outDir, 'lib', 'b.ts'), 'utf8')).toBe('bbb')
    const remaining = await listZipEntries(zipPath)
    expect(remaining).not.toContain('lib/a.ts')
    expect(remaining).not.toContain('lib/b.ts')
    expect(remaining).toContain('root.txt')
  })
})
