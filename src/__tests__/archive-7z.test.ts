/**
 * Integration tests for 7z archive browsing via SevenZDriver.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import * as path from 'path'
import * as os from 'os'
import _7z from '7zip-min'
import { ArchivePlugin } from '../main/plugins/archive'

async function createTest7z(
  tmpDir: string,
  fileName: string,
  entries: Array<{ name: string; content?: string; isDir?: boolean }>
): Promise<string> {
  const srcDir = path.join(tmpDir, 'src-' + Date.now())
  await fs.mkdir(srcDir, { recursive: true })
  const dirPaths = entries.filter((e) => e.isDir).map((e) => e.name)
  const pathsToAdd: string[] = []
  for (const entry of entries) {
    const full = path.join(srcDir, entry.name)
    if (entry.isDir) {
      await fs.mkdir(full, { recursive: true })
      pathsToAdd.push(full)
    } else {
      await fs.mkdir(path.dirname(full), { recursive: true })
      await fs.writeFile(full, entry.content ?? '')
      if (!dirPaths.some((d) => entry.name.startsWith(d + '/'))) {
        pathsToAdd.push(full)
      }
    }
  }
  const archivePath = path.join(tmpDir, fileName)
  await _7z.cmd(['a', '-t7z', archivePath, ...pathsToAdd])
  return archivePath
}

describe('7z archive support', () => {
  let tmpDir: string
  let plugin: ArchivePlugin

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sc-7z-test-'))
    plugin = new ArchivePlugin()
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('recognizes .7z files as archives', () => {
    expect(ArchivePlugin.isArchive('/home/user/archive.7z')).toBe(true)
    expect(ArchivePlugin.isArchive('/home/user/archive.zip')).toBe(true)
    expect(ArchivePlugin.isArchive('/home/user/readme.txt')).toBe(false)
  })

  it('lists root entries in a 7z archive', async () => {
    const archivePath = await createTest7z(tmpDir, 'test.7z', [
      { name: 'readme.txt', content: 'hello' },
      { name: 'docs', isDir: true },
      { name: 'docs/guide.txt', content: 'guide' }
    ])

    const result = await plugin.readDirectory(`${archivePath}::`)

    const names = result.entries.map((e) => e.name).sort()
    expect(names).toEqual(['docs', 'readme.txt'])
    expect(result.location).toMatch(/\[test\.7z\]/)
  })

  it('browses into a subdirectory', async () => {
    const archivePath = await createTest7z(tmpDir, 'nested.7z', [
      { name: 'src', isDir: true },
      { name: 'src/main.ts', content: 'export {}' }
    ])

    const root = await plugin.readDirectory(`${archivePath}::`)
    const srcDir = root.entries.find((e) => e.isContainer && e.name === 'src')
    expect(srcDir).toBeDefined()

    const inner = await plugin.readDirectory(srcDir!.id)
    expect(inner.entries.some((e) => e.name === 'main.ts')).toBe(true)
  })

  it('extracts a single file from a 7z archive', async () => {
    const archivePath = await createTest7z(tmpDir, 'extract.7z', [
      { name: 'data.txt', content: 'payload' }
    ])
    const destDir = path.join(tmpDir, 'out')
    const result = await plugin.executeOperation({
      op: 'copy',
      sourceEntries: [{
        id: `${archivePath}::data.txt`,
        name: 'data.txt',
        isContainer: false,
        size: 7,
        modifiedAt: 0,
        mimeType: '',
        iconHint: 'file',
        meta: {},
        attributes: { readonly: false, hidden: false, symlink: false }
      }],
      destinationLocationId: destDir,
      destinationPluginId: 'local-filesystem'
    })

    expect(result.success).toBe(true)
    const extracted = await fs.readFile(path.join(destDir, 'data.txt'), 'utf8')
    expect(extracted).toBe('payload')
  })

  it('opens a read stream for a file inside a 7z archive', async () => {
    const archivePath = await createTest7z(tmpDir, 'stream.7z', [
      { name: 'note.txt', content: 'streamed' }
    ])

    const stream = await plugin.createReadStream(`${archivePath}::note.txt`)
    expect(stream).not.toBeNull()

    const chunks: Buffer[] = []
    for await (const chunk of stream as AsyncIterable<Buffer>) {
      chunks.push(chunk)
    }
    expect(Buffer.concat(chunks).toString('utf8')).toBe('streamed')
  })

  it('resolves a local 7z path to an archive location', async () => {
    const archivePath = await createTest7z(tmpDir, 'resolve.7z', [
      { name: 'a.txt', content: 'a' }
    ])
    const resolved = await plugin.resolveLocation(archivePath)
    expect(resolved).toBe(`${archivePath}::`)
  })
})