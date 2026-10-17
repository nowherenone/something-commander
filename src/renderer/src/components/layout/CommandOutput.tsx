import React, { useLayoutEffect, useRef, useCallback } from 'react'
import type { AnsiStyle, Segment, TerminalBuffer } from '@shared/ansi'
import styles from '../../styles/commandline.module.css'

export interface RunView {
  /** The command as run (after placeholder expansion). */
  title: string
  state: 'running' | 'ok' | 'failed' | 'stopped'
  /** Exit status / error line; null on clean success. */
  status: string | null
  /** "3/10 photo.jpg" during per-file runs. */
  progress?: string | null
}

interface Props {
  view: RunView
  buffer: TerminalBuffer
  /** Bumped whenever the buffer changes. */
  version: number
  height: number
  onResize: (height: number, commit: boolean) => void
  onStop: () => void
  onClose: () => void
}

function segStyle(seg: Segment): { className: string; style?: React.CSSProperties } {
  const s: AnsiStyle = seg.style
  const cls: string[] = []
  const css: React.CSSProperties = {}
  let fg = s.fg
  let bg = s.bg
  if (s.inverse) [fg, bg] = [bg ?? 'inv-bg', fg ?? 'inv-fg']
  if (typeof fg === 'number') cls.push(styles[`ansiFg${fg}`])
  else if (fg === 'inv-fg') cls.push(styles.ansiInvFg)
  else if (fg) css.color = fg
  if (typeof bg === 'number') cls.push(styles[`ansiBg${bg}`])
  else if (bg === 'inv-bg') cls.push(styles.ansiInvBg)
  else if (bg) css.backgroundColor = bg
  if (s.bold) cls.push(styles.ansiBold)
  if (s.dim) cls.push(styles.ansiDim)
  if (s.italic) cls.push(styles.ansiItalic)
  if (s.underline) cls.push(styles.ansiUnderline)
  if (seg.err && fg === undefined) cls.push(styles.stderr)
  return { className: cls.join(' '), style: Object.keys(css).length ? css : undefined }
}

/** Docked, resizable output pane with ANSI colors and a Stop button. */
export function CommandOutput({ view, buffer, version, height, onResize, onStop, onClose }: Props): React.JSX.Element {
  const bodyRef = useRef<HTMLPreElement>(null)
  const stick = useRef(true)

  // Follow the tail unless the user scrolled up.
  useLayoutEffect(() => {
    const el = bodyRef.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [version])

  const onScroll = useCallback(() => {
    const el = bodyRef.current
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
  }, [])

  const startDrag = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const startY = e.clientY
      const startH = height
      const clamp = (h: number): number => Math.round(Math.max(60, Math.min(window.innerHeight * 0.75, h)))
      const move = (ev: MouseEvent): void => onResize(clamp(startH + (startY - ev.clientY)), false)
      const up = (ev: MouseEvent): void => {
        window.removeEventListener('mousemove', move)
        window.removeEventListener('mouseup', up)
        onResize(clamp(startH + (startY - ev.clientY)), true)
      }
      window.addEventListener('mousemove', move)
      window.addEventListener('mouseup', up)
    },
    [height, onResize]
  )

  const failed = view.state === 'failed' || view.state === 'stopped'
  return (
    <div className={styles.outputPane} style={{ height }} data-testid="cmdline-output" data-state={view.state}>
      <div
        className={styles.resizeHandle}
        onMouseDown={startDrag}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize command output"
      />
      <div className={styles.outputHeader}>
        <span className={styles.outputTitle} title={view.title}>
          {view.state === 'running' && <span className={styles.spinner} aria-hidden />}
          {view.title}
        </span>
        {view.progress && <span className={styles.outputProgress}>{view.progress}</span>}
        {view.status && (
          <span className={`${styles.outputStatus} ${failed ? styles.outputError : ''}`}>{view.status}</span>
        )}
        {buffer.dropped > 0 && <span className={styles.outputProgress}>{buffer.dropped} earlier lines dropped</span>}
        <span className={styles.outputSpacer} />
        {view.state === 'running' && (
          <button className={styles.stopButton} onClick={onStop} title="Stop (Ctrl+C in the command line)">
            Stop
          </button>
        )}
        <button className={styles.closeOutput} onClick={onClose} aria-label="Close command output">
          x
        </button>
      </div>
      <pre className={styles.outputBody} ref={bodyRef} onScroll={onScroll} data-version={version}>
        {buffer.lines.map((line, i) => (
          <div key={i + buffer.dropped} className={styles.outputLine}>
            {line.length === 0
              ? '\u200b'
              : line.map((seg, j) => {
                  const p = segStyle(seg)
                  return (
                    <span key={j} className={p.className || undefined} style={p.style}>
                      {seg.text}
                    </span>
                  )
                })}
          </div>
        ))}
      </pre>
    </div>
  )
}
