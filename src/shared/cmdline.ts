/**
 * Pure helpers for the bottom command line: tokenizing, shell quoting,
 * `cd` resolution and history bookkeeping. No Electron, no DOM, no Node —
 * shared by the renderer and main and unit-tested in isolation.
 */

export type ShellKind = 'posix' | 'powershell' | 'cmd'
export type Platform = 'win32' | 'darwin' | 'linux' | string

/** Max entries kept in the persisted command history. */
export const HISTORY_CAP = 500

// ── Shell detection & quoting ─────────────────────────────────────────────

/** Classify a shell path/name (blank → the platform default). */
export function detectShellKind(shell: string | undefined, platform: Platform): ShellKind {
  const base = (shell || '').trim().replace(/^"|"$/g, '').split(/[\\/]/).pop()?.toLowerCase() || ''
  if (!base) return platform === 'win32' ? 'powershell' : 'posix'
  if (base.startsWith('pwsh') || base.startsWith('powershell')) return 'powershell'
  if (base === 'cmd' || base === 'cmd.exe') return 'cmd'
  return 'posix'
}

const POSIX_SAFE = /^[A-Za-z0-9_\-.,/:@%+=]+$/
const PWSH_SAFE = /^[A-Za-z0-9_\-.,/:\\]+$/
const CMD_SAFE = /^[A-Za-z0-9_\-.,/:\\@+=~]+$/

/**
 * Quote one argument so the given shell passes it through literally.
 * Plain names are returned untouched so pasted text stays readable.
 */
export function quoteArg(arg: string, kind: ShellKind): string {
  if (arg === '') return kind === 'cmd' ? '""' : "''"
  switch (kind) {
    case 'posix':
      if (POSIX_SAFE.test(arg)) return arg
      return `'${arg.replace(/'/g, `'\\''`)}'`
    case 'powershell':
      // Leading '-' would parse as an operator/parameter; quote it.
      if (PWSH_SAFE.test(arg) && !arg.startsWith('-')) return arg
      // Single-quoted strings are literal; ' doubles. PowerShell also treats
      // the typographic quotes ‘ ’ ‚ ‛ as single quotes, so double those too.
      return `'${arg.replace(/['\u2018\u2019\u201A\u201B]/g, '$&$&')}'`
    case 'cmd':
      if (CMD_SAFE.test(arg)) return arg
      // Windows file names can't contain ", so plain wrapping is enough.
      return `"${arg.replace(/"/g, '""')}"`
  }
}

// ── Tokenizer ──────────────────────────────────────────────────────────────

export interface TokenizeResult {
  tokens: string[]
  /** A quote was opened and never closed. */
  unterminated: boolean
  /**
   * The line uses shell syntax outside quotes (pipes, redirection, `;`, `&&`,
   * `$(…)`, backticks, globs, variables). Such lines always go to the shell.
   */
  hasShellSyntax: boolean
}

/**
 * Split a command line into words the way a user expects for built-ins.
 * Quotes ('…' literal, "…" with \" escapes in POSIX mode) group words.
 * Backslash escapes only on POSIX — on Windows it is the path separator.
 */
export function tokenize(line: string, opts: { windows?: boolean } = {}): TokenizeResult {
  const windows = !!opts.windows
  const tokens: string[] = []
  let cur = ''
  let inToken = false
  let quote: '"' | "'" | null = null
  let hasShellSyntax = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quote) {
      if (ch === quote) {
        quote = null
      } else if (ch === '\\' && quote === '"' && !windows && (line[i + 1] === '"' || line[i + 1] === '\\')) {
        cur += line[++i]
      } else {
        if (quote === '"' && !windows && (ch === '$' || ch === '`')) hasShellSyntax = true
        cur += ch
      }
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      inToken = true
      continue
    }
    if (ch === '\\' && !windows && i + 1 < line.length) {
      cur += line[++i]
      inToken = true
      continue
    }
    if (ch === ' ' || ch === '\t') {
      if (inToken) tokens.push(cur)
      cur = ''
      inToken = false
      continue
    }
    if ('|&;<>`'.includes(ch)) hasShellSyntax = true
    if (ch === '$' && !windows) hasShellSyntax = true
    if (ch === '%' && windows) hasShellSyntax = true
    if ((ch === '*' || ch === '?') && !windows) hasShellSyntax = true
    cur += ch
    inToken = true
  }
  if (inToken) tokens.push(cur)
  return { tokens, unterminated: quote !== null, hasShellSyntax }
}

// ── Command classification ────────────────────────────────────────────────

export type BuiltinName = 'cd' | 'mkdir' | 'j'

export type ParsedCommand =
  | { kind: 'empty' }
  /** `!cmd` — skip built-ins and file opening, run in the real shell. */
  | { kind: 'shell'; command: string; forced: boolean }
  | { kind: 'builtin'; name: BuiltinName; args: string[] }

const BUILTIN_ALIASES: Record<string, BuiltinName> = {
  cd: 'cd',
  chdir: 'cd',
  mkdir: 'mkdir',
  md: 'mkdir',
  j: 'j'
}

/**
 * Decide whether a line is a built-in (handled by the panel) or goes to the
 * shell. Anything with shell syntax, flags we don't implement, or the `!`
 * prefix is passed through untouched.
 */
export function parseCommandLine(line: string, platform: Platform): ParsedCommand {
  const trimmed = line.trim()
  if (!trimmed) return { kind: 'empty' }
  if (trimmed.startsWith('!')) {
    const rest = trimmed.slice(1).trim()
    return rest ? { kind: 'shell', command: rest, forced: true } : { kind: 'empty' }
  }
  const windows = platform === 'win32'

  // DOS shorthands: "cd..", "cd\", "cd/".
  const dos = /^(cd|chdir)(\.\.|[\\/])(.*)$/i.exec(trimmed)
  const normalized = dos ? `${dos[1]} ${dos[2]}${dos[3]}` : trimmed

  const { tokens, unterminated, hasShellSyntax } = tokenize(normalized, { windows })
  const pass: ParsedCommand = { kind: 'shell', command: trimmed, forced: false }
  if (tokens.length === 0 || unterminated || hasShellSyntax) return pass

  const name = BUILTIN_ALIASES[windows ? tokens[0].toLowerCase() : tokens[0]]
  if (!name) return pass
  let args = tokens.slice(1)

  if (name === 'cd') {
    // cmd's "cd /d D:\x" — the drive switch is implicit for us.
    if (windows) {
      args = args.filter((a) => a.toLowerCase() !== '/d')
      // cmd accepts unquoted spaces: "cd C:\Program Files".
      if (args.length > 1) args = [args.join(' ')]
    }
    if (args.length > 1 || args.some((a) => a.startsWith('-') && a !== '-')) return pass
    return { kind: 'builtin', name, args }
  }
  if (name === 'mkdir') {
    if (args.length !== 1 || args[0].startsWith('-')) return pass
    return { kind: 'builtin', name, args }
  }
  // j <bookmark…> — the rest of the line is the bookmark query.
  return { kind: 'builtin', name, args }
}

/** First word of a line, for history labels and "open this file" checks. */
export function singleWord(line: string, platform: Platform): string | null {
  const { tokens, unterminated, hasShellSyntax } = tokenize(line.trim(), { windows: platform === 'win32' })
  if (unterminated || hasShellSyntax || tokens.length !== 1) return null
  return tokens[0]
}

// ── Path resolution for cd ────────────────────────────────────────────────

function isWinAbsolute(p: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(p) || /^[\\/]{2}[^\\/]/.test(p)
}

/** Collapse ".", "..", and duplicate separators. Keeps the root intact. */
export function normalizePath(p: string, windows: boolean): string {
  if (windows) {
    const s = p.replace(/\//g, '\\')
    let root = ''
    let rest = s
    const drive = /^([A-Za-z]):\\?/.exec(s)
    const unc = /^\\\\([^\\]+)\\([^\\]+)\\?/.exec(s)
    if (unc) {
      root = `\\\\${unc[1]}\\${unc[2]}\\`
      rest = s.slice(unc[0].length)
    } else if (drive) {
      root = `${drive[1].toUpperCase()}:\\`
      rest = s.slice(drive[0].length)
    } else if (s.startsWith('\\')) {
      root = '\\'
      rest = s.slice(1)
    }
    const parts: string[] = []
    for (const seg of rest.split('\\')) {
      if (!seg || seg === '.') continue
      if (seg === '..') parts.pop()
      else parts.push(seg)
    }
    return root + parts.join('\\')
  }
  const abs = p.startsWith('/')
  const parts: string[] = []
  for (const seg of p.split('/')) {
    if (!seg || seg === '.') continue
    if (seg === '..') {
      if (parts.length && parts[parts.length - 1] !== '..') parts.pop()
      else if (!abs) parts.push('..')
    } else parts.push(seg)
  }
  const joined = parts.join('/')
  return abs ? `/${joined}` : joined || '.'
}

export interface LocalCdContext {
  platform: Platform
  /** Current panel directory; null when the panel shows the drive/home root list. */
  cwd: string | null
  home: string
  /** Directory before the last change, for `cd -`. */
  previous: string | null
}

export type CdResolution = { ok: true; path: string } | { ok: false; error: string }

/** Resolve a `cd` argument against a local directory. */
export function resolveLocalCd(arg: string | undefined, ctx: LocalCdContext): CdResolution {
  const windows = ctx.platform === 'win32'
  const sep = windows ? '\\' : '/'
  const a = (arg ?? '').trim()

  if (a === '' || a === '~') return { ok: true, path: normalizePath(ctx.home, windows) }
  if (a === '-') {
    return ctx.previous ? { ok: true, path: ctx.previous } : { ok: false, error: 'cd: no previous directory' }
  }
  if (a.startsWith('~/') || (windows && a.startsWith('~\\'))) {
    return { ok: true, path: normalizePath(ctx.home + sep + a.slice(2), windows) }
  }

  if (windows) {
    // "D:" (drive only) → that drive's root.
    if (/^[A-Za-z]:$/.test(a)) return { ok: true, path: `${a[0].toUpperCase()}:\\` }
    if (isWinAbsolute(a)) return { ok: true, path: normalizePath(a, true) }
    // "D:foo" — drive-relative; we have no per-drive cwd, so treat as root-relative.
    if (/^[A-Za-z]:[^\\/]/.test(a)) return { ok: true, path: normalizePath(`${a.slice(0, 2)}\\${a.slice(2)}`, true) }
    if (a.startsWith('\\') || a.startsWith('/')) {
      const drive = ctx.cwd && /^[A-Za-z]:/.exec(ctx.cwd)
      if (!drive) return { ok: false, error: 'cd: no current drive' }
      return { ok: true, path: normalizePath(drive[0] + a, true) }
    }
  } else if (a.startsWith('/')) {
    return { ok: true, path: normalizePath(a, false) }
  }

  if (!ctx.cwd) return { ok: false, error: 'cd: relative path needs a current directory' }
  return { ok: true, path: normalizePath(ctx.cwd + sep + a, windows) }
}

/**
 * Location id styles for plugins whose ids are "<prefix>::<inner path>":
 * - 'absolute': SFTP — inner is "/a/b" (root "/"), no trailing slash.
 * - 'prefix':   S3 and archives — inner is "a/b/" (root ""), trailing slash.
 */
export type InnerStyle = 'absolute' | 'prefix'

export function innerStyleFor(pluginId: string): { style: InnerStyle; lastSep: boolean } | null {
  if (pluginId === 'sftp') return { style: 'absolute', lastSep: false }
  if (pluginId === 's3') return { style: 'prefix', lastSep: false }
  if (pluginId === 'archive') return { style: 'prefix', lastSep: true }
  return null
}

/** Resolve a `cd` argument inside a "<prefix>::<inner>" location id. */
export function resolveInnerCd(
  arg: string,
  locationId: string,
  style: InnerStyle,
  lastSep = false
): CdResolution {
  const at = lastSep ? locationId.lastIndexOf('::') : locationId.indexOf('::')
  if (at < 0) return { ok: false, error: 'cd: unsupported location' }
  const prefix = locationId.slice(0, at)
  const inner = locationId.slice(at + 2)
  const a = arg.trim().replace(/\\/g, '/')
  if (a === '' || a === '~' || a.startsWith('~/')) return { ok: false, error: 'cd: no home directory here' }

  const current = style === 'absolute' ? inner || '/' : `/${inner}`
  const target = normalizePath(a.startsWith('/') ? a : `${current}/${a}`, false)
  if (style === 'absolute') return { ok: true, path: `${prefix}::${target}` }
  const rel = target.replace(/^\/+/, '')
  return { ok: true, path: `${prefix}::${rel ? `${rel}/` : ''}` }
}

// ── Misc ───────────────────────────────────────────────────────────────────

/** True when commands can execute in this panel location (a real local dir). */
export function isLocalDirectory(pluginId: string, locationId: string | null): boolean {
  return pluginId === 'local-filesystem' && !!locationId
}

/** Add a command to the front of history: de-duplicated and capped. */
export function pushHistory(history: readonly string[], cmd: string, cap = HISTORY_CAP): string[] {
  const c = cmd.trim()
  if (!c) return [...history]
  return [c, ...history.filter((h) => h !== c)].slice(0, cap)
}

/**
 * Insert text at the caret the way Total Commander pastes names: pad with a
 * space on either side unless the neighbour is already whitespace.
 */
export function insertWithSpacing(
  value: string,
  selStart: number,
  selEnd: number,
  text: string
): { value: string; caret: number } {
  const before = value.slice(0, selStart)
  const after = value.slice(selEnd)
  const lead = before && !/\s$/.test(before) ? ' ' : ''
  const trail = after && /^\s/.test(after) ? '' : ' '
  const next = before + lead + text + trail + after
  return { value: next, caret: (before + lead + text + trail).length }
}

/** Case-insensitive bookmark lookup: exact name, then prefix, then substring. */
export function matchBookmark<T extends { name: string }>(bookmarks: readonly T[], query: string): T | null {
  const q = query.trim().toLowerCase()
  if (!q) return null
  return (
    bookmarks.find((b) => b.name.toLowerCase() === q) ||
    bookmarks.find((b) => b.name.toLowerCase().startsWith(q)) ||
    bookmarks.find((b) => b.name.toLowerCase().includes(q)) ||
    null
  )
}
