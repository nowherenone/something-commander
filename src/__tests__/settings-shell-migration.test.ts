import { describe, it, expect } from 'vitest'
import { migrateSettings } from '../renderer/src/stores/settings-store'

describe('settings shell migration', () => {
  it('old hard-coded defaults become "auto"', () => {
    expect(migrateSettings({ shell: '/bin/bash' }).shell).toBe('')
    expect(migrateSettings({ shell: 'powershell' }).shell).toBe('')
  })
  it('real overrides are kept', () => {
    expect(migrateSettings({ shell: '/bin/zsh' }).shell).toBe('/bin/zsh')
    expect(migrateSettings({ shell: 'cmd.exe' }).shell).toBe('cmd.exe')
    expect(migrateSettings({ fontSize: 14 })).toEqual({ fontSize: 14 })
  })
})
