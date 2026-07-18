/**
 * Structural check: Settings stays lean (≤4 tabs) and ships without
 * sprawling inline chrome in the dialog source.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'

const SETTINGS = resolve(
  __dirname,
  '../renderer/src/components/dialogs/SettingsDialog.tsx'
)

describe('Settings surface (shipped source)', () => {
  const src = readFileSync(SETTINGS, 'utf8')

  it('exposes at most four primary tabs', () => {
    const tabIds = [...src.matchAll(/id:\s*'(general|appearance|behavior|keyboard)'/g)].map(
      (m) => m[1]
    )
    expect(new Set(tabIds).size).toBe(4)
    // Old sprawl tabs must be gone
    expect(src).not.toMatch(/id:\s*'display'/)
    expect(src).not.toMatch(/id:\s*'colors'/)
    expect(src).not.toMatch(/id:\s*'layout'/)
    expect(src).not.toMatch(/id:\s*'operations'/)
    expect(src).not.toMatch(/id:\s*'updates'/)
  })

  it('uses shared dialog/settings classes instead of large inline chrome blocks', () => {
    expect(src).toContain('styles.settingsLayout')
    expect(src).toContain('styles.settingsRow')
    expect(src).toContain('styles.dataTable')
    expect(src).toContain('styles.colorPickerRow')
    // No multi-property style={{ width, height, padding... }} color inputs
    expect(src).not.toMatch(/type="color"[\s\S]{0,80}style=\{\{/)
  })
})
