import * as fs from 'fs'
import * as path from 'path'
import { path7za } from '7zip-bin'

function sevenZRelativeBinary(): string {
  if (process.platform === 'darwin') {
    return path.join('mac', process.arch, '7za')
  }
  if (process.platform === 'win32') {
    return path.join('win', process.arch, '7za.exe')
  }
  return path.join('linux', process.arch, '7za')
}

function isInsideAsar(filePath: string): boolean {
  return filePath.includes(`${path.sep}app.asar${path.sep}`) || filePath.endsWith(`${path.sep}app.asar`)
}

function tryBinary(candidate: string, seen: Set<string>): string | null {
  const normalized = path.normalize(candidate)
  if (seen.has(normalized) || isInsideAsar(normalized)) return null
  seen.add(normalized)
  try {
    const stat = fs.statSync(normalized)
    if (stat.isFile()) return normalized
  } catch {
    /* try next candidate */
  }
  return null
}

function unpackedRoot(): string | null {
  if (!process.resourcesPath) return null
  return path.join(process.resourcesPath, 'app.asar.unpacked')
}

/** Resolve a runnable 7za binary path for dev, test, and packaged Electron builds. */
export function resolve7zaBinaryPath(): string {
  const rel = sevenZRelativeBinary()
  const seen = new Set<string>()
  const candidates: string[] = []

  const unpacked = unpackedRoot()
  if (unpacked) {
    candidates.push(
      path.join(unpacked, 'node_modules/7zip-bin', rel),
      path.join(unpacked, 'node_modules/7zip-min/node_modules/7zip-bin', rel)
    )
  }

  try {
    const sevenZMinRoot = path.dirname(require.resolve('7zip-min/package.json'))
    candidates.push(path.join(sevenZMinRoot, 'node_modules/7zip-bin', rel))
  } catch {
    /* optional in some test environments */
  }

  try {
    const binRoot = path.dirname(require.resolve('7zip-bin/package.json'))
    candidates.push(path.join(binRoot, rel))
  } catch {
    /* optional */
  }

  candidates.push(path7za)

  for (const candidate of candidates) {
    const resolved = tryBinary(candidate, seen)
    if (resolved) return resolved
  }

  return process.platform === 'win32' ? '7za.exe' : '7za'
}

export function ensure7zaExecutable(binaryPath: string): void {
  if (!path.isAbsolute(binaryPath)) return
  try {
    fs.chmodSync(binaryPath, 0o755)
  } catch {
    /* best effort */
  }
}