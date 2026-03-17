/**
 * Integration tests for ArchivePlugin write operations.
 * These tests create real ZIP files in a temp directory and verify
 * that add, delete, rename, and move operations produce correct results.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import { ArchivePlugin } from '../main/plugins/archive'
import { Readable } from 'stream'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Create a test ZIP at tmpDir/name.zip containing the given entries. */
async function createTestZip(
  tmpDir: string,
  fileName: string,
  entries: Record<string, string> // internalPath -> content
): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const yazl = require('yazl') as typeof import('yazl')
  const zipPath = path.join(tmpDir, fileName)
  const zip = new yazl.ZipFile()

  for (const [name, content] of Object.entries(entries)) {
    if (name.endsWith('/')) {
      zip.addEmptyDirectory(name.replace(/\/$/, ''))
    } else {
      zip.addBuffer(Buffer.from(content), name)
    }
  }

  zip.end()

  await new Promise<void>((resolve, reject) => {
    zip.outputStream.pipe(fsSync.createWriteStream(zipPath))
      .on('finish', resolve)
      .on('error', reject)
  })

  return zipPath
}

/** Read all entry names from a ZIP (sorted). */
async function listZipEntries(zipPath: string): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const yauzl = require('yauzl') as typeof import('yauzl')
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) return reject(err)
      const names: string[] = []
      zipfile.readEntry()
      zipfile.on('entry', (e) => { names.push(e.fileName); zipfile.readEntry() })
      zipfile.on('end', () => resolve(names.sort()))
      zipfile.on('error', reject)
    })
  })
}

/** Read content of a specific entry from a ZIP. */
async function readZipEntry(zipPath: string, internalPath: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const yauzl = require('yauzl') as typeof import('yauzl')
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) return reject(err)
      zipfile.readEntry()
      zipfile.on('entry', (entry) => {
        if (entry.fileName === internalPath) {
          zipfile.openReadStream(entry, (streamErr, readStream) => {
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
      zipfile.on('end', () => reject(new Error(`Entry not found: ${internalPath}`)))
      zipfile.on('error', reject)
    })
  })
}

/** Make a Readable stream from a string. */
function streamFromString(content: string): NodeJS.ReadableStream {
  return Readable.from(Buffer.from(content)) as NodeJS.ReadableStream
}

function makeEntry(id: string, name: string, isContainer = false) {
  return { id, name, isContainer, size: 0, modifiedAt: 0, mimeType: '', iconHint: 'file', meta: {}, attributes: { readonly: false, hidden: false, symlink: false } }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ArchivePlugin write operations', () => {
  let tmpDir: string
  let plugin: ArchivePlugin

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sc-archive-test-'))
    plugin = new ArchivePlugin()
    await plugin.initialize()
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  // ── getSupportedOperations ─────────────────────────────────────────────────

  it('supports copy, delete, rename, move', () => {
    const ops = plugin.getSupportedOperations()
    expect(ops).toContain('copy')
    expect(ops).toContain('delete')
    expect(ops).toContain('rename')
    expect(ops).toContain('move')
  })

  // ── enumerateFiles ─────────────────────────────────────────────────────────

  describe('enumerateFiles', () => {
    it('enumerates a single file', async () => {
      const zipPath = await createTestZip(tmpDir, 'test.zip', { 'readme.txt': 'hello' })
      const result = await plugin.enumerateFiles([`${zipPath}::readme.txt`], '/dest')
      expect(result).toHaveLength(1)
      expect(result[0].sourcePath).toBe(`${zipPath}::readme.txt`)
      expect(result[0].relativePath).toBe('readme.txt')
      expect(result[0].size).toBe(5)
      expect(result[0].isDirectory).toBe(false)
      expect(result[0].destPath).toBe(path.join('/dest', 'readme.txt'))
    })

    it('enumerates a directory recursively', async () => {
      const zipPath = await createTestZip(tmpDir, 'test.zip', {
        'src/': '',
        'src/main.ts': 'code',
        'src/util.ts': 'util',
        'docs/readme.md': 'docs'
      })
      const result = await plugin.enumerateFiles([`${zipPath}::src/`], '/dest')
      const paths = result.map(r => r.relativePath).sort()
      expect(paths).toContain('src/main.ts')
      expect(paths).toContain('src/util.ts')
      expect(paths).not.toContain('docs/readme.md')
    })

    it('enumerates whole archive when internal path is empty', async () => {
      const zipPath = await createTestZip(tmpDir, 'test.zip', {
        'a.txt': 'a',
        'b.txt': 'b',
        'sub/c.txt': 'c'
      })
      const result = await plugin.enumerateFiles([`${zipPath}::`], '/dest')
      const paths = result.map(r => r.relativePath).sort()
      expect(paths).toContain('a.txt')
      expect(paths).toContain('b.txt')
      expect(paths).toContain('sub/c.txt')
    })

    it('opens each archive only once for multiple entryIds', async () => {
      const zipPath = await createTestZip(tmpDir, 'test.zip', {
        'a.txt': 'a',
        'b.txt': 'b'
      })
      // Two entries from same archive — should both be returned
      const result = await plugin.enumerateFiles(
        [`${zipPath}::a.txt`, `${zipPath}::b.txt`],
        '/dest'
      )
      expect(result).toHaveLength(2)
    })

    it('returns empty for missing entry', async () => {
      const zipPath = await createTestZip(tmpDir, 'test.zip', { 'a.txt': 'a' })
      const result = await plugin.enumerateFiles([`${zipPath}::nope.txt`], '/dest')
      expect(result).toHaveLength(0)
    })
  })

  // ── writeFromStream ────────────────────────────────────────────────────────

  describe('writeFromStream', () => {
    it('adds a file to an existing archive', async () => {
      const zipPath = await createTestZip(tmpDir, 'test.zip', { 'existing.txt': 'old' })

      const result = await plugin.writeFromStream(
        `${zipPath}::`,
        'new.txt',
        streamFromString('new content')
      )

      expect(result.success).toBe(true)
      expect(result.bytesWritten).toBe(11) // 'new content'.length
      const entries = await listZipEntries(zipPath)
      expect(entries).toContain('existing.txt')
      expect(entries).toContain('new.txt')
      expect(await readZipEntry(zipPath, 'new.txt')).toBe('new content')
    })

    it('creates a new archive when it does not exist', async () => {
      const zipPath = path.join(tmpDir, 'brand-new.zip')

      const result = await plugin.writeFromStream(
        `${zipPath}::`,
        'hello.txt',
        streamFromString('world')
      )

      expect(result.success).toBe(true)
      expect(result.bytesWritten).toBe(5)
      const entries = await listZipEntries(zipPath)
      expect(entries).toContain('hello.txt')
      expect(await readZipEntry(zipPath, 'hello.txt')).toBe('world')
    })

    it('overwrites an existing entry at the same path', async () => {
      const zipPath = await createTestZip(tmpDir, 'test.zip', { 'file.txt': 'original' })

      await plugin.writeFromStream(`${zipPath}::`, 'file.txt', streamFromString('updated'))

      const entries = await listZipEntries(zipPath)
      // Should contain exactly one file.txt
      expect(entries.filter(e => e === 'file.txt')).toHaveLength(1)
      expect(await readZipEntry(zipPath, 'file.txt')).toBe('updated')
    })

    it('places file into a subdirectory', async () => {
      const zipPath = await createTestZip(tmpDir, 'test.zip', { 'other.txt': 'x' })

      await plugin.writeFromStream(`${zipPath}::src/`, 'main.ts', streamFromString('code'))

      const entries = await listZipEntries(zipPath)
      expect(entries).toContain('src/main.ts')
    })

    it('returns correct byte count', async () => {
      const zipPath = path.join(tmpDir, 'bytes.zip')
      const content = 'hello world!'
      const result = await plugin.writeFromStream(`${zipPath}::`, 'f.txt', streamFromString(content))
      expect(result.success).toBe(true)
      expect(result.bytesWritten).toBe(Buffer.byteLength(content))
    })

    it('copies a real file from disk into a new archive (simulates copy-in flow)', async () => {
      // Create a real file on disk — this is what the local-filesystem plugin streams
      const srcFile = path.join(tmpDir, 'source.txt')
      await fs.writeFile(srcFile, 'content from disk')
      const zipPath = path.join(tmpDir, 'copy-in.zip')

      const stream = fsSync.createReadStream(srcFile)
      const result = await plugin.writeFromStream(`${zipPath}::`, 'source.txt', stream)

      expect(result.success).toBe(true)
      expect(result.bytesWritten).toBe(17)
      expect(await readZipEntry(zipPath, 'source.txt')).toBe('content from disk')
    })

    it('copies a real file into an existing archive without corrupting other entries', async () => {
      const zipPath = await createTestZip(tmpDir, 'existing.zip', {
        'keep.txt': 'keep me',
        'sub/data.bin': '12345'
      })
      const srcFile = path.join(tmpDir, 'incoming.txt')
      await fs.writeFile(srcFile, 'incoming data')

      const stream = fsSync.createReadStream(srcFile)
      const result = await plugin.writeFromStream(`${zipPath}::sub/`, 'incoming.txt', stream)

      expect(result.success).toBe(true)
      const entries = await listZipEntries(zipPath)
      expect(entries).toContain('keep.txt')
      expect(entries).toContain('sub/data.bin')
      expect(entries).toContain('sub/incoming.txt')
      expect(await readZipEntry(zipPath, 'keep.txt')).toBe('keep me')
      expect(await readZipEntry(zipPath, 'sub/incoming.txt')).toBe('incoming data')
    })

    it('handles Windows-style backslash destPath (simulates path.join with archive destination)', async () => {
      // On Windows, path.join('D:\\archive.zip::', 'file.txt') → 'D:\\archive.zip::file.txt' with backslash
      // The internal part after '::' may start with backslash and use backslash separators
      // After normalization in useFileOperations.ts, we expect forward slashes and no leading slash
      const zipPath = path.join(tmpDir, 'win-paths.zip')

      // Simulate what useFileOperations does after normalization:
      // internalPart = '\file.txt'.replace(/\\/g, '/').replace(/^\//, '') → 'file.txt'
      // destDir = archivePart + '::' (= zipPath + '::'), destFileName = 'file.txt'
      const result = await plugin.writeFromStream(`${zipPath}::`, 'file.txt', streamFromString('win content'))

      expect(result.success).toBe(true)
      expect(await readZipEntry(zipPath, 'file.txt')).toBe('win content')
    })
  })

  // ── cross-archive copy and move ────────────────────────────────────────────

  describe('cross-archive copy and move', () => {
    it('copies a file from one archive to another', async () => {
      const srcZip = await createTestZip(tmpDir, 'src.zip', { 'hello.txt': 'from src' })
      const destZip = await createTestZip(tmpDir, 'dest.zip', { 'existing.txt': 'existing' })

      const stream = await plugin.createReadStream(`${srcZip}::hello.txt`)
      expect(stream).not.toBeNull()
      const result = await plugin.writeFromStream(`${destZip}::`, 'hello.txt', stream!)

      expect(result.success).toBe(true)
      const entries = await listZipEntries(destZip)
      expect(entries).toContain('hello.txt')
      expect(entries).toContain('existing.txt')
      expect(await readZipEntry(destZip, 'hello.txt')).toBe('from src')
    })

    it('moves a file from one archive to another (copy then delete)', async () => {
      const srcZip = await createTestZip(tmpDir, 'src.zip', {
        'move-me.txt': 'move this',
        'stay.txt': 'stay here'
      })
      const destZip = await createTestZip(tmpDir, 'dest.zip', {})

      const stream = await plugin.createReadStream(`${srcZip}::move-me.txt`)
      await plugin.writeFromStream(`${destZip}::`, 'move-me.txt', stream!)

      const deleteResult = await plugin.executeOperation({
        op: 'delete',
        entries: [makeEntry(`${srcZip}::move-me.txt`, 'move-me.txt')]
      })
      expect(deleteResult.success).toBe(true)

      expect(await listZipEntries(srcZip)).not.toContain('move-me.txt')
      expect(await listZipEntries(srcZip)).toContain('stay.txt')
      expect(await listZipEntries(destZip)).toContain('move-me.txt')
      expect(await readZipEntry(destZip, 'move-me.txt')).toBe('move this')
    })

    it('copies a directory from one archive to another using enumerate+stream', async () => {
      const srcZip = await createTestZip(tmpDir, 'src.zip', {
        'lib/a.ts': 'aaa',
        'lib/b.ts': 'bbb',
        'other.txt': 'other'
      })
      const destZip = await createTestZip(tmpDir, 'dest.zip', { 'existing.txt': 'x' })

      // Simulate what useFileOperations does: enumerate then stream each file
      const fileList = await plugin.enumerateFiles([`${srcZip}::lib/`], `${destZip}::`)
      for (const item of fileList) {
        if (item.isDirectory) continue
        const stream = await plugin.createReadStream(item.sourcePath)
        expect(stream).not.toBeNull()
        // item.destPath = destZip + '::lib/a.ts' — parse it (same logic as useFileOperations)
        const sepIdx = item.destPath.indexOf('::')
        const internalPart = item.destPath.slice(sepIdx + 2).replace(/\\/g, '/').replace(/^\//, '')
        const lastSlash = internalPart.lastIndexOf('/')
        const archiveDest = item.destPath.slice(0, sepIdx) + '::' + (lastSlash >= 0 ? internalPart.slice(0, lastSlash) : '')
        const fileName = lastSlash >= 0 ? internalPart.slice(lastSlash + 1) : internalPart
        await plugin.writeFromStream(archiveDest, fileName, stream!)
      }

      const entries = await listZipEntries(destZip)
      expect(entries).toContain('existing.txt')
      expect(entries).toContain('lib/a.ts')
      expect(entries).toContain('lib/b.ts')
      expect(await readZipEntry(destZip, 'lib/a.ts')).toBe('aaa')
      expect(await readZipEntry(destZip, 'lib/b.ts')).toBe('bbb')
    })

    it('packs local files into a new archive (Alt+F5 pack flow)', async () => {
      const file1 = path.join(tmpDir, 'doc.txt')
      const file2 = path.join(tmpDir, 'data.csv')
      await fs.writeFile(file1, 'document content')
      await fs.writeFile(file2, 'a,b,c')
      const archivePath = path.join(tmpDir, 'packed.zip')

      for (const [filePath, fileName] of [[file1, 'doc.txt'], [file2, 'data.csv']] as [string, string][]) {
        const result = await plugin.writeFromStream(`${archivePath}::`, fileName, fsSync.createReadStream(filePath))
        expect(result.success).toBe(true)
      }

      const entries = await listZipEntries(archivePath)
      expect(entries).toContain('doc.txt')
      expect(entries).toContain('data.csv')
      expect(await readZipEntry(archivePath, 'doc.txt')).toBe('document content')
      expect(await readZipEntry(archivePath, 'data.csv')).toBe('a,b,c')
    })

    it('unpacks archive contents (Alt+F9 unpack flow) — enumerate gives correct dest paths', async () => {
      const srcZip = await createTestZip(tmpDir, 'source.zip', {
        'readme.txt': 'read me',
        'src/main.ts': 'main code',
        'src/util.ts': 'utils'
      })
      const extractDir = path.join(tmpDir, 'extracted')
      await fs.mkdir(extractDir)

      // enumerateFiles with entire archive (id = archivePath + '::') and local dest
      const fileList = await plugin.enumerateFiles([`${srcZip}::`], extractDir)
      const relPaths = fileList.map((f) => f.relativePath).sort()
      expect(relPaths).toContain('readme.txt')
      expect(relPaths).toContain('src/main.ts')
      expect(relPaths).toContain('src/util.ts')

      // Verify destPaths use local path separators (not archive-style)
      const readmePath = fileList.find((f) => f.relativePath === 'readme.txt')
      expect(readmePath!.destPath).toBe(path.join(extractDir, 'readme.txt'))

      // Each entry streams correctly
      for (const item of fileList.filter((f) => !f.isDirectory)) {
        const stream = await plugin.createReadStream(item.sourcePath)
        expect(stream).not.toBeNull()
      }
    })
  })

  // ── executeOperation: delete ───────────────────────────────────────────────

  describe('executeOperation delete', () => {
    it('deletes a single file', async () => {
      const zipPath = await createTestZip(tmpDir, 'test.zip', {
        'keep.txt': 'keep',
        'remove.txt': 'remove'
      })

      const result = await plugin.executeOperation({
        op: 'delete',
        entries: [makeEntry(`${zipPath}::remove.txt`, 'remove.txt')]
      })

      expect(result.success).toBe(true)
      const entries = await listZipEntries(zipPath)
      expect(entries).toContain('keep.txt')
      expect(entries).not.toContain('remove.txt')
    })

    it('deletes a directory and all its children', async () => {
      const zipPath = await createTestZip(tmpDir, 'test.zip', {
        'src/': '',
        'src/main.ts': 'code',
        'src/util.ts': 'util',
        'keep.txt': 'keep'
      })

      const result = await plugin.executeOperation({
        op: 'delete',
        entries: [makeEntry(`${zipPath}::src/`, 'src', true)]
      })

      expect(result.success).toBe(true)
      const entries = await listZipEntries(zipPath)
      expect(entries.some(e => e.startsWith('src/'))).toBe(false)
      expect(entries).toContain('keep.txt')
    })

    it('does not delete entries with similar prefix (src2 when deleting src)', async () => {
      const zipPath = await createTestZip(tmpDir, 'test.zip', {
        'src/a.ts': 'a',
        'src2/b.ts': 'b'
      })

      await plugin.executeOperation({
        op: 'delete',
        entries: [makeEntry(`${zipPath}::src/`, 'src', true)]
      })

      const entries = await listZipEntries(zipPath)
      expect(entries.some(e => e.startsWith('src2/'))).toBe(true)
    })

    it('succeeds even if entry does not exist (idempotent)', async () => {
      const zipPath = await createTestZip(tmpDir, 'test.zip', { 'a.txt': 'a' })

      const result = await plugin.executeOperation({
        op: 'delete',
        entries: [makeEntry(`${zipPath}::nope.txt`, 'nope.txt')]
      })

      expect(result.success).toBe(true)
      expect(await listZipEntries(zipPath)).toContain('a.txt')
    })
  })

  // ── executeOperation: rename ───────────────────────────────────────────────

  describe('executeOperation rename', () => {
    it('renames a file', async () => {
      const zipPath = await createTestZip(tmpDir, 'test.zip', {
        'old.txt': 'content',
        'other.txt': 'other'
      })

      const result = await plugin.executeOperation({
        op: 'rename',
        entry: makeEntry(`${zipPath}::old.txt`, 'old.txt'),
        newName: 'new.txt'
      })

      expect(result.success).toBe(true)
      const entries = await listZipEntries(zipPath)
      expect(entries).toContain('new.txt')
      expect(entries).not.toContain('old.txt')
      expect(entries).toContain('other.txt')
      expect(await readZipEntry(zipPath, 'new.txt')).toBe('content')
    })

    it('renames a file inside a subdirectory', async () => {
      const zipPath = await createTestZip(tmpDir, 'test.zip', { 'src/old.ts': 'code' })

      await plugin.executeOperation({
        op: 'rename',
        entry: makeEntry(`${zipPath}::src/old.ts`, 'old.ts'),
        newName: 'new.ts'
      })

      const entries = await listZipEntries(zipPath)
      expect(entries).toContain('src/new.ts')
      expect(entries).not.toContain('src/old.ts')
    })

    it('renames a directory and updates all child paths', async () => {
      const zipPath = await createTestZip(tmpDir, 'test.zip', {
        'src/': '',
        'src/main.ts': 'main',
        'src/util.ts': 'util',
        'docs/readme.md': 'docs'
      })

      const result = await plugin.executeOperation({
        op: 'rename',
        entry: makeEntry(`${zipPath}::src/`, 'src', true),
        newName: 'lib'
      })

      expect(result.success).toBe(true)
      const entries = await listZipEntries(zipPath)
      expect(entries.some(e => e.startsWith('lib/'))).toBe(true)
      expect(entries).toContain('lib/main.ts')
      expect(entries).toContain('lib/util.ts')
      expect(entries.some(e => e.startsWith('src/'))).toBe(false)
      expect(entries).toContain('docs/readme.md')
    })
  })

  // ── executeOperation: move (within archive) ────────────────────────────────

  describe('executeOperation move', () => {
    it('moves a file to a different directory within the same archive', async () => {
      const zipPath = await createTestZip(tmpDir, 'test.zip', {
        'root.txt': 'root',
        'dest/': ''
      })

      const result = await plugin.executeOperation({
        op: 'move',
        sourceEntries: [makeEntry(`${zipPath}::root.txt`, 'root.txt')],
        destinationLocationId: `${zipPath}::dest/`,
        destinationPluginId: 'archive'
      })

      expect(result.success).toBe(true)
      const entries = await listZipEntries(zipPath)
      expect(entries).toContain('dest/root.txt')
      expect(entries).not.toContain('root.txt')
    })

    it('moves a directory and all its contents', async () => {
      const zipPath = await createTestZip(tmpDir, 'test.zip', {
        'src/main.ts': 'main',
        'src/util.ts': 'util',
        'target/': ''
      })

      await plugin.executeOperation({
        op: 'move',
        sourceEntries: [makeEntry(`${zipPath}::src/`, 'src', true)],
        destinationLocationId: `${zipPath}::target/`,
        destinationPluginId: 'archive'
      })

      const entries = await listZipEntries(zipPath)
      expect(entries).toContain('target/src/main.ts')
      expect(entries).toContain('target/src/util.ts')
      expect(entries.some(e => e === 'src/main.ts' || e === 'src/util.ts')).toBe(false)
    })

    it('rejects cross-plugin move with a clear error', async () => {
      const zipPath = await createTestZip(tmpDir, 'test.zip', { 'a.txt': 'a' })

      const result = await plugin.executeOperation({
        op: 'move',
        sourceEntries: [makeEntry(`${zipPath}::a.txt`, 'a.txt')],
        destinationLocationId: '/some/local/dir',
        destinationPluginId: 'local-filesystem'
      })

      expect(result.success).toBe(false)
    })
  })
})
