/**
 * Pure helpers for the "smart" command line: completion token math, fuzzy
 * history search and %-placeholders. Unit-tested; no DOM, no Node.
 */
import { quoteArg, type ShellKind } from './cmdline'

// ── Token under the caret ─────────────────────────────────────────────────

export interface TokenSpan {
  /** Offsets into the line (end exclusive), including any quotes. */
  start: number
  end: number
  /** Dequoted text of the token up to the caret. */
  value: string
  /** 0 = command position. */
  index: number
}

/**
 * Find the word the caret is in (or an empty word at the caret). Quote and
 * escape rules match `tokenize` in ./cmdline.
 */
export function tokenAtCaret(line: string, caret: number, windows: boolean): TokenSpan {
  let index = 0
  let i = 0
  const n = line.length
  while (i < n) {
    while (i < n && (line[i] === ' ' || line[i] === '\t')) i++
    if (i >= n || i > caret) break
    const start = i
    let value = ''
    let quote: string | null = null
    while (i < n) {
      const ch = line[i]
      if (!quote && (ch === ' ' || ch === '\t')) break
      if (quote) {
        if (ch === quote) quote = null
        else if (i < caret) value += ch
      } else if (ch === '"' || ch === "'") quote = ch
      else if (ch === '\\' && !windows && i + 1 < n) {
        if (i < caret) value += line[i + 1]
        i++
      } else if (i < caret) value += ch
      i++
    }
    if (caret >= start && caret <= i) return { start, end: i, value, index }
    index++
  }
  return { start: caret, end: caret, value: '', index }
}

/** Split a partial path into the typed directory part (with its separator) and the base. */
export function splitPartialPath(value: string, windows: boolean): { dirPart: string; base: string } {
  const at = windows ? Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\')) : value.lastIndexOf('/')
  if (at < 0) return { dirPart: '', base: value }
  return { dirPart: value.slice(0, at + 1), base: value.slice(at + 1) }
}

/** Quote a path for the shell but keep a leading "~/" unquoted so it still expands. */
export function quotePath(p: string, kind: ShellKind): string {
  const m = /^~[\\/]/.exec(p)
  if (m) {
    const rest = p.slice(2)
    return rest ? `${p.slice(0, 2)}${quoteArg(rest, kind)}` : p.slice(0, 2)
  }
  return quoteArg(p, kind)
}

/**
 * Text that replaces the token when a completion is accepted. Folders end
 * with the separator (no space, so Tab can continue); files and commands
 * end with a space.
 */
export function completionText(full: string, isDir: boolean, kind: ShellKind, sep: string): string {
  const q = quotePath(full, kind)
  if (!isDir) return `${q} `
  if (kind === 'powershell' && q.endsWith("'") && q !== full) return `${q.slice(0, -1)}${sep}'`
  return q + sep
}

/** Longest common prefix (optionally case-folded; returns the first item's casing). */
export function commonPrefix(items: readonly string[], fold = false): string {
  if (items.length === 0) return ''
  let p = items[0]
  for (const s of items.slice(1)) {
    let i = 0
    while (i < p.length && i < s.length && (fold ? p[i].toLowerCase() === s[i].toLowerCase() : p[i] === s[i])) i++
    p = p.slice(0, i)
    if (!p) break
  }
  return p
}

// ── Fuzzy history search (Ctrl+R) ─────────────────────────────────────────

export interface FuzzyHit {
  score: number
  /** Indexes in the candidate that matched, for highlighting. */
  positions: number[]
}

const WORD_START = /[\s/\\\-_.:=]/

/** Case-insensitive subsequence match with bonuses for runs and word starts. */
export function fuzzyMatch(query: string, text: string): FuzzyHit | null {
  const q = query.toLowerCase().trim()
  if (!q) return { score: 0, positions: [] }
  const t = text.toLowerCase()
  const lengthPenalty = text.length * 0.01

  // A contiguous occurrence beats any scattered match; prefer word starts.
  let best = -1
  let bestBonus = -1
  for (let at = t.indexOf(q); at >= 0; at = t.indexOf(q, at + 1)) {
    const bonus = at === 0 ? 8 : WORD_START.test(text[at - 1]) ? 3 : 0
    if (bonus > bestBonus) {
      best = at
      bestBonus = bonus
    }
  }
  if (best >= 0) {
    return {
      score: q.length * 6 + 10 + bestBonus - lengthPenalty,
      positions: Array.from({ length: q.length }, (_, k) => best + k)
    }
  }

  const positions: number[] = []
  let score = 0
  let ti = 0
  let prev = -2
  for (const ch of q) {
    if (ch === ' ') continue
    const found = t.indexOf(ch, ti)
    if (found < 0) return null
    positions.push(found)
    score += 1
    if (found === prev + 1) score += 5
    if (found === 0 || WORD_START.test(text[found - 1])) score += 3
    prev = found
    ti = found + 1
  }
  return { score: score - lengthPenalty, positions }
}

/** Filter + rank; ties keep the original (recency) order. */
export function fuzzyFilter(items: readonly string[], query: string, limit = 50): Array<{ item: string } & FuzzyHit> {
  const hits: Array<{ item: string; idx: number } & FuzzyHit> = []
  items.forEach((item, idx) => {
    const h = fuzzyMatch(query, item)
    if (h) hits.push({ item, idx, ...h })
  })
  if (query.trim()) hits.sort((a, b) => b.score - a.score || a.idx - b.idx)
  return hits.slice(0, limit).map(({ item, score, positions }) => ({ item, score, positions }))
}

// ── Placeholders ──────────────────────────────────────────────────────────

export interface PlaceholderContext {
  /** Name of the file under the cursor (%f). */
  cursorName: string | null
  /** Full paths of the selection, or the cursor file when nothing is selected (%F, %s). */
  selectedPaths: string[]
  /** Active panel directory (%p). */
  panelPath: string | null
  /** Other panel directory (%P). */
  otherPanelPath: string | null
}

export interface Expansion {
  text: string
  /** Placeholders that were expanded, e.g. ['%f', '%P']. */
  used: string[]
  /** Placeholders with no value (nothing under the cursor, non-local panel …). */
  missing: string[]
}

/**
 * Placeholders only count as whole words (`vim %f`, `cp %F %P`), so
 * `date +%F`, `printf "%s"` and `%PATH%` pass through untouched. A doubled
 * percent (`%%f`) is the literal text `%f`.
 */
const PLACEHOLDER = /(^|[\s])(%%?)([fFsPp])(?=\s|$)/g

export function hasPlaceholders(line: string): boolean {
  PLACEHOLDER.lastIndex = 0
  for (const m of line.matchAll(PLACEHOLDER)) if (m[2] === '%') return true
  return false
}

export function expandPlaceholders(line: string, ctx: PlaceholderContext, kind: ShellKind): Expansion {
  const used: string[] = []
  const missing: string[] = []
  const q = (s: string): string => quoteArg(s, kind)
  const text = line.replace(PLACEHOLDER, (_all, lead: string, pct: string, letter: string) => {
    const ph = `%${letter}`
    if (pct === '%%') return `${lead}${ph}`
    let value: string | null = null
    if (letter === 'f') value = ctx.cursorName !== null ? q(ctx.cursorName) : null
    else if (letter === 'F' || letter === 's')
      value = ctx.selectedPaths.length > 0 ? ctx.selectedPaths.map(q).join(' ') : null
    else if (letter === 'p') value = ctx.panelPath !== null ? q(ctx.panelPath) : null
    else if (letter === 'P') value = ctx.otherPanelPath !== null ? q(ctx.otherPanelPath) : null
    if (value === null) {
      if (!missing.includes(ph)) missing.push(ph)
      return `${lead}${ph}`
    }
    if (!used.includes(ph)) used.push(ph)
    return `${lead}${value}`
  })
  return { text, used, missing }
}
