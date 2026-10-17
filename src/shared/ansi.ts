/**
 * Minimal ANSI renderer model for the command output pane — no dependency,
 * no DOM. Handles SGR colors/attributes (16, 256 and truecolor), drops other
 * CSI/OSC sequences, and approximates carriage-return progress bars by
 * rewriting the current line. Input may arrive in arbitrary chunks: a
 * sequence split across chunks is buffered until it completes.
 */

export interface AnsiStyle {
  /** 0–15 = palette index (CSS class), string = CSS color. */
  fg?: number | string
  bg?: number | string
  bold?: boolean
  dim?: boolean
  italic?: boolean
  underline?: boolean
  inverse?: boolean
}

export interface Segment {
  text: string
  style: AnsiStyle
  /** Written to stderr (rendered in the error color when uncolored). */
  err?: boolean
}

const EMPTY: AnsiStyle = Object.freeze({})

/** xterm 256-color index → #rrggbb (indices 16–255). */
export function xterm256(n: number): string {
  const hex = (v: number): string => v.toString(16).padStart(2, '0')
  if (n >= 232) {
    const v = 8 + (n - 232) * 10
    return `#${hex(v)}${hex(v)}${hex(v)}`
  }
  const i = n - 16
  const steps = [0, 95, 135, 175, 215, 255]
  return `#${hex(steps[Math.floor(i / 36) % 6])}${hex(steps[Math.floor(i / 6) % 6])}${hex(steps[i % 6])}`
}

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, v | 0))
}

/** Apply one SGR parameter list to a style; returns a new object when changed. */
export function applySgr(style: AnsiStyle, params: number[]): AnsiStyle {
  let s: AnsiStyle = { ...style }
  if (params.length === 0) params = [0]
  for (let i = 0; i < params.length; i++) {
    const p = params[i]
    if (p === 0) s = {}
    else if (p === 1) s.bold = true
    else if (p === 2) s.dim = true
    else if (p === 3) s.italic = true
    else if (p === 4) s.underline = true
    else if (p === 7) s.inverse = true
    else if (p === 22) {
      delete s.bold
      delete s.dim
    } else if (p === 23) delete s.italic
    else if (p === 24) delete s.underline
    else if (p === 27) delete s.inverse
    else if (p >= 30 && p <= 37) s.fg = p - 30
    else if (p >= 90 && p <= 97) s.fg = p - 90 + 8
    else if (p === 39) delete s.fg
    else if (p >= 40 && p <= 47) s.bg = p - 40
    else if (p >= 100 && p <= 107) s.bg = p - 100 + 8
    else if (p === 49) delete s.bg
    else if (p === 38 || p === 48) {
      const key = p === 38 ? 'fg' : 'bg'
      if (params[i + 1] === 5 && i + 2 < params.length) {
        const n = params[i + 2]
        s[key] = n < 16 ? n : xterm256(Math.min(255, n))
        i += 2
      } else if (params[i + 1] === 2 && i + 4 < params.length) {
        const [r, g, b] = [params[i + 2], params[i + 3], params[i + 4]].map(clamp255)
        s[key] = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
        i += 4
      } else break
    }
  }
  return Object.keys(s).length === 0 ? EMPTY : s
}

export interface TerminalBufferOptions {
  /** Oldest lines are dropped past this count. */
  maxLines?: number
}

export class TerminalBuffer {
  lines: Segment[][] = [[]]
  /** Lines dropped from the top because of maxLines. */
  dropped = 0
  private style: AnsiStyle = EMPTY
  private pending = ''
  private cr = false
  private err = false
  private readonly maxLines: number

  constructor(opts: TerminalBufferOptions = {}) {
    this.maxLines = opts.maxLines ?? 10000
  }

  private get line(): Segment[] {
    return this.lines[this.lines.length - 1]
  }

  private put(text: string): void {
    if (!text) return
    if (this.cr) {
      // "\r" then text: overwrite the line (progress bars).
      this.lines[this.lines.length - 1] = []
      this.cr = false
    }
    const line = this.line
    const last = line[line.length - 1]
    if (last && last.style === this.style && !!last.err === this.err) last.text += text
    else line.push(this.err ? { text, style: this.style, err: true } : { text, style: this.style })
  }

  private newline(): void {
    this.cr = false
    this.lines.push([])
    if (this.lines.length > this.maxLines) {
      const extra = this.lines.length - this.maxLines
      this.lines.splice(0, extra)
      this.dropped += extra
    }
  }

  private backspace(): void {
    const line = this.line
    const last = line[line.length - 1]
    if (!last) return
    last.text = last.text.slice(0, -1)
    if (!last.text) line.pop()
  }

  /** Feed a decoded chunk; `stderr` marks it for the error color. */
  write(chunk: string, stderr = false): void {
    this.err = stderr
    const s = this.pending + chunk
    this.pending = ''
    let text = ''
    const flush = (): void => {
      this.put(text)
      text = ''
    }
    let i = 0
    while (i < s.length) {
      const ch = s[i]
      const code = s.charCodeAt(i)
      if (ch === '\x1b') {
        flush()
        if (i + 1 >= s.length) {
          this.pending = s.slice(i)
          return
        }
        const next = s[i + 1]
        if (next === '[') {
          // CSI: params (0x30–0x3F), intermediates (0x20–0x2F), final (0x40–0x7E)
          let j = i + 2
          while (j < s.length && s.charCodeAt(j) >= 0x20 && s.charCodeAt(j) <= 0x3f) j++
          if (j >= s.length) {
            this.pending = s.slice(i)
            return
          }
          const final = s[j]
          if (final === 'm') {
            const raw = s.slice(i + 2, j)
            const params = raw === '' ? [] : raw.split(/[;:]/).map((x) => (x === '' ? 0 : parseInt(x, 10) || 0))
            this.style = applySgr(this.style, params)
          } else if (final === 'K' && this.cr) {
            this.lines[this.lines.length - 1] = []
          }
          i = j + 1
          continue
        }
        if (next === ']') {
          // OSC … BEL | ESC \
          let j = i + 2
          let end = -1
          while (j < s.length) {
            if (s[j] === '\x07') {
              end = j + 1
              break
            }
            if (s[j] === '\x1b' && s[j + 1] === '\\') {
              end = j + 2
              break
            }
            j++
          }
          if (end < 0) {
            this.pending = s.slice(i)
            return
          }
          i = end
          continue
        }
        if (next === '(' || next === ')' || next === '#') {
          if (i + 2 >= s.length) {
            this.pending = s.slice(i)
            return
          }
          i += 3
          continue
        }
        i += 2 // other two-byte escapes (ESC =, ESC >, ESC 7 …)
        continue
      }
      if (ch === '\n') {
        flush()
        this.newline()
      } else if (ch === '\r') {
        flush()
        // CRLF is a plain newline; a lone CR rewinds the line (progress bars).
        if (s[i + 1] !== '\n') this.cr = true
      } else if (ch === '\b') {
        flush()
        this.backspace()
      } else if (ch === '\t' || code >= 0x20) {
        text += ch
      }
      i++
    }
    flush()
  }

  /** Plain text without styles (for copy / tests). */
  toPlainText(): string {
    return this.lines.map((l) => l.map((seg) => seg.text).join('')).join('\n')
  }

  get lineCount(): number {
    return this.lines.length
  }
}
