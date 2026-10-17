import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

/**
 * Command line: Enter must not also activate the panel's cursor row, focus
 * stays in the input across a run, typing in the panel starts a command,
 * Ctrl+Enter pastes the cursor name, `cd` drives the panel, and history
 * survives a restart. Each run uses a throwaway HOME/userData.
 */

const ROOT = path.resolve(__dirname, '..')
let tmp: string
let work: string

async function launch(): Promise<{ app: ElectronApplication; win: Page }> {
  const home = path.join(tmp, 'home')
  const app = await electron.launch({
    args: [ROOT, '--no-sandbox'],
    cwd: ROOT,
    env: { ...process.env, HOME: home, XDG_CONFIG_HOME: path.join(home, '.config'), ELECTRON_ENABLE_LOGGING: '0' }
  })
  const win = await app.firstWindow()
  await win.waitForLoadState('domcontentloaded')
  await win.locator('[data-cmdline-input]').waitFor({ timeout: 15000 })
  return { app, win }
}

const input = (win: Page) => win.locator('[data-cmdline-input]')
const prompt = (win: Page) => win.locator('[class*="prompt"]').first()
const activeIsCmdline = (win: Page) =>
  win.evaluate(() => document.activeElement?.hasAttribute('data-cmdline-input') ?? false)

async function goTo(win: Page, dir: string): Promise<void> {
  // Escape out of the command line first so Ctrl+L reaches the panel.
  await win.locator('[data-file-list="left"]').click({ position: { x: 60, y: 10 } })
  await win.keyboard.press('Control+l')
  await win.keyboard.press('Control+a')
  await win.keyboard.type(dir)
  await win.keyboard.press('Enter')
  await expect(prompt(win)).toContainText(path.basename(dir))
}

/** Focus the left file list and put the cursor on the first real entry (row 1, below ".."). */
async function cursorOnFirstEntry(win: Page): Promise<void> {
  await win.locator('[data-file-list="left"]').click({ position: { x: 60, y: 10 } })
  await win.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await win.keyboard.press('Home')
  await win.keyboard.press('ArrowDown')
}

test.beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sce2e-'))
  work = path.join(tmp, 'work')
  fs.mkdirSync(path.join(work, 'aaa-dir'), { recursive: true })
  fs.writeFileSync(path.join(work, 'my file.txt'), 'hello\n')
  fs.mkdirSync(path.join(tmp, 'home', '.config'), { recursive: true })
})

test.afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

test('command line: Enter, focus, type-to-cmdline, paste, cd, history', async () => {
  let { app, win } = await launch()
  try {
    // Visible by default for a fresh profile.
    await expect(input(win)).toBeVisible()
    await goTo(win, work)

    // ── Enter runs the command and does NOT activate the cursor row ──
    await cursorOnFirstEntry(win) // cursor on "aaa-dir"
    await input(win).click()
    await input(win).fill('echo e2e-hello')
    await input(win).press('Enter')
    await expect(win.getByTestId('cmdline-output')).toContainText('e2e-hello')
    await expect(prompt(win)).not.toContainText('aaa-dir')
    await expect(prompt(win)).toContainText('work')
    expect(await activeIsCmdline(win)).toBe(true)
    await expect(input(win)).toHaveValue('')

    // Empty Enter is a no-op (no descend either).
    await input(win).press('Enter')
    await win.waitForTimeout(300)
    await expect(prompt(win)).not.toContainText('aaa-dir')

    // Failures surface: non-zero exit shows a status line, old output is cleared.
    await input(win).fill('echo bad >&2; exit 4')
    await input(win).press('Enter')
    await expect(win.getByTestId('cmdline-output')).toContainText('Exited with code 4')
    await expect(win.getByTestId('cmdline-output')).not.toContainText('e2e-hello')

    // ── Type-to-command-line from the panel ──
    await input(win).press('Escape') // close output
    await cursorOnFirstEntry(win)
    expect(await activeIsCmdline(win)).toBe(false)
    await win.keyboard.type('ls')
    await expect(input(win)).toHaveValue('ls')
    expect(await activeIsCmdline(win)).toBe(true)
    await input(win).fill('')

    // ── Ctrl+Enter in the panel pastes the quoted cursor name (no rename) ──
    await cursorOnFirstEntry(win)
    await win.keyboard.press('ArrowDown') // "my file.txt"
    await win.keyboard.press('Control+Enter')
    await expect(input(win)).toHaveValue("'my file.txt' ")
    await expect(win.locator('.inline-rename-input')).toHaveCount(0)
    await input(win).fill('')

    // ── cd built-in navigates the panel; cd - comes back ──
    await input(win).fill('cd aaa-dir')
    await input(win).press('Enter')
    await expect(prompt(win)).toContainText('aaa-dir')
    await input(win).fill('cd -')
    await input(win).press('Enter')
    await expect(prompt(win)).not.toContainText('aaa-dir')
    await expect(prompt(win)).toContainText('work')

    // ── History dropdown ──
    await input(win).press('Control+ArrowDown')
    await expect(win.getByRole('listbox', { name: 'Command history' })).toBeVisible()
    await input(win).press('Escape')
    await expect(win.getByRole('listbox', { name: 'Command history' })).toHaveCount(0)
  } finally {
    await app.close()
  }

  // ── History survives a restart ──
  ;({ app, win } = await launch())
  try {
    await input(win).click()
    await input(win).press('ArrowUp')
    await expect(input(win)).toHaveValue('cd -')
    await input(win).press('ArrowUp')
    await expect(input(win)).toHaveValue('cd aaa-dir')
  } finally {
    await app.close()
  }
})

test('command line: mkdir built-in, ! prefix, Shift+Enter detached', async () => {
  const { app, win } = await launch()
  try {
    await goTo(win, work)

    await input(win).click()
    await input(win).fill('mkdir "new folder"')
    await input(win).press('Enter')
    await expect.poll(() => fs.existsSync(path.join(work, 'new folder'))).toBe(true)
    await expect(win.locator('[data-file-list="left"]')).toContainText('new folder')

    // `!` skips the built-in: a shell `cd` can't move the panel.
    await input(win).fill('!cd aaa-dir')
    await input(win).press('Enter')
    await win.waitForTimeout(500)
    await expect(prompt(win)).not.toContainText('aaa-dir')

    // Shift+Enter starts detached and returns at once.
    await input(win).fill('sleep 0.2; touch detached.txt')
    await input(win).press('Shift+Enter')
    await expect.poll(() => fs.existsSync(path.join(work, 'detached.txt')), { timeout: 5000 }).toBe(true)
    expect(await activeIsCmdline(win)).toBe(true)
  } finally {
    await app.close()
  }
})
