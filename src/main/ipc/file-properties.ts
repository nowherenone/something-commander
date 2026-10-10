import { execFile, spawn } from 'child_process'
import { pathToFileURL } from 'url'

/**
 * Open the OS-native properties window for a local file or folder.
 *
 * - Windows: Shell.Application InvokeVerb('properties'). The property sheet
 *   lives in the calling process, so the PowerShell host stays alive (hidden,
 *   detached) until no visible window of its own remains (30 min cap).
 * - macOS: Finder "Get Info" window via osascript, then Finder is activated.
 * - Linux: org.freedesktop.FileManager1.ShowItemProperties over DBus
 *   (Nautilus, Dolphin, Nemo, …), falling back to revealing the item in the
 *   file manager when no implementation answers.
 *
 * Command builders are exported pure functions so they can be unit-tested
 * without spawning anything.
 */

export type PropertiesResult = { success: boolean; error?: string; fallback?: 'showItemInFolder' }

/** Env var carrying the path into PowerShell — never interpolated into script text. */
export const WIN_PATH_ENV = 'SC_PROPERTIES_PATH'

export const WINDOWS_PROPERTIES_SCRIPT = [
  '$ErrorActionPreference = "Stop"',
  `$p = $env:${WIN_PATH_ENV}`,
  '$item = Get-Item -LiteralPath $p -Force',
  '$dir = if ($item.PSIsContainer) { $item.Parent.FullName } else { $item.DirectoryName }',
  '$shell = New-Object -ComObject Shell.Application',
  // Drive roots (C:\) have no parent: open from "This PC" (ssfDRIVES = 17).
  '$folder = if ($dir) { $shell.Namespace($dir) } else { $shell.Namespace(17) }',
  '$name = if ($dir) { $item.Name } else { $item.FullName }',
  '$fi = $folder.ParseName($name)',
  'if (-not $fi) { throw "Item not found: $p" }',
  '$fi.InvokeVerb("properties")',
  'Add-Type -Namespace SC -Name W -MemberDefinition @"',
  '[DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, System.IntPtr l);',
  '[DllImport("user32.dll")] public static extern bool IsWindowVisible(System.IntPtr h);',
  '[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(System.IntPtr h, out uint pid);',
  'public delegate bool EnumProc(System.IntPtr h, System.IntPtr l);',
  'public static bool HasVisibleWindow(uint me) {',
  '  bool found = false;',
  '  EnumWindows((h, l) => { uint pid; GetWindowThreadProcessId(h, out pid);',
  '    if (pid == me && IsWindowVisible(h)) { found = true; return false; } return true; }, System.IntPtr.Zero);',
  '  return found;',
  '}',
  '"@',
  // Grace period for the sheet to appear, then wait while it is open.
  'Start-Sleep -Seconds 3',
  '$deadline = (Get-Date).AddMinutes(30)',
  'while ([SC.W]::HasVisibleWindow([uint32]$PID) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }'
].join('\n')

export function buildWindowsCommand(filePath: string): {
  cmd: string
  args: string[]
  env: Record<string, string>
} {
  const encoded = Buffer.from(WINDOWS_PROPERTIES_SCRIPT, 'utf16le').toString('base64')
  return {
    cmd: 'powershell.exe',
    args: ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded],
    env: { [WIN_PATH_ENV]: filePath }
  }
}

/** Path is passed as argv — no AppleScript string escaping involved. */
export function buildMacCommand(filePath: string): { cmd: string; args: string[] } {
  return {
    cmd: 'osascript',
    args: [
      '-e', 'on run argv',
      '-e', 'tell application "Finder"',
      '-e', 'open information window of (POSIX file (item 1 of argv) as alias)',
      '-e', 'activate',
      '-e', 'end tell',
      '-e', 'end run',
      filePath
    ]
  }
}

export function fileUri(filePath: string): string {
  return pathToFileURL(filePath).href
}

/** DBus FileManager1.ShowItemProperties candidates, tried in order. */
export function buildLinuxDbusCommands(filePath: string): Array<{ cmd: string; args: string[] }> {
  const uri = fileUri(filePath)
  return [
    {
      cmd: 'gdbus',
      args: [
        'call', '--session',
        '--dest', 'org.freedesktop.FileManager1',
        '--object-path', '/org/freedesktop/FileManager1',
        '--method', 'org.freedesktop.FileManager1.ShowItemProperties',
        // GVariant text: string array + empty startup id. pathToFileURL
        // percent-encodes `"`, so the literal is safe.
        `[${JSON.stringify(uri)}]`,
        "''"
      ]
    },
    {
      cmd: 'dbus-send',
      args: [
        '--session', '--print-reply',
        '--dest=org.freedesktop.FileManager1',
        '/org/freedesktop/FileManager1',
        'org.freedesktop.FileManager1.ShowItemProperties',
        `array:string:${uri}`,
        'string:'
      ]
    }
  ]
}

export type Runner = (cmd: string, args: string[], timeout?: number) => Promise<{ ok: boolean; error?: string }>

const run: Runner = (cmd, args, timeout = 10000) => {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout }, (err, _stdout, stderr) => {
      if (err) resolve({ ok: false, error: (stderr && String(stderr).trim()) || err.message })
      else resolve({ ok: true })
    })
  })
}

export async function openWindowsProperties(filePath: string): Promise<PropertiesResult> {
  const { cmd, args, env } = buildWindowsCommand(filePath)
  return new Promise((resolve) => {
    try {
      const child = spawn(cmd, args, {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        env: { ...process.env, ...env }
      })
      let settled = false
      const done = (r: PropertiesResult): void => {
        if (!settled) { settled = true; resolve(r) }
      }
      child.on('error', (err) => done({ success: false, error: err.message }))
      // A failing script exits fast with a non-zero code; a working one stays
      // alive holding the dialog. Report success once it survives briefly.
      child.on('exit', (code) => {
        done(code === 0 ? { success: true } : { success: false, error: `PowerShell exited with code ${code}` })
      })
      setTimeout(() => done({ success: true }), 2500)
      child.unref()
    } catch (err) {
      resolve({ success: false, error: String(err) })
    }
  })
}

export async function openMacProperties(filePath: string, runner: Runner = run): Promise<PropertiesResult> {
  const { cmd, args } = buildMacCommand(filePath)
  const r = await runner(cmd, args)
  return r.ok ? { success: true } : { success: false, error: r.error }
}

export async function openLinuxProperties(
  filePath: string,
  revealInFolder: (p: string) => void,
  runner: Runner = run
): Promise<PropertiesResult> {
  for (const { cmd, args } of buildLinuxDbusCommands(filePath)) {
    const r = await runner(cmd, args, 5000)
    if (r.ok) return { success: true }
  }
  try {
    revealInFolder(filePath)
    return { success: true, fallback: 'showItemInFolder' }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}
