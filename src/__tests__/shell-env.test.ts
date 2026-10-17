import { describe, it, expect, afterEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  parseEnvOutput,
  pickDefaultShell,
  buildShellInvocation,
  encodePowerShell,
  commandNameFor,
  pathDirs,
  pathExts,
  listPathCommands,
  findOnPath,
  _resetShellEnvCache
} from '../main/shell-env'

describe('parseEnvOutput', () => {
  it('reads between markers, ignoring rc noise', () => {
    const out = 'Welcome!\n__SC_ENV_START__\nPATH=/opt/homebrew/bin:/usr/bin\nFOO=a=b\nML=line1\nline2\n__SC_ENV_END__\nbye'
    expect(parseEnvOutput(out)).toEqual({ PATH: '/opt/homebrew/bin:/usr/bin', FOO: 'a=b', ML: 'line1\nline2' })
  })
  it('null without markers', () => {
    expect(parseEnvOutput('PATH=/x')).toBeNull()
  })
})

describe('pickDefaultShell', () => {
  it('uses $SHELL on posix with sensible fallbacks', () => {
    expect(pickDefaultShell('linux', { SHELL: '/usr/bin/fish' }, false)).toBe('/usr/bin/fish')
    expect(pickDefaultShell('linux', {}, false)).toBe('/bin/bash')
    expect(pickDefaultShell('darwin', {}, false)).toBe('/bin/zsh')
  })
  it('prefers pwsh on Windows', () => {
    expect(pickDefaultShell('win32', {}, true)).toBe('pwsh.exe')
    expect(pickDefaultShell('win32', { SHELL: '/bin/bash' }, false)).toBe('powershell.exe')
  })
})

describe('buildShellInvocation', () => {
  it('posix -c', () => {
    expect(buildShellInvocation('/bin/zsh', 'ls -la', 'darwin')).toEqual({ file: '/bin/zsh', args: ['-c', 'ls -la'] })
  })
  it('PowerShell: EncodedCommand with UTF-8 output', () => {
    const inv = buildShellInvocation('pwsh.exe', "echo 'hé'", 'win32')
    expect(inv.args.slice(0, 3)).toEqual(['-NoLogo', '-NonInteractive', '-EncodedCommand'])
    const script = Buffer.from(inv.args[3], 'base64').toString('utf16le')
    expect(script).toContain('[Console]::OutputEncoding')
    expect(script.endsWith("echo 'hé'")).toBe(true)
    expect(encodePowerShell('a')).toBe('YQA=')
  })
  it('cmd: chcp 65001, verbatim args', () => {
    expect(buildShellInvocation('cmd.exe', 'dir', 'win32')).toEqual({
      file: 'cmd.exe',
      args: ['/d', '/s', '/c', '"chcp 65001>nul & dir"'],
      windowsVerbatimArguments: true
    })
  })
})

describe('PATH helpers', () => {
  it('PATHEXT and PATH splitting', () => {
    expect(pathExts({ PATHEXT: '.COM;.EXE;.Ps1' })).toEqual(['.com', '.exe', '.ps1'])
    expect(pathExts({})).toContain('.exe')
    expect(pathDirs({ PATH: '/a:/b::/a' }, 'linux')).toEqual(['/a', '/b'])
    expect(pathDirs({ Path: 'C:\\x;C:\\y' }, 'win32')).toEqual(['C:\\x', 'C:\\y'])
  })
  it('commandNameFor', () => {
    expect(commandNameFor('git.EXE', 'win32', ['.exe'], 0)).toBe('git')
    expect(commandNameFor('readme.txt', 'win32', ['.exe'], 0)).toBeNull()
    expect(commandNameFor('ls', 'linux', [], 0o755)).toBe('ls')
    expect(commandNameFor('notes', 'linux', [], 0o644)).toBeNull()
  })
})

const posix = process.platform !== 'win32'
describe.skipIf(!posix)('PATH scan (real dirs)', () => {
  const oldPath = process.env.PATH
  afterEach(() => {
    process.env.PATH = oldPath
    _resetShellEnvCache()
  })
  it('lists executables once and finds them', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scpath-'))
    fs.writeFileSync(path.join(dir, 'zz-tool'), '#!/bin/sh\n', { mode: 0o755 })
    fs.writeFileSync(path.join(dir, 'zz-data'), 'x', { mode: 0o644 })
    process.env.PATH = dir
    _resetShellEnvCache()
    const cmds = await listPathCommands()
    expect(cmds).toEqual(['zz-tool'])
    expect(await listPathCommands()).toBe(cmds) // cached
    expect(await findOnPath('zz-tool', { PATH: dir }, 'linux')).toBe(path.join(dir, 'zz-tool'))
    expect(await findOnPath('zz-data', { PATH: dir }, 'linux')).toBeNull()
    fs.rmSync(dir, { recursive: true, force: true })
  })
})
