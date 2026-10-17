/**
 * Real child-process runs through the main-process command line helpers:
 * exit codes, spawn errors, timeouts and buffer overflow must all surface.
 */
import { describe, it, expect } from 'vitest'
import * as os from 'os'
import { runCommand, runDetached } from '../main/ipc/command-ipc'

const posix = process.platform !== 'win32'
const d = posix ? describe : describe.skip

d('runCommand (posix)', () => {
  it('returns stdout and code 0', async () => {
    const r = await runCommand('echo hi', os.tmpdir(), '/bin/sh')
    expect(r).toMatchObject({ stdout: 'hi\n', code: 0 })
    expect(r.error).toBeUndefined()
  })

  it('reports a non-zero exit with stderr', async () => {
    const r = await runCommand('echo oops >&2; exit 3', os.tmpdir(), '/bin/sh')
    expect(r.code).toBe(3)
    expect(r.stderr).toContain('oops')
    expect(r.error).toBeUndefined()
  })

  it('surfaces spawn errors (missing cwd) via error.message', async () => {
    const r = await runCommand('echo hi', '/definitely/not/here', '/bin/sh')
    expect(r.code).toBe(-1)
    expect(r.error).toMatch(/ENOENT/)
  })

  it('reports timeouts', async () => {
    const r = await runCommand('sleep 5', os.tmpdir(), '/bin/sh', { timeoutMs: 200 })
    expect(r.timedOut).toBe(true)
    expect(r.error).toMatch(/Timed out/)
  })

  it('reports buffer overflow', async () => {
    const r = await runCommand('head -c 200000 /dev/zero | tr "\\0" a', os.tmpdir(), '/bin/sh', { maxBuffer: 1024 })
    expect(r.overflow).toBe(true)
    expect(r.error).toMatch(/exceeded/)
  })

  it('runDetached starts and returns immediately', async () => {
    const t0 = Date.now()
    const r = await runDetached('sleep 2', os.tmpdir(), '/bin/sh')
    expect(r.success).toBe(true)
    expect(Date.now() - t0).toBeLessThan(1500)
  })

  it('runDetached reports a missing cwd', async () => {
    const r = await runDetached('true', '/definitely/not/here', '/bin/sh')
    expect(r.success).toBe(false)
  })
})
