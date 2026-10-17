import { describe, it, expect, beforeEach } from 'vitest'
import {
  isTypeToCmdlineKey,
  typeIntoCommandLine,
  pasteText,
  focusCommandLine,
  pasteCursorName
} from '../renderer/src/commands/cmdline-commands'
import { findOpenableEntry } from '../renderer/src/commands/cmdline-builtins'
import { useSettingsStore } from '../renderer/src/stores/settings-store'
import { usePanelStore } from '../renderer/src/stores/panel-store'
import { useAppStore } from '../renderer/src/stores/app-store'
import { useCmdlineStore, _resetCmdlineStore } from '../renderer/src/stores/cmdline-store'
import type { Entry } from '../shared/types'

function entry(name: string, extra: Partial<Entry> = {}): Entry {
  return {
    id: `/work/${name}`,
    name,
    isContainer: false,
    size: 1,
    modifiedAt: 0,
    mimeType: '',
    iconHint: 'file',
    meta: {},
    attributes: { readonly: false, hidden: false, symlink: false },
    ...extra
  }
}

function setLeftTab(patch: Record<string, unknown>): void {
  const s = usePanelStore.getState()
  const tab = s.left.tabs[0]
  usePanelStore.setState({ left: { ...s.left, tabs: [{ ...tab, ...patch }, ...s.left.tabs.slice(1)] } })
}

describe('isTypeToCmdlineKey', () => {
  const ev = (init: KeyboardEventInit): KeyboardEvent => new KeyboardEvent('keydown', init)
  it('accepts printable keys without Ctrl/Alt/Meta', () => {
    expect(isTypeToCmdlineKey(ev({ key: 'l' }))).toBe(true)
    expect(isTypeToCmdlineKey(ev({ key: 'L', shiftKey: true }))).toBe(true)
    expect(isTypeToCmdlineKey(ev({ key: '.' }))).toBe(true)
  })
  it('rejects modifiers and named keys', () => {
    expect(isTypeToCmdlineKey(ev({ key: 'l', ctrlKey: true }))).toBe(false)
    expect(isTypeToCmdlineKey(ev({ key: 'l', altKey: true }))).toBe(false)
    expect(isTypeToCmdlineKey(ev({ key: 'l', metaKey: true }))).toBe(false)
    expect(isTypeToCmdlineKey(ev({ key: 'F5' }))).toBe(false)
    expect(isTypeToCmdlineKey(ev({ key: 'Enter' }))).toBe(false)
  })
})

describe('command-line commands', () => {
  beforeEach(() => {
    _resetCmdlineStore()
    useAppStore.setState({ activePanel: 'left' })
    useSettingsStore.setState({ showCommandLine: true, shell: '/bin/bash' })
    setLeftTab({
      pluginId: 'local-filesystem',
      locationId: '/work/my dir',
      locationDisplay: '/work/my dir',
      entries: [entry('a file.txt', { id: '/work/my dir/a file.txt' }), entry('plain.md')],
      cursorIndex: 1 // row 0 is ".."
    })
  })

  it('typeIntoCommandLine only when the bar is visible', () => {
    expect(typeIntoCommandLine('x')).toBe(true)
    expect(useCmdlineStore.getState().request).toMatchObject({ type: 'insert', text: 'x', raw: true })
    _resetCmdlineStore()
    useSettingsStore.setState({ showCommandLine: false })
    expect(typeIntoCommandLine('x')).toBe(false)
    expect(useCmdlineStore.getState().request).toBeNull()
  })

  it('paste helpers quote for the shell', () => {
    expect(pasteText('name')).toBe("'a file.txt'")
    expect(pasteText('path')).toBe("'/work/my dir/a file.txt'")
    expect(pasteText('dir')).toBe("'/work/my dir'")
    useSettingsStore.setState({ shell: 'cmd.exe' })
    expect(pasteText('name')).toBe('"a file.txt"')
    useSettingsStore.setState({ shell: 'pwsh' })
    expect(pasteText('dir')).toBe("'/work/my dir'")
  })

  it('nothing to paste on the ".." row', () => {
    setLeftTab({ cursorIndex: 0 })
    expect(pasteText('name')).toBeNull()
  })

  it('focus / paste show a hidden bar', () => {
    useSettingsStore.setState({ showCommandLine: false })
    pasteCursorName()
    expect(useSettingsStore.getState().showCommandLine).toBe(true)
    expect(useCmdlineStore.getState().request).toMatchObject({ type: 'insert', text: "'a file.txt'" })
    focusCommandLine()
    expect(useCmdlineStore.getState().request).toMatchObject({ type: 'focus' })
  })
})

describe('findOpenableEntry', () => {
  const entries = [
    entry('notes.txt'),
    entry('run.sh', { attributes: { readonly: false, hidden: false, symlink: false, executable: true } }),
    entry('src', { isContainer: true })
  ]
  it('matches a single non-executable file name', () => {
    expect(findOpenableEntry(entries, 'notes.txt')?.name).toBe('notes.txt')
    expect(findOpenableEntry(entries, '  notes.txt ')?.name).toBe('notes.txt')
  })
  it('ignores executables, folders, extra words and unknown names', () => {
    expect(findOpenableEntry(entries, 'run.sh')).toBeNull()
    expect(findOpenableEntry(entries, 'src')).toBeNull()
    expect(findOpenableEntry(entries, 'notes.txt extra')).toBeNull()
    expect(findOpenableEntry(entries, 'missing.txt')).toBeNull()
  })
})
