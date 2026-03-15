import React, { useState, useCallback, useRef } from 'react'
import { useAppStore } from '../../stores/app-store'
import { usePanelStore } from '../../stores/panel-store'
import styles from '../../styles/commandline.module.css'

export function CommandLine(): React.JSX.Element {
  const [command, setCommand] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [output, setOutput] = useState<{ text: string; isError: boolean } | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const activePanel = useAppStore((s) => s.activePanel)
  const panelSlice = usePanelStore((s) => s[activePanel])
  const refresh = usePanelStore((s) => s.refresh)
  const activeTabId = panelSlice.activeTabId
  const tab = panelSlice.tabs.find((t) => t.id === activeTabId) || panelSlice.tabs[0]
  const cwd = tab?.locationDisplay || ''

  const runCommand = useCallback(
    async (cmd: string) => {
      if (!cmd.trim() || !cwd) return
      setIsRunning(true)
      setHistory((h) => [cmd, ...h.slice(0, 49)])
      setHistoryIndex(-1)

      try {
        const result = await window.api.util.runCommand(cmd, cwd)
        const text = (result.stdout + result.stderr).trim()
        if (text) {
          setOutput({ text, isError: result.code !== 0 })
        }
      } catch (err) {
        setOutput({ text: String(err), isError: true })
      }

      setIsRunning(false)
      setCommand('')
      // Refresh panels after command
      refresh('left')
      refresh('right')
    },
    [cwd, refresh]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        runCommand(command)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (history.length > 0) {
          const newIdx = Math.min(historyIndex + 1, history.length - 1)
          setHistoryIndex(newIdx)
          setCommand(history[newIdx])
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (historyIndex > 0) {
          const newIdx = historyIndex - 1
          setHistoryIndex(newIdx)
          setCommand(history[newIdx])
        } else {
          setHistoryIndex(-1)
          setCommand('')
        }
      } else if (e.key === 'Escape') {
        setOutput(null)
        inputRef.current?.blur()
      }
    },
    [command, history, historyIndex, runCommand]
  )

  // Short display of cwd
  const shortCwd = cwd.length > 30 ? '...' + cwd.slice(-27) : cwd

  return (
    <>
      {output && (
        <div className={styles.outputOverlay}>
          <button className={styles.closeOutput} onClick={() => setOutput(null)}>
            x
          </button>
          <pre className={`${styles.output} ${output.isError ? styles.outputError : ''}`}>
            {output.text}
          </pre>
        </div>
      )}
      <div className={styles.commandLine}>
        <span className={styles.prompt}>{shortCwd}&gt;</span>
        <input
          ref={inputRef}
          className={styles.input}
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isRunning ? 'Running...' : 'Type command...'}
          disabled={isRunning}
        />
      </div>
    </>
  )
}
