import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

vi.mock('electron', () => ({ app: { on: vi.fn() }, ipcMain: { handle: vi.fn() } }))
const { completePath, runDetached } = await import('../main/ipc/command-ipc')

let dir: string
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sccomp-'))
  fs.mkdirSync(path.join(dir, 'src'))
  fs.mkdirSync(path.join(dir, 'scripts'))
  fs.writeFileSync(path.join(dir, 'setup.py'), '')
  fs.writeFileSync(path.join(dir, '.secret'), '')
  fs.writeFileSync(path.join(dir, 'src', 'main.ts'), '')
})
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

describe('completePath', () => {
  it('lists prefix matches with folder flags, sorted', async () => {
    expect(await completePath(dir, '', 's')).toEqual([
      { name: 'scripts', isDir: true },
      { name: 'setup.py', isDir: false },
      { name: 'src', isDir: true }
    ])
  })
  it('descends into the typed directory', async () => {
    expect(await completePath(dir, 'src/', 'm')).toEqual([{ name: 'main.ts', isDir: false }])
  })
  it('hides dotfiles unless asked', async () => {
    expect((await completePath(dir, '', '')).map((c) => c.name)).not.toContain('.secret')
    expect(await completePath(dir, '', '.s')).toEqual([{ name: '.secret', isDir: false }])
  })
  it('missing directory → empty', async () => {
    expect(await completePath(dir, 'nope/', '')).toEqual([])
  })
})

describe.skipIf(process.platform === 'win32')('runDetached', () => {
  it('starts and returns immediately; reports bad cwd', async () => {
    const t0 = Date.now()
    expect(await runDetached('sleep 2', dir, '/bin/sh')).toEqual({ success: true })
    expect(Date.now() - t0).toBeLessThan(1500)
    expect((await runDetached('true', '/definitely/not/here', '/bin/sh')).success).toBe(false)
  })
})
