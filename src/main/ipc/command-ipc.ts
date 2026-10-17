import { ipcMain } from 'electron'
import { exec, spawn } from 'child_process'
import { IPC_CHANNELS } from '@shared/types/ipc-channels'
import { describeExecFailure } from '@shared/cmdline'

/** Exec limits for the bottom command line. */
export const RUN_TIMEOUT_MS = 30000
export const RUN_MAX_BUFFER = 1024 * 1024

export interface RunCommandResult {
  stdout: string
  stderr: string
  /** Exit code; 0 on success, -1 when the process never ran or was killed. */
  code: number
  /** Why it failed beyond a plain non-zero exit (spawn error, timeout, overflow). */
  error?: string
  timedOut?: boolean
  overflow?: boolean
}

export function defaultShell(): string {
  return process.platform === 'win32' ? 'powershell.exe' : '/bin/bash'
}

/** Run one command line to completion in `cwd` through `shell`. */
export function runCommand(
  command: string,
  cwd: string,
  shellOverride?: string,
  limits: { timeoutMs?: number; maxBuffer?: number } = {}
): Promise<RunCommandResult> {
  const timeoutMs = limits.timeoutMs ?? RUN_TIMEOUT_MS
  const maxBuffer = limits.maxBuffer ?? RUN_MAX_BUFFER
  return new Promise((resolve) => {
    const opts = {
      cwd,
      shell: shellOverride || defaultShell(),
      timeout: timeoutMs,
      maxBuffer,
      windowsHide: true
    }
    try {
      exec(command, opts, (error, stdout, stderr) => {
        const failure = describeExecFailure(error, { timeoutMs, maxBuffer })
        const rawCode = (error as { code?: unknown } | null)?.code
        resolve({
          stdout: String(stdout ?? ''),
          stderr: String(stderr ?? ''),
          code: !error ? 0 : typeof rawCode === 'number' ? rawCode : -1,
          ...(failure
            ? { error: failure.message, timedOut: failure.timedOut, overflow: failure.overflow }
            : {})
        })
      })
    } catch (err) {
      // Synchronous spawn failures (e.g. invalid options) never reach the callback.
      resolve({ stdout: '', stderr: '', code: -1, error: err instanceof Error ? err.message : String(err) })
    }
  })
}

/**
 * Start a command and forget it — for GUI apps (Shift+Enter). The child is
 * detached with no stdio so closing Something Commander doesn't kill it.
 */
export function runDetached(
  command: string,
  cwd: string,
  shellOverride?: string
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    try {
      const child = spawn(command, {
        cwd,
        shell: shellOverride || defaultShell(),
        detached: true,
        stdio: 'ignore',
        windowsHide: false
      })
      child.once('error', (err) => resolve({ success: false, error: err.message }))
      child.once('spawn', () => {
        child.unref()
        resolve({ success: true })
      })
    } catch (err) {
      resolve({ success: false, error: err instanceof Error ? err.message : String(err) })
    }
  })
}

export function registerCommandIPC(): void {
  ipcMain.handle(IPC_CHANNELS.RUN_COMMAND, (_event, command: string, cwd: string, shellOverride?: string) =>
    runCommand(command, cwd, shellOverride)
  )
  ipcMain.handle(IPC_CHANNELS.RUN_DETACHED, (_event, command: string, cwd: string, shellOverride?: string) =>
    runDetached(command, cwd, shellOverride)
  )
}
