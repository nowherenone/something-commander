import { app, ipcMain } from 'electron'
import { spawn } from 'child_process'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { IPC_CHANNELS } from '@shared/types/ipc-channels'
import { CommandRunner, type StartOptions } from '../command-runner'
import type { CmdPathCompletion } from '@shared/types/cmdline'
import { buildShellInvocation, captureLoginEnv, commandEnv, listPathCommands, resolveShell, shellInfo } from '../shell-env'

export const runner = new CommandRunner()

/**
 * Start a command and forget it — for GUI apps (Shift+Enter). The child is
 * detached with no stdio so closing Something Commander doesn't kill it.
 */
export async function runDetached(
  command: string,
  cwd: string,
  shellOverride?: string
): Promise<{ success: boolean; error?: string }> {
  const shell = await resolveShell(shellOverride)
  const env = await commandEnv()
  const inv = buildShellInvocation(shell, command, process.platform)
  return new Promise((resolve) => {
    try {
      const child = spawn(inv.file, inv.args, {
        cwd,
        env: env as NodeJS.ProcessEnv,
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
        windowsVerbatimArguments: inv.windowsVerbatimArguments
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

export type PathCompletion = CmdPathCompletion

/**
 * Entries in `dir` (relative to cwd; "~" expands) whose names start with
 * `base`. Dotfiles only when the base starts with "."; capped at `limit`.
 */
export async function completePath(cwd: string, dirPart: string, base: string, limit = 200): Promise<PathCompletion[]> {
  let dir = dirPart || '.'
  if (dir === '~' || dir.startsWith('~/') || dir.startsWith('~\\')) dir = path.join(os.homedir(), dir.slice(1))
  const abs = path.resolve(cwd, dir)
  const fold = process.platform === 'win32' || process.platform === 'darwin'
  const b = fold ? base.toLowerCase() : base
  let dirents: import('fs').Dirent[]
  try {
    dirents = await fs.readdir(abs, { withFileTypes: true })
  } catch {
    return []
  }
  const out: PathCompletion[] = []
  for (const d of dirents) {
    const n = fold ? d.name.toLowerCase() : d.name
    if (!n.startsWith(b)) continue
    if (d.name.startsWith('.') && !base.startsWith('.')) continue
    let isDir = d.isDirectory()
    if (d.isSymbolicLink()) {
      try {
        isDir = (await fs.stat(path.join(abs, d.name))).isDirectory()
      } catch {
        /* dangling link */
      }
    }
    out.push({ name: d.name, isDir })
  }
  out.sort((x, y) => x.name.localeCompare(y.name))
  return out.slice(0, limit)
}

export function registerCommandIPC(): void {
  // Warm the caches: macOS login env, default shell, PATH command list.
  void captureLoginEnv().then(() => resolveShell()).then(() => listPathCommands())

  ipcMain.handle(IPC_CHANNELS.CMD_START, async (event, runId: string, opts: StartOptions) => {
    const sender = event.sender
    try {
      return await runner.start(runId, opts, (ev) => {
        if (sender.isDestroyed()) return
        sender.send(ev.type === 'data' ? IPC_CHANNELS.CMD_DATA : IPC_CHANNELS.CMD_EXIT, ev)
      })
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
  })
  ipcMain.handle(IPC_CHANNELS.CMD_STOP, (_event, runId: string) => runner.stop(runId))
  ipcMain.handle(IPC_CHANNELS.RUN_DETACHED, (_event, command: string, cwd: string, shellOverride?: string) =>
    runDetached(command, cwd, shellOverride)
  )
  ipcMain.handle(IPC_CHANNELS.CMD_COMPLETE_PATH, (_event, cwd: string, dirPart: string, base: string) =>
    completePath(cwd, dirPart, base)
  )
  ipcMain.handle(IPC_CHANNELS.CMD_LIST_COMMANDS, () => listPathCommands())
  ipcMain.handle(IPC_CHANNELS.CMD_SHELL_INFO, (_event, override?: string) => shellInfo(override))

  // Don't leave process groups running after the window is gone.
  app.on('will-quit', () => runner.stopAll())
}
