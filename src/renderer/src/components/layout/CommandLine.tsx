import React, { useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo } from 'react'
import { insertWithSpacing, isLocalDirectory, parseCommandLine, quoteArg } from '@shared/cmdline'
import {
  commonPrefix,
  completionText,
  expandPlaceholders,
  fuzzyFilter,
  hasPlaceholders,
  splitPartialPath,
  tokenAtCaret
} from '@shared/cmdline-smart'
import { TerminalBuffer } from '@shared/ansi'
import { useAppStore } from '../../stores/app-store'
import { usePanelStore } from '../../stores/panel-store'
import { useSettingsStore } from '../../stores/settings-store'
import { useKeybindingsStore } from '../../stores/keybindings-store'
import { useCmdlineStore, loadCmdlineHistory } from '../../stores/cmdline-store'
import {
  CMDLINE_INPUT_ACTIONS,
  currentShellKind,
  installLocationTracking,
  pasteText,
  perFileContext,
  placeholderContext,
  probeShellKind,
  rendererPlatform,
  selectedEntries
} from '../../commands/cmdline-commands'
import { findOpenableEntry, runBuiltin } from '../../commands/cmdline-builtins'
import { exitStatus, pathCommands, startRun, type RunHandle } from '../../commands/cmdline-runner'
import { CommandOutput, type RunView } from './CommandOutput'
import { showToast } from './Toast'
import styles from '../../styles/commandline.module.css'

const NOT_LOCAL_HINT = 'Not a local directory — only cd, j and mkdir work here'
const BUILTINS = ['cd', 'mkdir', 'j']

interface Suggestion {
  label: string
  kind: 'history' | 'command' | 'path'
  /** Replace line[start, end) with text. */
  start: number
  end: number
  text: string
}

export function CommandLine(): React.JSX.Element {
  const [command, setCommand] = useState('')
  const [historyIndex, setHistoryIndex] = useState(-1)
  /** History dropdown (Ctrl+↓ / Alt+F8): highlighted row, or null when closed. */
  const [dropdown, setDropdown] = useState<number | null>(null)
  /** Tab-completion list. */
  const [suggest, setSuggest] = useState<{ items: Suggestion[]; index: number } | null>(null)
  /** Ctrl+R fuzzy search. */
  const [search, setSearch] = useState<{ query: string; index: number } | null>(null)
  const [view, setView] = useState<RunView | null>(null)
  const [version, setVersion] = useState(0)
  const [paneHeight, setPaneHeight] = useState(() => useSettingsStore.getState().cmdlineOutputHeight || 220)

  const inputRef = useRef<HTMLInputElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const commandRef = useRef(command)
  commandRef.current = command
  const draftRef = useRef('')
  const pendingCaret = useRef<number | null>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const bufferRef = useRef(new TerminalBuffer({ maxLines: 5000 }))
  const runRef = useRef<RunHandle | null>(null)
  const cancelRef = useRef(false)
  const rafRef = useRef<number | null>(null)

  const history = useCmdlineStore((s) => s.history)
  const request = useCmdlineStore((s) => s.request)
  const perFile = useCmdlineStore((s) => s.perFile)
  const activePanel = useAppStore((s) => s.activePanel)
  const panelSlice = usePanelStore((s) => s[activePanel])
  const otherSlice = usePanelStore((s) => s[activePanel === 'left' ? 'right' : 'left'])
  const refresh = usePanelStore((s) => s.refresh)
  const tab = panelSlice.tabs.find((t) => t.id === panelSlice.activeTabId) || panelSlice.tabs[0]
  const local = isLocalDirectory(tab.pluginId, tab.locationId)
  const cwd = local ? tab.locationId! : tab.locationDisplay || ''
  const isRunning = view?.state === 'running'
  const platform = rendererPlatform()
  const windows = platform === 'win32'

  useEffect(() => {
    void loadCmdlineHistory()
    void probeShellKind()
    installLocationTracking()
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  useLayoutEffect(() => {
    const c = pendingCaret.current
    if (c === null || !inputRef.current) return
    pendingCaret.current = null
    inputRef.current.setSelectionRange(c, c)
  }, [command])

  const focusInput = useCallback(() => inputRef.current?.focus(), [])

  const setLine = useCallback((value: string, caret = value.length) => {
    pendingCaret.current = caret
    setCommand(value)
  }, [])

  const insertText = useCallback(
    (text: string, raw: boolean) => {
      const el = inputRef.current
      const value = commandRef.current
      const focused = !!el && document.activeElement === el
      const start = focused ? (el!.selectionStart ?? value.length) : value.length
      const end = focused ? (el!.selectionEnd ?? value.length) : value.length
      if (raw) setLine(value.slice(0, start) + text + value.slice(end), start + text.length)
      else {
        const r = insertWithSpacing(value, start, end, text)
        setLine(r.value, r.caret)
      }
      setHistoryIndex(-1)
      el?.focus()
    },
    [setLine]
  )

  useEffect(() => {
    if (!request) return
    useCmdlineStore.getState().consume(request.seq)
    if (request.type === 'focus') focusInput()
    else if (request.type === 'history') {
      focusInput()
      setDropdown(useCmdlineStore.getState().history.length > 0 ? 0 : null)
    } else insertText(request.text, !!request.raw)
  }, [request, focusInput, insertText])

  useEffect(() => {
    const idx = dropdown ?? suggest?.index ?? search?.index
    if (idx === undefined || idx === null) return
    ;(listRef.current?.children[idx] as HTMLElement | undefined)?.scrollIntoView?.({ block: 'nearest' })
  }, [dropdown, suggest, search])

  // ── Output buffer ──────────────────────────────────────────────────────
  const bump = useCallback(() => {
    if (rafRef.current !== null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      setVersion((v) => v + 1)
    })
  }, [])

  const write = useCallback(
    (text: string, stderr = false) => {
      bufferRef.current.write(text, stderr)
      bump()
    },
    [bump]
  )

  const resetOutput = useCallback((title: string, state: RunView['state'] = 'running') => {
    bufferRef.current = new TerminalBuffer({ maxLines: 5000 })
    setView({ title, state, status: null })
    setVersion((v) => v + 1)
  }, [])

  const showMessage = useCallback(
    (title: string, text: string, isError: boolean, status: string | null = null) => {
      resetOutput(title, isError ? 'failed' : 'ok')
      if (text) write(text, isError)
      setView({ title, state: isError ? 'failed' : 'ok', status })
    },
    [resetOutput, write]
  )

  /** Stream one command into the pane; resolves with its exit status line. */
  const streamOne = useCallback(
    async (text: string, runCwd: string): Promise<string | null> => {
      const shellOverride = useSettingsStore.getState().shell.trim() || undefined
      const handle = startRun({ command: text, cwd: runCwd, shell: shellOverride }, (ev) =>
        write(ev.text, ev.stream === 'stderr')
      )
      runRef.current = handle
      const exit = await handle.done
      runRef.current = null
      const status = exitStatus(exit)
      if (exit.error) write(`${exit.error}\n`, true)
      return status
    },
    [write]
  )

  const stop = useCallback(() => {
    cancelRef.current = true
    runRef.current?.stop()
  }, [])

  // ── Submit ─────────────────────────────────────────────────────────────
  const submit = useCallback(
    async (line: string, detached: boolean) => {
      if (isRunning) {
        showToast('A command is still running — Stop it first (Ctrl+C)', { duration: 2500 })
        return
      }
      const trimmed = line.trim()
      if (!trimmed) return
      const forced = trimmed.startsWith('!')
      const body = forced ? trimmed.slice(1).trim() : trimmed
      if (!body) return

      setDropdown(null)
      setSuggest(null)
      setHistoryIndex(-1)
      draftRef.current = ''
      useCmdlineStore.getState().addHistory(trimmed)
      const panel = useAppStore.getState().activePanel
      const liveTab = usePanelStore.getState().getActiveTab(panel)
      const liveLocal = isLocalDirectory(liveTab.pluginId, liveTab.locationId)
      const kind = currentShellKind()

      const many = useCmdlineStore.getState().perFile ? selectedEntries() : []
      const exp = expandPlaceholders(body, placeholderContext(), kind)
      if (exp.missing.length > 0 && many.length === 0) {
        showMessage(trimmed, `Nothing to put in ${exp.missing.join(', ')} here.`, true, 'Placeholder has no value')
        focusInput()
        return
      }
      const parsed = parseCommandLine(forced ? `!${exp.text}` : exp.text, platform)
      if (parsed.kind === 'empty') return

      if (parsed.kind === 'builtin') {
        setCommand('')
        setView(null)
        const res = await runBuiltin(panel, parsed.name, parsed.args)
        if (res.error) showMessage(trimmed, res.error, true)
        else if (res.info) showMessage(trimmed, res.info, false)
        focusInput()
        return
      }

      if (!liveLocal) {
        showMessage(
          trimmed,
          `${liveTab.locationDisplay || 'This panel'} is not a local directory, so shell commands can't run here.\nBuilt-ins still work: cd <path>, j <bookmark>, mkdir <name>.`,
          true,
          'Not a local directory'
        )
        focusInput()
        return
      }
      const runCwd = liveTab.locationId!

      if (!forced && !detached && many.length === 0 && exp.used.length === 0) {
        const entry = findOpenableEntry(liveTab.entries, parsed.command)
        if (entry) {
          setCommand('')
          setView(null)
          const err = await window.api.util.openFile(entry.id)
          if (err) showMessage(trimmed, err, true, `Could not open ${entry.name}`)
          focusInput()
          return
        }
      }

      const shellOverride = useSettingsStore.getState().shell.trim() || undefined
      if (detached) {
        setCommand('')
        const texts =
          many.length > 0
            ? many.map((e) => {
                const x = expandPlaceholders(body, perFileContext(e), kind)
                return x.used.length > 0 ? x.text : `${body} ${quoteArg(e.name, kind)}`
              })
            : [parsed.command]
        for (const t of texts) {
          const res = await window.api.util.runDetached(t, runCwd, shellOverride)
          if (!res.success) {
            showMessage(t, res.error || 'Failed to start', true, 'Could not start')
            break
          }
        }
        showToast(texts.length > 1 ? `Started ${texts.length} commands` : `Started: ${texts[0]}`, { duration: 2000 })
        focusInput()
        return
      }

      // Streaming run(s). Old output is replaced on every run.
      setCommand('')
      cancelRef.current = false
      if (many.length > 0) {
        resetOutput(`${trimmed}  ×${many.length}`)
        let failures = 0
        let lastStatus: string | null = null
        for (let i = 0; i < many.length; i++) {
          if (cancelRef.current) break
          const e = many[i]
          const x = expandPlaceholders(body, perFileContext(e), kind)
          const text = x.used.length > 0 ? x.text : `${body} ${quoteArg(e.name, kind)}`
          setView((v) => (v ? { ...v, progress: `${i + 1}/${many.length} ${e.name}` } : v))
          write(`\x1b[2m── ${e.name} (${i + 1}/${many.length}): ${text}\x1b[22m\n`)
          lastStatus = await streamOne(text, runCwd)
          if (lastStatus) {
            failures++
            write(`\x1b[2m   ${lastStatus}\x1b[22m\n`)
          }
        }
        const stopped = cancelRef.current
        setView((v) =>
          v
            ? {
                ...v,
                progress: null,
                state: stopped ? 'stopped' : failures > 0 ? 'failed' : 'ok',
                status: stopped ? 'Stopped' : failures > 0 ? `${failures} of ${many.length} failed` : `${many.length} runs done`
              }
            : v
        )
      } else {
        resetOutput(parsed.command)
        const status = await streamOne(parsed.command, runCwd)
        const stopped = cancelRef.current
        setView((v) => (v ? { ...v, state: stopped ? 'stopped' : status ? 'failed' : 'ok', status } : v))
      }
      refresh('left')
      refresh('right')
      focusInput()
    },
    [isRunning, platform, refresh, focusInput, showMessage, resetOutput, streamOne, write]
  )

  // ── Completion ─────────────────────────────────────────────────────────
  const applySuggestion = useCallback(
    (s: Suggestion) => {
      const line = commandRef.current
      setSuggest(null)
      setLine(line.slice(0, s.start) + s.text + line.slice(s.end), s.start + s.text.length)
      inputRef.current?.focus()
    },
    [setLine]
  )

  const complete = useCallback(async () => {
    const el = inputRef.current
    if (!el) return
    const line = commandRef.current
    const caret = el.selectionStart ?? line.length
    const tok = tokenAtCaret(line, caret, windows)
    const kind = currentShellKind()
    const sep = windows ? '\\' : '/'
    const fold = windows || platform === 'darwin'
    const starts = (a: string, b: string): boolean => (fold ? a.toLowerCase().startsWith(b.toLowerCase()) : a.startsWith(b))
    const items: Suggestion[] = []

    if (caret === line.length && line.trim()) {
      for (const h of useCmdlineStore.getState().history) {
        if (h !== line && h.startsWith(line)) items.push({ label: h, kind: 'history', start: 0, end: line.length, text: h })
        if (items.length >= 5) break
      }
    }
    const looksLikePath = /[\\/]/.test(tok.value) || tok.value.startsWith('.') || tok.value.startsWith('~')
    let commandHits = 0
    if (tok.index === 0 && !looksLikePath && tok.value) {
      const names = [...BUILTINS, ...(await pathCommands())]
      const seen = new Set<string>()
      for (const n of names) {
        if (seen.has(n) || !starts(n, tok.value)) continue
        seen.add(n)
        items.push({ label: n, kind: 'command', start: tok.start, end: tok.end, text: `${n} ` })
        if (++commandHits >= 100) break
      }
    }
    if (local && (tok.index > 0 || looksLikePath || commandHits === 0)) {
      const { dirPart, base } = splitPartialPath(tok.value, windows)
      const hits = await window.api.cmd.completePath(cwd, dirPart, base)
      for (const h of hits) {
        items.push({
          label: h.name + (h.isDir ? sep : ''),
          kind: 'path',
          start: tok.start,
          end: tok.end,
          text: completionText(dirPart + h.name, h.isDir, kind, sep)
        })
      }
    }
    if (commandRef.current !== line) return // typed meanwhile
    if (items.length === 0) return
    if (items.length === 1) {
      applySuggestion(items[0])
      return
    }
    // Extend to the common prefix of the token-level candidates when that's unambiguous text.
    const tokenItems = items.filter((i) => i.kind !== 'history')
    if (tokenItems.length > 1) {
      const raw = tokenItems.map((i) => (i.kind === 'path' ? splitPartialPath(tok.value, windows).dirPart + i.label.replace(/[\\/]$/, '') : i.label))
      const prefix = commonPrefix(raw, fold)
      if (prefix.length > tok.value.length && quoteArg(prefix, kind) === prefix) {
        const next = line.slice(0, tok.start) + prefix + line.slice(tok.end)
        setLine(next, tok.start + prefix.length)
        const delta = prefix.length - (tok.end - tok.start)
        setSuggest({
          items: items.map((i) => (i.kind === 'history' ? i : { ...i, end: i.end + delta })),
          index: 0
        })
        return
      }
    }
    setSuggest({ items, index: 0 })
  }, [windows, platform, local, cwd, applySuggestion, setLine])

  // ── Ctrl+R search ──────────────────────────────────────────────────────
  const searchHits = useMemo(() => (search ? fuzzyFilter(history, search.query, 50) : []), [search, history])

  const openSearch = useCallback(() => {
    setDropdown(null)
    setSuggest(null)
    setSearch({ query: '', index: 0 })
    requestAnimationFrame(() => searchRef.current?.focus())
  }, [])

  const closeSearch = useCallback(
    (accept: string | null) => {
      if (accept !== null) setLine(accept)
      // Move focus before the search input unmounts so keys never land on
      // the panel in between (its onBlur also clears the search).
      inputRef.current?.focus()
      setSearch(null)
    },
    [setLine]
  )

  const onSearchKey = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      e.stopPropagation()
      if (!search) return
      const n = searchHits.length
      if (e.key === 'Escape') {
        e.preventDefault()
        closeSearch(null)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        closeSearch(searchHits[search.index]?.item ?? null)
      } else if (e.key === 'ArrowDown' || (e.key.toLowerCase() === 'r' && e.ctrlKey)) {
        e.preventDefault()
        if (n) setSearch({ ...search, index: (search.index + 1) % n })
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (n) setSearch({ ...search, index: (search.index - 1 + n) % n })
      }
    },
    [search, searchHits, closeSearch]
  )

  // ── History dropdown ───────────────────────────────────────────────────
  const chooseHistory = useCallback(
    (idx: number) => {
      const cmd = useCmdlineStore.getState().history[idx]
      setDropdown(null)
      if (cmd === undefined) return
      setLine(cmd)
      inputRef.current?.focus()
    },
    [setLine]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      e.stopPropagation()
      if (e.nativeEvent.isComposing) return

      // Open lists own the arrows / Enter / Tab / Escape.
      const list = suggest ?? (dropdown !== null ? { index: dropdown } : null)
      if (list) {
        const n = suggest ? suggest.items.length : history.length
        const move = (idx: number): void => {
          if (suggest) setSuggest({ ...suggest, index: idx })
          else setDropdown(idx)
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          move(Math.min(list.index + 1, n - 1))
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          move(Math.max(list.index - 1, 0))
          return
        }
        if (e.key === 'Enter' || (e.key === 'Tab' && suggest)) {
          e.preventDefault()
          if (suggest) applySuggestion(suggest.items[suggest.index])
          else chooseHistory(list.index)
          return
        }
        if (e.key === 'Delete' && e.shiftKey && !suggest) {
          e.preventDefault()
          const cmd = history[list.index]
          if (cmd !== undefined) useCmdlineStore.getState().removeHistory(cmd)
          setDropdown(n - 1 > 0 ? Math.min(list.index, n - 2) : null)
          return
        }
        if (e.key === 'Escape' || e.key === 'Tab') {
          e.preventDefault()
          setSuggest(null)
          setDropdown(null)
          return
        }
      }

      if (e.key.toLowerCase() === 'r' && e.ctrlKey && !e.altKey && !e.shiftKey) {
        e.preventDefault()
        openSearch()
        return
      }
      if (e.key.toLowerCase() === 'c' && e.ctrlKey && !e.shiftKey && isRunning) {
        const el = inputRef.current
        if (!el || el.selectionStart === el.selectionEnd) {
          e.preventDefault()
          stop()
          return
        }
      }
      if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault()
        void complete()
        return
      }

      const action = useKeybindingsStore.getState().matchAction(e.nativeEvent)
      if (action && CMDLINE_INPUT_ACTIONS.has(action)) {
        e.preventDefault()
        if (action === 'cmdlineHistory') {
          setDropdown(history.length > 0 ? 0 : null)
          return
        }
        const text = pasteText(action === 'cmdlinePasteName' ? 'name' : action === 'cmdlinePastePath' ? 'path' : 'dir')
        if (text) insertText(text, false)
        return
      }

      if (e.key === 'ArrowDown' && e.ctrlKey) {
        e.preventDefault()
        setDropdown(history.length > 0 ? 0 : null)
        return
      }

      if (e.key === 'Enter') {
        e.preventDefault()
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
          setLine(history[newIdx])
        }
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (historyIndex > 0) {
          const newIdx = historyIndex - 1
          setHistoryIndex(newIdx)
          setLine(history[newIdx])
        } else if (historyIndex === 0) {
          setHistoryIndex(-1)
          setLine(draftRef.current)
        }
        return
      }

      if (e.key === 'Escape') {
        e.preventDefault()
        // Peel one layer per press: output → typed text → back to the panel.
        if (view && !isRunning) setView(null)
        else if (command) {
          setCommand('')
          setHistoryIndex(-1)
        } else inputRef.current?.blur()
      }
    },
    [command, history, historyIndex, dropdown, suggest, view, isRunning, submit, chooseHistory, insertText, applySuggestion, complete, openSearch, stop, setLine]
  )

  // ── Ghost preview of placeholders ──────────────────────────────────────
  const preview = useMemo(() => {
    const body = command.trim().replace(/^!/, '')
    if (!hasPlaceholders(body)) return null
    const many = perFile ? selectedEntries() : []
    const ctx = many.length > 0 ? perFileContext(many[0]) : placeholderContext()
    const exp = expandPlaceholders(body, ctx, currentShellKind())
    return { text: exp.text, missing: exp.missing, more: many.length > 1 ? many.length - 1 : 0 }
    // Panel slices are deps so cursor/selection moves refresh the preview.
  }, [command, perFile, panelSlice, otherSlice])

  const onResize = useCallback((h: number, commit: boolean) => {
    setPaneHeight(h)
    if (commit) useSettingsStore.getState().updateSettings({ cmdlineOutputHeight: h })
  }, [])

  const shortCwd = cwd.length > 30 ? '...' + cwd.slice(-27) : cwd
  const placeholder = isRunning
    ? 'Running… (Ctrl+C stops)'
    : local
      ? 'Type command… (Tab completes, Ctrl+R searches history)'
      : NOT_LOCAL_HINT
  const selCount = tab.selectedEntryIds.size

  return (
    <>
      {view && (
        <CommandOutput
          view={view}
          buffer={bufferRef.current}
          version={version}
          height={paneHeight}
          onResize={onResize}
          onStop={stop}
          onClose={() => {
            if (!isRunning) setView(null)
          }}
        />
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
              setSuggest(null)
            }}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              setDropdown(null)
              setSuggest(null)
            }}
            placeholder={placeholder}
            title={local ? undefined : NOT_LOCAL_HINT}
            aria-busy={isRunning}
            aria-label="Command line"
            data-cmdline-input
            spellCheck={false}
            autoComplete="off"
          />
          {preview && dropdown === null && !suggest && !search && (
            <div className={styles.preview} data-testid="cmdline-preview">
              <span className={styles.previewArrow}>→</span> {preview.text}
              {preview.more > 0 && <span className={styles.previewMuted}> (+{preview.more} more)</span>}
              {preview.missing.length > 0 && (
                <span className={styles.outputError}> — no value for {preview.missing.join(', ')}</span>
              )}
            </div>
          )}
          {dropdown !== null && history.length > 0 && (
            <ul className={styles.historyDropdown} ref={listRef} role="listbox" aria-label="Command history">
              {history.map((h, i) => (
                <li
                  key={h}
                  role="option"
                  aria-selected={i === dropdown}
                  className={`${styles.historyItem} ${i === dropdown ? styles.historyItemActive : ''}`}
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
          {suggest && (
            <ul className={styles.historyDropdown} ref={listRef} role="listbox" aria-label="Completions">
              {suggest.items.map((s, i) => (
                <li
                  key={`${s.kind}:${s.label}`}
                  role="option"
                  aria-selected={i === suggest.index}
                  className={`${styles.historyItem} ${i === suggest.index ? styles.historyItemActive : ''}`}
                  onMouseDown={(ev) => {
                    ev.preventDefault()
                    applySuggestion(s)
                  }}
                >
                  <span className={styles.suggestKind}>{s.kind === 'history' ? 'hist' : s.kind === 'command' ? 'cmd' : ''}</span>
                  {s.label}
                </li>
              ))}
            </ul>
          )}
          {search && (
            <div className={styles.searchPopup} role="dialog" aria-label="Search history">
              <ul className={styles.searchList} ref={listRef} role="listbox" aria-label="History matches">
                {searchHits.length === 0 && <li className={styles.searchEmpty}>No matches</li>}
                {searchHits.map((h, i) => {
                  const marks = new Set(h.positions)
                  return (
                    <li
                      key={h.item}
                      role="option"
                      aria-selected={i === search.index}
                      className={`${styles.historyItem} ${i === search.index ? styles.historyItemActive : ''}`}
                      onMouseDown={(ev) => {
                        ev.preventDefault()
                        closeSearch(h.item)
                      }}
                    >
                      {[...h.item].map((ch, k) =>
                        marks.has(k) ? (
                          <mark key={k} className={styles.searchMark}>
                            {ch}
                          </mark>
                        ) : (
                          ch
                        )
                      )}
                    </li>
                  )
                })}
              </ul>
              <input
                ref={searchRef}
                className={styles.searchInput}
                value={search.query}
                placeholder="Search history (fuzzy) — Enter picks, Ctrl+R next, Esc cancels"
                aria-label="Search history"
                data-cmdline-search
                onChange={(e) => setSearch({ query: e.target.value, index: 0 })}
                onKeyDown={onSearchKey}
                onBlur={() => setSearch(null)}
                spellCheck={false}
                autoComplete="off"
              />
            </div>
          )}
        </div>
        <button
          type="button"
          className={`${styles.perFileToggle} ${perFile ? styles.perFileOn : ''}`}
          aria-pressed={perFile}
          title={
            perFile
              ? `Run once per selected file (${selCount} selected) — %f is that file; without placeholders its name is appended`
              : 'Run once per selected file'
          }
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => useCmdlineStore.getState().setPerFile(!perFile)}
        >
          Each{perFile && selCount > 0 ? ` ×${selCount}` : ''}
        </button>
      </div>
    </>
  )
}
