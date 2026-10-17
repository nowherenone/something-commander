/**
 * Which shell runs command-line commands, with which environment, and what
 * is on PATH. No Electron imports — unit-tested directly.
 *
 * - macOS/Linux: the user's $SHELL (fallback /bin/zsh on macOS, /bin/bash elsewhere).
 * - macOS: GUI apps don't inherit the login shell's PATH, so the login
 *   environment is captured once at startup (`$SHELL -ilc env`, with a
 *   timeout) and cached; on failure we fall back to process.env.
 * - Windows: pwsh when on PATH, else Windows PowerShell; output forced to UTF-8.
 * - Settings ▸ Behavior ▸ Shell overrides all of the above when non-blank.
 */
import { execFile } from 'child_process'
import * as fs from 'fs/promises'
import * as path from 'path'
import { detectShellKind, type ShellKind } from '@shared/cmdline'

export type Env = Record<string, string | undefined>

// ── Pure helpers ───────────────────────────────────────────────────────────

const ENV_START = '__SC_ENV_START__'
const ENV_END = '__SC_ENV_END__'

/** Parse `env` output between our markers; null if the markers are missing. */
export function parseEnvOutput(out: string): Record<string, string> | null {
  const a = out.indexOf(ENV_START)
  const b = out.indexOf(ENV_END, a + ENV_START.length)
  if (a < 0 || b < 0) return null
  const body = out.slice(a + ENV_START.length, b)
  const env: Record<string, string> = {}
  let lastKey: string | null = null
  for (const line of body.split('\n')) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line)
    if (m) {
      env[m[1]] = m[2]
      lastKey = m[1]
    } else if (lastKey && line !== '') {
      // Continuation of a multi-line value.
      env[lastKey] += `\n${line}`
    }
  }
  return Object.keys(env).length > 0 ? env : null
}

/** The probe script: markers around `env` so rc-file noise is ignored. */
export function envProbeArgs(): string[] {
  return ['-ilc', `printf '%s\\n' '${ENV_START}'; env; printf '%s\\n' '${ENV_END}'`]
}

export function pickDefaultShell(platform: NodeJS.Platform, env: Env, hasPwsh: boolean): string {
  if (platform === 'win32') return hasPwsh ? 'pwsh.exe' : 'powershell.exe'
  const sh = env.SHELL?.trim()
  if (sh) return sh
  return platform === 'darwin' ? '/bin/zsh' : '/bin/bash'
}

/** UTF-16LE base64, the encoding -EncodedCommand expects. */
export function encodePowerShell(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64')
}

export interface ShellInvocation {
  file: string
  args: string[]
  /** Pass args to CreateProcess verbatim (cmd.exe /s /c "…"). */
  windowsVerbatimArguments?: boolean
}

/**
 * How to run one command line through `shell`. PowerShell gets the command
 * via -EncodedCommand (no quoting pitfalls) with UTF-8 console output; cmd
 * switches its code page to 65001 first.
 */
export function buildShellInvocation(shell: string, command: string, platform: NodeJS.Platform): ShellInvocation {
  const kind = detectShellKind(shell, platform)
  if (kind === 'powershell') {
    const script =
      '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); ' +
      '$OutputEncoding = [Console]::OutputEncoding; ' +
      command
    return { file: shell, args: ['-NoLogo', '-NonInteractive', '-EncodedCommand', encodePowerShell(script)] }
  }
  if (kind === 'cmd') {
    return { file: shell, args: ['/d', '/s', '/c', `"chcp 65001>nul & ${command}"`], windowsVerbatimArguments: true }
  }
  return { file: shell, args: ['-c', command] }
}

/** Executable extensions on Windows, lower-case with the dot. */
export function pathExts(env: Env): string[] {
  return (env.PATHEXT || '.COM;.EXE;.BAT;.CMD')
    .split(';')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

export function pathDirs(env: Env, platform: NodeJS.Platform): string[] {
  const raw = env.PATH ?? env.Path ?? ''
  const sep = platform === 'win32' ? ';' : ':'
  return [...new Set(raw.split(sep).map((d) => d.trim()).filter(Boolean))]
}

/** Command name for a PATH entry, or null when it isn't runnable. */
export function commandNameFor(file: string, platform: NodeJS.Platform, exts: string[], mode: number): string | null {
  if (platform === 'win32') {
    const dot = file.lastIndexOf('.')
    if (dot <= 0) return null
    const ext = file.slice(dot).toLowerCase()
    return exts.includes(ext) ? file.slice(0, dot) : null
  }
  return (mode & 0o111) !== 0 ? file : null
}

// ── Effectful, cached ─────────────────────────────────────────────────────

let loginEnv: Promise<Env> | null = null

/** Capture the macOS login-shell environment once (other platforms: process.env). */
export function captureLoginEnv(timeoutMs = 5000): Promise<Env> {
  if (loginEnv) return loginEnv
  if (process.platform !== 'darwin') {
    loginEnv = Promise.resolve({ ...process.env })
    return loginEnv
  }
  const shell = pickDefaultShell('darwin', process.env, false)
  loginEnv = new Promise<Env>((resolve) => {
    try {
      execFile(
        shell,
        envProbeArgs(),
        { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, SC_ENV_PROBE: '1' } },
        (err, stdout) => {
          const parsed = parseEnvOutput(String(stdout ?? ''))
          if (!parsed) {
            if (err) console.warn('[shell-env] login env capture failed:', err.message)
            resolve({ ...process.env })
            return
          }
          delete parsed.SC_ENV_PROBE
          // Login env wins for PATH & friends; keep Electron-set vars it lacks.
          resolve({ ...process.env, ...parsed })
        }
      )
    } catch (err) {
      console.warn('[shell-env] login env capture failed:', err)
      resolve({ ...process.env })
    }
  })
  return loginEnv
}

/**
 * Environment for command-line children: the login env, plus "never prompt"
 * hints since stdin is closed. Colors are not forced (FORCE_COLOR /
 * CLICOLOR_FORCE would leak escapes into the user's own pipes); tools that
 * emit ANSI anyway, or `--color=always`, render in the output pane.
 */
export async function commandEnv(): Promise<Env> {
  const base = await captureLoginEnv()
  return { ...base, GIT_TERMINAL_PROMPT: '0' }
}

/** First match for `name` on PATH (PATHEXT-aware on Windows). */
export async function findOnPath(name: string, env: Env, platform: NodeJS.Platform = process.platform): Promise<string | null> {
  const exts = platform === 'win32' ? ['', ...pathExts(env)] : ['']
  for (const dir of pathDirs(env, platform)) {
    for (const ext of exts) {
      const candidate = path.join(dir, name + ext)
      try {
        const st = await fs.stat(candidate)
        if (st.isFile() && (platform === 'win32' || (st.mode & 0o111) !== 0)) return candidate
      } catch {
        /* not here */
      }
    }
  }
  return null
}

let defaultShell: Promise<string> | null = null

/** The shell to use: the override if set, else the platform default (cached). */
export async function resolveShell(override?: string): Promise<string> {
  const o = override?.trim()
  if (o) return o
  if (!defaultShell) {
    defaultShell = (async () => {
      const env = await captureLoginEnv()
      const hasPwsh = process.platform === 'win32' && !!(await findOnPath('pwsh', env))
      return pickDefaultShell(process.platform, env, hasPwsh)
    })()
  }
  return defaultShell
}

export async function shellInfo(override?: string): Promise<{ shell: string; kind: ShellKind }> {
  const shell = await resolveShell(override)
  return { shell, kind: detectShellKind(shell, process.platform) }
}

let pathCommands: Promise<string[]> | null = null

/** Every runnable command name on PATH, scanned once and cached. */
export function listPathCommands(): Promise<string[]> {
  if (pathCommands) return pathCommands
  pathCommands = (async () => {
    const env = await captureLoginEnv()
    const platform = process.platform
    const exts = pathExts(env)
    const names = new Set<string>()
    for (const dir of pathDirs(env, platform)) {
      let dirents: import('fs').Dirent[]
      try {
        dirents = await fs.readdir(dir, { withFileTypes: true })
      } catch {
        continue
      }
      await Promise.all(
        dirents.map(async (d) => {
          if (d.isDirectory()) return
          let mode = 0o755
          if (platform !== 'win32') {
            try {
              const st = await fs.stat(path.join(dir, d.name))
              if (!st.isFile()) return
              mode = st.mode
            } catch {
              return
            }
          }
          const n = commandNameFor(d.name, platform, exts, mode)
          if (n) names.add(n)
        })
      )
    }
    return [...names].sort((a, b) => a.localeCompare(b))
  })()
  return pathCommands
}

/** For tests only. */
export function _resetShellEnvCache(): void {
  loginEnv = null
  defaultShell = null
  pathCommands = null
}
