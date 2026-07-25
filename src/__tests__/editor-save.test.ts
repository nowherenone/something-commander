/**
 * Editor save works for every plugin that implements writeFromStream.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import { parseEditorPath, resolveEditorSaveTarget } from '../renderer/src/utils/editor-path'
import { splitEntryParentAndName } from '../shared/entry-write-path'
import { PluginManager } from '../main/plugins/plugin-manager'
import { LocalFilesystemPlugin } from '../main/plugins/local-filesystem'
import { ArchivePlugin } from '../main/plugins/archive'

describe('parseEditorPath / resolveEditorSaveTarget', () => {
  it('parses pluginId|entryId from openEditorWindow', () => {
    const p = parseEditorPath('local-filesystem|/home/u/notes.txt')
    expect(p.pluginId).toBe('local-filesystem')
    expect(p.entryId).toBe('/home/u/notes.txt')
  })

  it('resolves local, sftp, archive, s3, smb targets without rejecting them', () => {
    const cases = [
      'local-filesystem|/tmp/a.txt',
      'sftp|user@host:22::/home/u/a.txt',
      'archive|/tmp/x.zip::src/main.ts',
      's3|s3-bucket::folder/file.txt',
      'smb|user@host/share/dir/file.txt'
    ]
    for (const c of cases) {
      const r = resolveEditorSaveTarget(c)
      expect('error' in r, c).toBe(false)
      if (!('error' in r)) {
        expect(r.pluginId).toBeTruthy()
        expect(r.entryId).toBeTruthy()
      }
    }
  })

  it('rejects empty / directory-looking paths', () => {
    expect('error' in resolveEditorSaveTarget('local-filesystem|/tmp/dir/')).toBe(true)
    expect('error' in resolveEditorSaveTarget('local-filesystem|')).toBe(true)
  })
})

describe('splitEntryParentAndName', () => {
  it('splits local paths', () => {
    expect(splitEntryParentAndName('/home/u/a.txt')).toEqual({
      destLocationId: '/home/u',
      fileName: 'a.txt'
    })
  })

  it('splits sftp/archive style conn::path', () => {
    expect(splitEntryParentAndName('user@h:22::/var/log/a.txt')).toEqual({
      destLocationId: 'user@h:22::/var/log/',
      fileName: 'a.txt'
    })
  })

  it('splits archive root file', () => {
    expect(splitEntryParentAndName('/tmp/a.zip::readme.md')).toEqual({
      destLocationId: '/tmp/a.zip::',
      fileName: 'readme.md'
    })
  })

  it('splits nested archive path', () => {
    expect(splitEntryParentAndName('/tmp/a.zip::src/lib/x.ts')).toEqual({
      destLocationId: '/tmp/a.zip::src/lib/',
      fileName: 'x.ts'
    })
  })
})

describe('PluginManager.writeEntryContent', () => {
  let tmp: string
  let manager: PluginManager
  let local: LocalFilesystemPlugin
  let archive: ArchivePlugin

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sc-write-entry-'))
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
    await fs.rm(tmp, { recursive: true, force: true })
  })

  it('writes local filesystem files', async () => {
    const file = path.join(tmp, 'note.txt')
    await fs.writeFile(file, 'old')
    const result = await manager.writeEntryContent('local-filesystem', file, 'hello world')
    expect(result.success).toBe(true)
    expect(result.bytesWritten).toBe(Buffer.byteLength('hello world'))
    expect(await fs.readFile(file, 'utf8')).toBe('hello world')
  })

  it('writes into a zip archive entry', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const yazl = require('yazl') as typeof import('yazl')
    const zipPath = path.join(tmp, 'pack.zip')
    const zip = new yazl.ZipFile()
    zip.addBuffer(Buffer.from('original'), 'docs/readme.txt')
    zip.end()
    await new Promise<void>((resolve, reject) => {
      zip.outputStream.pipe(fsSync.createWriteStream(zipPath)).on('finish', resolve).on('error', reject)
    })

    const entryId = `${zipPath}::docs/readme.txt`
    const result = await manager.writeEntryContent('archive', entryId, 'updated readme')
    expect(result.success).toBe(true)

    // Re-read via plugin
    const read = await manager.readEntryContent('archive', entryId, 0)
    expect(read.error).toBeUndefined()
    expect(String(read.data)).toBe('updated readme')
  })

  it('returns a clear error for unknown plugins', async () => {
    const result = await manager.writeEntryContent('nope', '/x', 'y')
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Unknown plugin/i)
  })
})
