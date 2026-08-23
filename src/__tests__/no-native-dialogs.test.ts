import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

/**
 * UX plan F-09 / Phase 3 gate: "no native alert() remains (grep gate)".
 * Native alert()/confirm() windows break the app's custom-chrome personality
 * and can't be styled or captured. Everything user-facing goes through the
 * dialog primitives / toasts.
 */
const RENDERER_SRC = join(__dirname, '..', 'renderer', 'src')

function walkTs(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (name === 'node_modules') continue
      out.push(...walkTs(p))
    } else if (/\.tsx?$/.test(name)) {
      out.push(p)
    }
  }
  return out
}

describe('no native browser dialogs in renderer source', () => {
  it('never calls alert(), confirm(), or prompt()', () => {
    const offenders: string[] = []
    for (const file of walkTs(RENDERER_SRC)) {
      const src = readFileSync(file, 'utf8')
      // \b keeps matches like showToast( safe; allow commented-out lines.
      const lines = src.split('\n')
      lines.forEach((line, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return
        if (/\balert\s*\(|\bconfirm\s*\(|\bprompt\s*\(/.test(line)) {
          // `window.confirm(`, bare `alert(` etc. — but not our own named fns.
          if (!/(showConfirm|ConfirmDialog|onConfirm|confirmOperation|resolveOverwriteAction|\.confirm[A-Z])/.test(line)) {
            offenders.push(`${file.replace(RENDERER_SRC + '/', '')}:${i + 1}: ${line.trim()}`)
          }
        }
      })
    }
    expect(offenders, `Native dialogs found:\n${offenders.join('\n')}`).toEqual([])
  })
})
