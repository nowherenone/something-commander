import React, { useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react'
import { insertWithSpacing, isLocalDirectory, parseCommandLine } from '@shared/cmdline'
import { useAppStore } from '../../stores/app-store'
import { usePanelStore } from '../../stores/panel-store'
import { useSettingsStore } from '../../stores/settings-store'
import { useKeybindingsStore } from '../../stores/keybindings-store'
import { useCmdlineStore, loadCmdlineHistory } from '../../stores/cmdline-store'
import {
  CMDLINE_INPUT_ACTIONS,
  installLocationTracking,
  pasteText,
  rendererPlatform
} from '../../commands/cmdline-commands'
import { findOpenableEntry, runBuiltin } from '../../commands/cmdline-builtins'
import { showToast } from './Toast'
import styles from '../../styles/commandline.module.css'

interface OutputState {
  text: string
  /** One-line summary shown above the output (exit code, timeout, hint). */
  status: string | null
  isError: boolean
}

const NOT_LOCAL_HINT = 'Not a local directory — only cd, j and mkdir work here'

export function CommandLine(): React.JSX.Element {
  const [command, setCommand] = useState('')
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [output, setOutput] = useState<OutputState | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  /** Index of the highlighted history-dropdown row; null = closed. */
  const [dropdown, setDropdown] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const commandRef = useRef(command)
  commandRef.current = command
  const draftRef = useRef('')
  const pendingCaret = useRef<number | null>(null)
  const dropdownRef = useRef<HTMLUListElement>(null)

  const history = useCmdlineStore((s) => s.history)
  const request = useCmdlineStore((s) => s.request)
  const activePanel = useAppStore((s) => s.activePanel)
  const panelSlice = usePanelStore((s) => s[activePanel])
  const refresh = usePanelStore((s) => s.refresh)
  const tab = panelSlice.tabs.find((t) => t.id === panelSlice.activeTabId) || panelSlice.tabs[0]
  const local = isLocalDirectory(tab.pluginId, tab.locationId)
  const cwd = local ? tab.locationId! : tab.locationDisplay || ''

  useEffect(() => {
    void loadCmdlineHistory()
    installLocationTracking()
  }, [])

  // Restore the caret after programmatic edits (paste helpers, type-to-cmdline).
  useLayoutEffect(() => {
    const c = pendingCaret.current
    if (c === null || !inputRef.current) return
    pendingCaret.current = null
    inputRef.current.setSelectionRange(c, c)
  }, [command])

  const focusInput = useCallback(() => {
    inputRef.current?.focus()
  }, [])

  const insertText = useCallback((text: string, raw: boolean) => {
    const el = inputRef.current
    const value = commandRef.current
    const focused = !!el && document.activeElement === el
    const start = focused ? (el!.selectionStart ?? value.length) : value.length
    const end = focused ? (el!.selectionEnd ?? value.length) : value.length
    let next: string
    let caret: number
    if (raw) {
      next = value.slice(0, start) + text + value.slice(end)
      caret = start + text.length
    } else {
      ;({ value: next, caret } = insertWithSpacing(value, start, end, text))
    }
    pendingCaret.current = caret
    setCommand(next)
    setHistoryIndex(-1)
    el?.focus()
  }, [])

  // Requests queued by keybindings / the panel (see cmdline-store).
  useEffect(() => {
    if (!request) return
    useCmdlineStore.getState().consume(request.seq)
    if (request.type === 'focus') {
      focusInput()
    } else if (request.type === 'history') {
      focusInput()
      setDropdown(useCmdlineStore.getState().history.length > 0 ? 0 : null)
    } else if (!isRunning) {
      insertText(request.text, !!request.raw)
    }
  }, [request, focusInput, insertText, isRunning])

  // Keep the highlighted dropdown row in view.
  useEffect(() => {
    if (dropdown === null) return
    const row = dropdownRef.current?.children[dropdown] as HTMLElement | undefined
    row?.scrollIntoView?.({ block: 'nearest' })
  }, [dropdown])

  const submit = useCallback(
    async (line: string, detached: boolean) => {
      if (isRunning) return
      const platform = rendererPlatform()
      const parsed = parseCommandLine(line, platform)
      if (parsed.kind === 'empty') return

      // Every run starts with a clean slate.
      setOutput(null)
      setDropdown(null)
      setHistoryIndex(-1)
      draftRef.current = ''
      useCmdlineStore.getState().addHistory(line.trim())
      const panel = useAppStore.getState().activePanel
      const liveTab = usePanelStore.getState().getActiveTab(panel)
      const liveLocal = isLocalDirectory(liveTab.pluginId, liveTab.locationId)

      if (parsed.kind === 'builtin') {
        setCommand('')
        const res = await runBuiltin(panel, parsed.name, parsed.args)
        if (res.error) setOutput({ text: res.error, status: null, isError: true })
        else if (res.info) setOutput({ text: res.info, status: null, isError: false })
        focusInput()
        return
      }

      if (!liveLocal) {
        setOutput({
          text: `${liveTab.locationDisplay || 'This panel'} is not a local directory, so shell commands can't run here.\nBuilt-ins still work: cd <path>, j <bookmark>, mkdir <name>.`,
          status: 'Not a local directory',
          isError: true
        })
        focusInput()
        return
      }
      const runCwd = liveTab.locationId!

      // A bare file name (non-executable) opens with its association.
      if (!parsed.forced && !detached) {
        const entry = findOpenableEntry(liveTab.entries, parsed.command)
        if (entry) {
          setCommand('')
          const err = await window.api.util.openFile(entry.id)
          if (err) setOutput({ text: err, status: `Could not open ${entry.name}`, isError: true })
          focusInput()
          return
        }
      }

      const shellOverride = useSettingsStore.getState().shell.trim() || undefined
      if (detached) {
        setCommand('')
        const res = await window.api.util.runDetached(parsed.command, runCwd, shellOverride)
        if (!res.success) setOutput({ text: res.error || 'Failed to start', status: 'Could not start', isError: true })
        else showToast(`Started: ${parsed.command}`, { duration: 2000 })
        focusInput()
        return
      }

      setIsRunning(true)
      try {
        const result = await window.api.util.runCommand(parsed.command, runCwd, shellOverride)
        const parts = [result.stdout.replace(/\s+$/, ''), result.stderr.replace(/\s+$/, '')].filter(Boolean)
        const failed = result.code !== 0 || !!result.error
        const status = result.error
          ? result.error
          : result.code !== 0
            ? `Exited with code ${result.code}`
            : null
        if (parts.length > 0 || status) {
          setOutput({ text: parts.join('\n'), status, isError: failed })
        }
      } catch (err) {
        setOutput({ text: String(err), status: 'Command failed', isError: true })
      } finally {
        setIsRunning(false)
        setCommand('')
        refresh('left')
        refresh('right')
        // readOnly (not disabled) keeps focus during the run; make sure it's back.
        focusInput()
      }
    },
    [isRunning, refresh, focusInput]
  )

  const chooseHistory = useCallback((idx: number) => {
    const cmd = useCmdlineStore.getState().history[idx]
    setDropdown(null)
    if (cmd === undefined) return
    pendingCaret.current = cmd.length
    setCommand(cmd)
    inputRef.current?.focus()
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      // Keys typed here belong to the command line, never to the panel.
      e.stopPropagation()
      if (e.nativeEvent.isComposing) return

      if (dropdown !== null) {
        const n = history.length
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setDropdown(Math.min(dropdown + 1, n - 1))
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setDropdown(Math.max(dropdown - 1, 0))
          return
        }
        if (e.key === 'Enter') {
          e.preventDefault()
          chooseHistory(dropdown)
          return
        }
        if (e.key === 'Delete' && e.shiftKey) {
          e.preventDefault()
          const cmd = history[dropdown]
          if (cmd !== undefined) useCmdlineStore.getState().removeHistory(cmd)
          setDropdown(n - 1 > 0 ? Math.min(dropdown, n - 2) : null)
          return
        }
        if (e.key === 'Escape' || e.key === 'Tab') {
          e.preventDefault()
          setDropdown(null)
          return
        }
      }

      const action = useKeybindingsStore.getState().matchAction(e.nativeEvent)
      if (action && CMDLINE_INPUT_ACTIONS.has(action)) {
        e.preventDefault()
        if (action === 'cmdlineHistory') {
          setDropdown(history.length > 0 ? 0 : null)
          return
        }
        const text = pasteText(
          action === 'cmdlinePasteName' ? 'name' : action === 'cmdlinePastePath' ? 'path' : 'dir'
        )
        if (text && !isRunning) insertText(text, false)
        return
      }

      if (e.key === 'ArrowDown' && e.ctrlKey) {
        e.preventDefault()
        setDropdown(history.length > 0 ? 0 : null)
        return
      }

      if (e.key === 'Enter') {
        e.preventDefault()
        // Only run when the input really owns the key (see useKeyboard).
        if (document.activeElement !== inputRef.current) return
        if (e.ctrlKey || e.altKey || e.metaKey) return
        void submit(command, e.shiftKey)
        return
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (history.length > 0) {
          if (historyIndex === -1) draftRef.current = command
          const newIdx = Math.min(historyIndex + 1, history.length - 1)
          setHistoryIndex(newIdx)
          pendingCaret.current = history[newIdx].length
          setCommand(history[newIdx])
        }
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (historyIndex > 0) {
          const newIdx = historyIndex - 1
          setHistoryIndex(newIdx)
          pendingCaret.current = history[newIdx].length
          setCommand(history[newIdx])
        } else if (historyIndex === 0) {
          setHistoryIndex(-1)
          setCommand(draftRef.current)
        }
        return
      }

      if (e.key === 'Escape') {
        e.preventDefault()
        // Peel one layer per press: output → typed text → back to the panel.
        if (output) setOutput(null)
        else if (command) {
          setCommand('')
          setHistoryIndex(-1)
        } else inputRef.current?.blur()
      }
    },
    [command, history, historyIndex, dropdown, output, isRunning, submit, chooseHistory, insertText]
  )

  // Short display of cwd
  const shortCwd = cwd.length > 30 ? '...' + cwd.slice(-27) : cwd
  const placeholder = isRunning ? 'Running...' : local ? 'Type command...' : NOT_LOCAL_HINT

  return (
    <>
      {output && (
        <div className={styles.outputOverlay} data-testid="cmdline-output">
          <button className={styles.closeOutput} onClick={() => setOutput(null)} aria-label="Close command output">
            x
          </button>
          {output.status && (
            <div className={`${styles.outputStatus} ${output.isError ? styles.outputError : ''}`}>
              {output.status}
            </div>
          )}
          {output.text && (
            <pre className={`${styles.output} ${output.isError && !output.status ? styles.outputError : ''}`}>
              {output.text}
            </pre>
          )}
        </div>
      )}
      <div className={styles.commandLine}>
        <span
          className={`${styles.prompt} ${local ? '' : styles.promptRemote}`}
          title={local ? cwd : `${cwd} — ${NOT_LOCAL_HINT}`}
        >
          {shortCwd}&gt;
        </span>
        <div className={styles.inputWrap}>
          <input
            ref={inputRef}
            className={styles.input}
            value={command}
            onChange={(e) => {
              setCommand(e.target.value)
              setHistoryIndex(-1)
            }}
            onKeyDown={handleKeyDown}
            onBlur={() => setDropdown(null)}
            placeholder={placeholder}
            title={local ? undefined : NOT_LOCAL_HINT}
            readOnly={isRunning}
            aria-busy={isRunning}
            aria-label="Command line"
            data-cmdline-input
            spellCheck={false}
            autoComplete="off"
          />
          {dropdown !== null && history.length > 0 && (
            <ul className={styles.historyDropdown} ref={dropdownRef} role="listbox" aria-label="Command history">
              {history.map((h, i) => (
                <li
                  key={h}
                  role="option"
                  aria-selected={i === dropdown}
                  className={`${styles.historyItem} ${i === dropdown ? styles.historyItemActive : ''}`}
                  // mousedown (not click) so the input's blur doesn't close the list first.
                  onMouseDown={(ev) => {
                    ev.preventDefault()
                    chooseHistory(i)
                  }}
                >
                  {h}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  )
}
