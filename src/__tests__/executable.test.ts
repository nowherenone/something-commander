import { describe, expect, it } from 'vitest'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs/promises'
import { isExecutableFile } from '../shared/executable'
import { LocalFilesystemPlugin } from '../main/plugins/local-filesystem'

describe('isExecutableFile', () => {
  it('treats any Unix execute bit as executable and ignores a plain file', () => {
    expect(isExecutableFile('linux', 'tool', 0o755)).toBe(true)
    expect(isExecutableFile('darwin', 'tool', 0o644)).toBe(false)
    expect(isExecutableFile('linux', 'script.sh', 0o111)).toBe(true)
  })

  it('uses Windows executable extensions instead of the mode bit', () => {
    expect(isExecutableFile('win32', 'app.exe', 0o644)).toBe(true)
    expect(isExecutableFile('win32', 'setup.msi', 0o666)).toBe(true)
    expect(isExecutableFile('win32', 'notes.txt', 0o755)).toBe(false)
    expect(isExecutableFile('win32', 'run.bat', 0o666)).toBe(true)
    expect(isExecutableFile('win32', 'Shortcut.LNK', 0o666)).toBe(true)
    expect(isExecutableFile('win32', 'site.url', 0o666)).toBe(true)
    expect(isExecutableFile('win32', 'old.pif', 0o666)).toBe(true)
    expect(isExecutableFile('win32', 'Show Desktop.scf', 0o666)).toBe(true)
    expect(isExecutableFile('win32', 'MyApp.appref-ms', 0o666)).toBe(true)
    expect(isExecutableFile('win32', 'pin.website', 0o666)).toBe(true)
    expect(isExecutableFile('linux', 'Shortcut.lnk', 0o644)).toBe(false)
  })
})

describe('local filesystem executable marker', () => {
  it('marks a +x file and leaves a directory and a plain file unmarked', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sc-exec-'))
    try {
      await fs.writeFile(path.join(dir, 'plain.txt'), 'x')
      await fs.chmod(path.join(dir, 'plain.txt'), 0o644)
      await fs.writeFile(path.join(dir, 'tool'), '#!/bin/sh\n')
      await fs.chmod(path.join(dir, 'tool'), 0o755)
      await fs.mkdir(path.join(dir, 'subdir'))

      const plugin = new LocalFilesystemPlugin()
      const { entries } = await plugin.readDirectory(dir)
      const byName = Object.fromEntries(entries.map((e) => [e.name, e]))

      expect(byName['tool'].attributes.executable).toBe(true)
      expect(byName['plain.txt'].attributes.executable).toBeUndefined()
      expect(byName['subdir'].attributes.executable).toBeUndefined()
      expect(byName['subdir'].isContainer).toBe(true)
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })
})
