/**
 * Real child processes through the streaming runner: chunks arrive in
 * order keyed by run id, stderr is tagged, exit codes / spawn errors
 * surface, Stop kills the whole tree, and stdin is closed so tools that
 * wait for input finish immediately.
 */
import { describe, it, expect, vi } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { CommandRunner, type RunEvent } from '../main/command-runner'

vi.mock('electron', () => ({ app: { on: vi.fn() }, ipcMain: { handle: vi.fn() } }))

const posix = process.platform !== 'win32'

function makeRunner(): CommandRunner {
  return new CommandRunner({ env: async () => ({ ...process.env }), shell: async (o) => o || '/bin/sh' })
}

function collect(runner: CommandRunner, runId: string, command: string, cwd = os.tmpdir()) {
  const events: RunEvent[] = []
  const done = new Promise<RunEvent>((resolve) => {
    void runner.start(runId, { command, cwd }, (ev) => {
      events.push(ev)
      if (ev.type === 'exit') resolve(ev)
    })
  })
  const text = (stream?: 'stdout' | 'stderr'): string =>
    events
      .filter((e): e is Extract<RunEvent, { type: 'data' }> => e.type === 'data' && (!stream || e.stream === stream))
      .map((e) => e.text)
      .join('')
  return { events, done, text }
}

describe.skipIf(!posix)('CommandRunner', () => {
  it('streams stdout/stderr and reports the exit code', async () => {
    const r = makeRunner()
    const run = collect(r, 'a', 'echo one; sleep 0.1; echo two; echo bad >&2; exit 3')
    const exit = await run.done
    expect(run.text('stdout')).toBe('one\ntwo\n')
    expect(run.text('stderr')).toBe('bad\n')
    expect(exit).toMatchObject({ type: 'exit', runId: 'a', code: 3 })
    expect(run.events.every((e) => e.runId === 'a')).toBe(true)
    expect(r.activeCount).toBe(0)
  })

  it('delivers output before the process ends (streaming)', async () => {
    const r = makeRunner()
    let firstAt = 0
    const t0 = Date.now()
    const done = new Promise<void>((resolve) => {
      void r.start('s', { command: 'echo early; sleep 0.6; echo late', cwd: os.tmpdir() }, (ev) => {
        if (ev.type === 'data' && !firstAt) firstAt = Date.now() - t0
        if (ev.type === 'exit') resolve()
      })
    })
    await done
    expect(firstAt).toBeGreaterThan(0)
    expect(firstAt).toBeLessThan(500)
  })

  it('keeps multi-byte UTF-8 intact across chunk boundaries', async () => {
    const r = makeRunner()
    const run = collect(r, 'u', "printf '\\303'; sleep 0.1; printf '\\251\\n'")
    await run.done
    expect(run.text()).toBe('é\n')
  })

  it('stdin is closed: cat returns at once instead of hanging', async () => {
    const r = makeRunner()
    const t0 = Date.now()
    const run = collect(r, 'c', 'cat; echo after')
    const exit = await run.done
    expect(exit).toMatchObject({ code: 0 })
    expect(run.text()).toBe('after\n')
    expect(Date.now() - t0).toBeLessThan(3000)
  })

  it('surfaces spawn errors (bad cwd)', async () => {
    const r = makeRunner()
    const run = collect(r, 'e', 'echo hi', '/definitely/not/here')
    const exit = await run.done
    expect(exit).toMatchObject({ type: 'exit', code: null })
    expect((exit as Extract<RunEvent, { type: 'exit' }>).error).toMatch(/ENOENT/)
  })

  it('stop() kills the whole process tree', async () => {
    const r = makeRunner()
    const marker = path.join(os.tmpdir(), `sc-stop-${process.pid}-${Date.now()}`)
    const run = collect(r, 'k', `(sleep 1.5; touch '${marker}') & sleep 30`)
    await new Promise((res) => setTimeout(res, 200))
    expect(r.isRunning('k')).toBe(true)
    expect(r.stop('k')).toBe(true)
    const exit = await run.done
    expect(exit).toMatchObject({ stopped: true })
    await new Promise((res) => setTimeout(res, 1800))
    expect(fs.existsSync(marker)).toBe(false) // the background child died too
    expect(r.stop('k')).toBe(false)
  })

  it('rejects duplicate run ids', async () => {
    const r = makeRunner()
    const run = collect(r, 'd', 'sleep 0.2')
    await expect(r.start('d', { command: 'true', cwd: os.tmpdir() }, () => {})).rejects.toThrow(/already/)
    await run.done
  })
})
