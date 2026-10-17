import { describe, it, expect, vi, beforeEach } from 'vitest'

const execFileMock = vi.fn()
const runner = (cmd: string, args: string[]): Promise<{ ok: boolean; error?: string }> => execFileMock(cmd, args)

import {
  buildWindowsCommand,
  buildMacCommand,
  buildLinuxDbusCommands,
  openLinuxProperties,
  openMacProperties,
  fileUri,
  WINDOWS_PROPERTIES_SCRIPT,
  WIN_PATH_ENV
} from '../main/ipc/file-properties'
import { canShowNativeProperties, showNativeProperties } from '../renderer/src/utils/native-properties'

describe('canShowNativeProperties (local-only gate)', () => {
  it('allows plain local files and folders', () => {
    expect(canShowNativeProperties('local-filesystem', '/home/u/file.txt')).toBe(true)
    expect(canShowNativeProperties('local-filesystem', 'C:\\Users\\u\\Docs')).toBe(true)
  })

  it('rejects entries inside archives', () => {
    expect(canShowNativeProperties('local-filesystem', '/home/u/a.zip::inner/file.txt')).toBe(false)
    expect(canShowNativeProperties('local-filesystem', 'D:\\a.7z::dir')).toBe(false)
  })

  it('rejects plugin filesystems', () => {
    for (const id of ['sftp', 'smb', 's3', 'archive', 'some-external-plugin']) {
      expect(canShowNativeProperties(id, '/remote/path')).toBe(false)
    }
  })

  it('rejects missing ids', () => {
    expect(canShowNativeProperties('local-filesystem', '')).toBe(false)
    expect(canShowNativeProperties(undefined, '/x')).toBe(false)
  })
})

describe('showNativeProperties (renderer → IPC)', () => {
  beforeEach(() => {
    vi.mocked(window.api.util.showFileProperties).mockReset()
  })

  it('calls IPC for a local entry and stays silent on success', async () => {
    vi.mocked(window.api.util.showFileProperties).mockResolvedValue({ success: true })
    expect(await showNativeProperties('local-filesystem', '/tmp/a.txt')).toBeNull()
    expect(window.api.util.showFileProperties).toHaveBeenCalledWith('/tmp/a.txt')
  })

  it('never calls IPC for remote or archive entries', async () => {
    expect(await showNativeProperties('sftp', '/x')).toMatch(/only available for local/)
    expect(await showNativeProperties('local-filesystem', '/a.zip::b')).toMatch(/only available for local/)
    expect(window.api.util.showFileProperties).not.toHaveBeenCalled()
  })

  it('surfaces errors and the reveal-in-folder fallback', async () => {
    vi.mocked(window.api.util.showFileProperties).mockResolvedValueOnce({ success: false, error: 'boom' })
    expect(await showNativeProperties('local-filesystem', '/a')).toBe('boom')
    vi.mocked(window.api.util.showFileProperties).mockResolvedValueOnce({ success: true, fallback: 'showItemInFolder' })
    expect(await showNativeProperties('local-filesystem', '/a')).toMatch(/revealed in file manager/)
  })
})

describe('Windows command', () => {
  it('passes the path via env, never inside the script text', () => {
    const p = "C:\\Users\\o'brien\\$(evil) `x`.txt"
    const { cmd, args, env } = buildWindowsCommand(p)
    expect(cmd).toBe('powershell.exe')
    expect(env[WIN_PATH_ENV]).toBe(p)
    const encoded = args[args.indexOf('-EncodedCommand') + 1]
    const script = Buffer.from(encoded, 'base64').toString('utf16le')
    expect(script).toBe(WINDOWS_PROPERTIES_SCRIPT)
    expect(script).not.toContain('evil')
    expect(args).toContain('Hidden')
  })

  it('invokes the properties verb and keeps the host alive while the sheet is open', () => {
    expect(WINDOWS_PROPERTIES_SCRIPT).toContain('InvokeVerb("properties")')
    expect(WINDOWS_PROPERTIES_SCRIPT).toMatch(/while \(\[SC\.W\]::HasVisibleWindow/)
    expect(WINDOWS_PROPERTIES_SCRIPT).toContain('Start-Sleep')
  })
})

describe('macOS command', () => {
  it('opens Finder Get Info with the path as argv and activates Finder', () => {
    const p = '/Users/me/My "quoted" file\\.txt'
    const { cmd, args } = buildMacCommand(p)
    expect(cmd).toBe('osascript')
    expect(args[args.length - 1]).toBe(p)
    const script = args.filter((_, i) => args[i - 1] === '-e').join('\n')
    expect(script).toContain('open information window of (POSIX file (item 1 of argv) as alias)')
    expect(script).toContain('activate')
    expect(script).not.toContain(p)
  })

  it('reports osascript failure', async () => {
    execFileMock.mockResolvedValueOnce({ ok: false, error: 'Finder got an error' })
    expect(await openMacProperties('/nope', runner)).toEqual({ success: false, error: 'Finder got an error' })
  })
})

describe('Linux FileManager1.ShowItemProperties', () => {
  beforeEach(() => execFileMock.mockReset())

  // POSIX paths only: on Windows pathToFileURL resolves '/home/...' against the
  // current drive (file:///D:/home/...). The DBus path never runs there.
  it.skipIf(process.platform === 'win32')('builds gdbus and dbus-send calls with a percent-encoded file URI', () => {
    const p = '/home/u/a b/"q".txt'
    expect(fileUri(p)).toBe('file:///home/u/a%20b/%22q%22.txt')
    const [gdbus, dbusSend] = buildLinuxDbusCommands(p)
    expect(gdbus.cmd).toBe('gdbus')
    expect(gdbus.args).toContain('org.freedesktop.FileManager1.ShowItemProperties')
    expect(gdbus.args).toContain('["file:///home/u/a%20b/%22q%22.txt"]')
    expect(dbusSend.cmd).toBe('dbus-send')
    expect(dbusSend.args).toContain('array:string:file:///home/u/a%20b/%22q%22.txt')
  })

  it('succeeds via DBus without falling back', async () => {
    execFileMock.mockResolvedValue({ ok: true })
    const reveal = vi.fn()
    expect(await openLinuxProperties('/tmp/x', reveal, runner)).toEqual({ success: true })
    expect(execFileMock).toHaveBeenCalledTimes(1)
    expect(reveal).not.toHaveBeenCalled()
  })

  it('tries dbus-send after gdbus, then falls back to showItemInFolder', async () => {
    execFileMock.mockResolvedValue({ ok: false, error: 'no service' })
    const reveal = vi.fn()
    expect(await openLinuxProperties('/tmp/x', reveal, runner)).toEqual({ success: true, fallback: 'showItemInFolder' })
    expect(execFileMock.mock.calls.map((c) => c[0])).toEqual(['gdbus', 'dbus-send'])
    expect(reveal).toHaveBeenCalledWith('/tmp/x')
  })
})
