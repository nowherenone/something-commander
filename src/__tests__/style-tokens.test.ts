/**
 * Style token consistency — drives the shipped CSS under
 * `src/renderer/src/styles/` (the real entry for chrome theming).
 *
 * Guards: shared tokens exist; modules do not introduce ad-hoc hex/rgb
 * structural colors; chrome modules resolve heights via shared tokens.
 */
import { readFileSync, readdirSync } from 'fs'
import { join, resolve } from 'path'
import { describe, expect, it } from 'vitest'

const STYLES_DIR = resolve(__dirname, '../renderer/src/styles')

function readStyle(name: string): string {
  return readFileSync(join(STYLES_DIR, name), 'utf8')
}

function listCssModules(): string[] {
  return readdirSync(STYLES_DIR).filter(
    (f) => f.endsWith('.css') && f !== 'variables.css'
  )
}

/** Raw hex / rgb / hsl color literals (not inside url(...) or already var()). */
const RAW_COLOR_RE =
  /(?<![\w-])#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b|(?<![\w-])(?:rgba?|hsla?)\s*\(/g

const REQUIRED_TOKENS = [
  '--bg-primary',
  '--bg-secondary',
  '--bg-tertiary',
  '--bg-panel',
  '--bg-header',
  '--bg-selected',
  '--bg-cursor',
  '--bg-hover',
  '--bg-cursor-inactive',
  '--text-primary',
  '--text-secondary',
  '--text-muted',
  '--text-on-accent',
  '--text-selected',
  '--text-error',
  '--border-color',
  '--border-focus',
  '--border-width',
  '--panel-border-width',
  '--accent',
  '--accent-hover',
  '--danger',
  '--success',
  '--warning',
  '--info',
  '--chrome-height',
  '--header-height',
  '--statusbar-height',
  '--addressbar-height',
  '--tabbar-height',
  '--fnbar-height',
  '--menubar-height',
  '--commandline-height',
  '--dialog-header-height',
  '--dialog-footer-height',
  '--row-height',
  '--space-2',
  '--space-4',
  '--space-6',
  '--chrome-padding-x',
  '--control-padding-y',
  '--control-padding-x',
  '--dialog-padding',
  '--radius-sm',
  '--radius-md',
  '--font-size',
  '--font-size-small',
  '--font-size-ui',
  '--font-size-title',
  '--font-size-tiny',
  '--font-ui',
  '--font-mono',
  '--overlay-bg',
  '--shadow-dropdown',
  '--compare-newer',
  '--compare-older',
  '--compare-only-left',
  '--compare-only-right'
] as const

describe('style design tokens (shipped CSS)', () => {
  it('variables.css defines the shared macOS-like gray + density token set', () => {
    const css = readStyle('variables.css')
    expect(css.length).toBeGreaterThan(100)

    for (const token of REQUIRED_TOKENS) {
      expect(css, `missing token ${token}`).toContain(token)
    }

    // Themes still exist
    expect(css).toContain("data-theme='light'")
    expect(css).toContain("data-theme='monokai'")
    expect(css).toContain("data-theme='classic'")

    // Base palette is deep cool gray (macOS-like, not monokai green-brown)
    expect(css).toMatch(/--bg-primary:\s*#161617/)
    expect(css).toContain('--border-subtle')
    expect(css).toContain('--bg-elevated')
    expect(css).toContain('--shadow-dialog')
    expect(css).toContain('--font-ui')
  })

  it('CSS modules have zero ad-hoc hex/rgb/hsl structural colors', () => {
    const offenders: string[] = []

    for (const file of listCssModules()) {
      const css = readStyle(file)
      const matches = css.match(RAW_COLOR_RE)
      if (matches && matches.length > 0) {
        offenders.push(`${file}: ${[...new Set(matches)].join(', ')}`)
      }
    }

    expect(offenders, offenders.join('\n')).toEqual([])
  })

  it('chrome modules use shared height/border/font tokens for bars and dialogs', () => {
    const menubar = readStyle('menubar.module.css')
    expect(menubar).toContain('var(--menubar-height)')
    expect(menubar).toContain('var(--border-width)')
    expect(menubar).toContain('var(--font-ui)')
    expect(menubar).toContain('var(--font-size-small)')

    const fnbar = readStyle('function-bar.module.css')
    expect(fnbar).toContain('var(--fnbar-height)')
    expect(fnbar).toContain('var(--border-width)')
    expect(fnbar).toContain('.fnKey')
    expect(fnbar).toMatch(/border-radius:\s*var\(--radius/)

    const cmdline = readStyle('commandline.module.css')
    expect(cmdline).toContain('var(--commandline-height)')

    const tabs = readStyle('tabs.module.css')
    expect(tabs).toContain('var(--tabbar-height)')

    const panels = readStyle('panels.module.css')
    expect(panels).toContain('var(--addressbar-height)')
    expect(panels).toContain('var(--statusbar-height)')
    // No inactive-panel dimming (old style used opacity: 0.85 on .panel)
    expect(panels).not.toMatch(/\.panel\s*\{[^}]*opacity:\s*0\./)
    expect(panels).toContain('inset 2px 0 0 0 var(--accent)')
    expect(panels).toContain('var(--border-subtle)')

    const dialogs = readStyle('dialogs.module.css')
    expect(dialogs).toContain('var(--dialog-header-height)')
    expect(dialogs).toContain('var(--dialog-footer-height)')
    expect(dialogs).toContain('var(--radius-md)')
    expect(dialogs).toContain('var(--overlay-bg)')
    expect(dialogs).toContain('var(--shadow-dialog)')
    expect(dialogs).toContain('.formRow')
    expect(dialogs).toContain('.dataTable')

    const ops = readStyle('operations.module.css')
    expect(ops).toContain('var(--dialog-header-height)')
    expect(ops).toContain('var(--dialog-footer-height)')
    expect(ops).toContain('var(--overlay-bg)')

    const fileList = readStyle('file-list.module.css')
    expect(fileList).toContain('var(--bg-cursor-inactive)')
    expect(fileList).toContain('var(--text-selected)')
    expect(fileList).toContain('var(--text-error)')
    expect(fileList).toContain('var(--row-stripe)')
    expect(fileList).not.toMatch(/#ffcc00/)
    expect(fileList).not.toMatch(/#e57373/)

    const global = readStyle('global.css')
    expect(global).toContain('font-family: var(--font-ui)')
    expect(global).toContain('.appShell')

    const dircompare = readStyle('dircompare.module.css')
    expect(dircompare).toContain('var(--compare-newer)')
    expect(dircompare).toContain('var(--compare-older)')
    expect(dircompare).not.toMatch(/#4caf50/)
    expect(dircompare).not.toMatch(/#e91e63/)
  })

  it('default theme setting is dark (unified gray base)', async () => {
    // Drive the shipped settings module default — not a re-implemented constant
    const { useSettingsStore } = await import(
      '../renderer/src/stores/settings-store'
    )
    const theme = useSettingsStore.getState().theme
    expect(theme).toBe('dark')
  })
})
