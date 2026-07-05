import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { resolve7zaBinaryPath } from '../main/plugins/archive/sevenz-binary'

describe('resolve7zaBinaryPath', () => {
  it('returns an existing 7za binary in development', () => {
    const binaryPath = resolve7zaBinaryPath()
    expect(path.isAbsolute(binaryPath)).toBe(true)
    expect(fs.statSync(binaryPath).isFile()).toBe(true)
    expect(binaryPath).not.toContain(`${path.sep}app.asar${path.sep}`)
  })
})