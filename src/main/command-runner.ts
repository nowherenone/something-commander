/**
 * Streaming command runner for the bottom command line. Spawns the user's
 * shell (no PTY — stdin is closed so interactive tools fail fast instead of
 * hanging), streams UTF-8 chunks keyed by run id, and stops whole process
 * trees on request. No time limit. No Electron imports, so it is unit-tested
 * with real processes.
 */
import { spawn, type ChildProcess } from 'child_process'
import { StringDecoder } from 'string_decoder'
import { buildShellInvocation, commandEnv, resolveShell, type Env } from './shell-env'
import type { CmdExitEvent, CmdRunEvent, CmdStartOptions } from '@shared/types/cmdline'

export type RunEvent = CmdRunEvent
export type StartOptions = CmdStartOptions

interface Run {
  child: ChildProcess
  stopped: boolean
  killTimer?: NodeJS.Timeout
}

/** Batch small chunks so a chatty process doesn't flood IPC. */
const FLUSH_MS = 30

export class CommandRunner {
  private runs = new Map<string, Run>()
  /** Ids between start() and spawn (env/shell lookups are async). */
  private starting = new Set<string>()

  constructor(
    private readonly deps: {
      env?: () => Promise<Env>
      shell?: (override?: string) => Promise<string>
      platform?: NodeJS.Platform
    } = {}
  ) {}

  get activeCount(): number {
    return this.runs.size
  }

  isRunning(runId: string): boolean {
    return this.runs.has(runId)
  }

  async start(runId: string, opts: StartOptions, emit: (ev: RunEvent) => void): Promise<{ shell: string }> {
    if (this.runs.has(runId) || this.starting.has(runId)) throw new Error(`run ${runId} already exists`)
    this.starting.add(runId)
    const platform = this.deps.platform ?? process.platform
    let env: Env
    let shell: string
    try {
      env = await (this.deps.env ?? commandEnv)()
      shell = await (this.deps.shell ?? resolveShell)(opts.shell)
    } finally {
      this.starting.delete(runId)
    }
    const inv = buildShellInvocation(shell, opts.command, platform)

    let finished = false
    const finish = (ev: Omit<CmdExitEvent, 'type' | 'runId' | 'stopped'>): void => {
      if (finished) return
      finished = true
      flushAll()
      const run = this.runs.get(runId)
      if (run?.killTimer) clearTimeout(run.killTimer)
      this.runs.delete(runId)
      emit({ type: 'exit', runId, ...ev, stopped: run?.stopped || undefined })
    }

    const buffers: Record<'stdout' | 'stderr', string> = { stdout: '', stderr: '' }
    const decoders = { stdout: new StringDecoder('utf8'), stderr: new StringDecoder('utf8') }
    let timer: NodeJS.Timeout | null = null
    const flushAll = (): void => {
      if (timer) clearTimeout(timer)
      timer = null
      for (const stream of ['stdout', 'stderr'] as const) {
        const text = buffers[stream]
        buffers[stream] = ''
        if (text) emit({ type: 'data', runId, stream, text })
      }
    }
    const onData = (stream: 'stdout' | 'stderr') => (buf: Buffer): void => {
      buffers[stream] += decoders[stream].write(buf)
      if (!timer) timer = setTimeout(flushAll, FLUSH_MS)
    }

    let child: ChildProcess
    try {
      child = spawn(inv.file, inv.args, {
        cwd: opts.cwd,
        env: env as NodeJS.ProcessEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
        // Own process group on POSIX so Stop can kill the whole tree.
        detached: platform !== 'win32',
        windowsHide: true,
        windowsVerbatimArguments: inv.windowsVerbatimArguments
      })
    } catch (err) {
      finish({ code: null, signal: null, error: err instanceof Error ? err.message : String(err) })
      return { shell }
    }
    this.runs.set(runId, { child, stopped: false })
    child.stdout?.on('data', onData('stdout'))
    child.stderr?.on('data', onData('stderr'))
    child.once('error', (err) => {
      // Spawn failures emit 'error' and may never emit 'close'.
      if (child.pid === undefined) finish({ code: null, signal: null, error: err.message })
    })
    child.once('close', (code, signal) => {
      buffers.stdout += decoders.stdout.end()
      buffers.stderr += decoders.stderr.end()
      finish({ code, signal: signal ?? null })
    })
    return { shell }
  }

  /** Stop a run and everything it started. Returns false for unknown ids. */
  stop(runId: string): boolean {
    const run = this.runs.get(runId)
    if (!run || run.child.pid === undefined) return false
    run.stopped = true
    const pid = run.child.pid
    const platform = this.deps.platform ?? process.platform
    if (platform === 'win32') {
      spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => {
        run.child.kill()
      })
      return true
    }
    const kill = (sig: NodeJS.Signals): void => {
      try {
        process.kill(-pid, sig)
      } catch {
        try {
          run.child.kill(sig)
        } catch {
          /* already gone */
        }
      }
    }
    kill('SIGTERM')
    run.killTimer = setTimeout(() => kill('SIGKILL'), 2000)
    return true
  }

  stopAll(): void {
    for (const id of [...this.runs.keys()]) this.stop(id)
  }
}
