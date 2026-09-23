/**
 * Whether a regular file should be drawn as an executable.
 *
 * Unix: any execute bit (owner, group, or other). Directories are executable
 * in the permission sense and are not highlighted.
 * Windows: Node does not set the Unix execute bit, so the marker is the
 * extension the shell will run, plus shortcut files the shell opens
 * (lnk, url, pif, scf, appref-ms, website).
 */
const WINDOWS_EXECUTABLE_EXTS = new Set([
  'exe',
  'bat',
  'cmd',
  'com',
  'msi',
  'scr',
  'ps1',
  'lnk',
  'url',
  'pif',
  'scf',
  'appref-ms',
  'website'
])

export function isExecutableFile(platform: NodeJS.Platform, name: string, mode: number): boolean {
  if (platform === 'win32') {
    const dot = name.lastIndexOf('.')
    const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
    return WINDOWS_EXECUTABLE_EXTS.has(ext)
  }
  return (mode & 0o111) !== 0
}
