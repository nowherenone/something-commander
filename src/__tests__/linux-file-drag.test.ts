import { describe, expect, it } from 'vitest'
import { spawnSync } from 'child_process'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'

const script = path.resolve(__dirname, '../../resources/linux-file-drag.py')

describe('linux file drag payload', () => {
  it('offers a terminated URI and the real file bytes', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sc-drag-'))
    const file = path.join(dir, 'note.txt')
    const body = 'not empty\n'
    await fs.writeFile(file, body)
    try {
      const result = spawnSync('python3', [script, '--dump', file], { encoding: 'utf8' })
      expect(result.status).toBe(0)
      const payload = JSON.parse(result.stdout) as {
        uri_list: string
        plain: string
        gnome: string
        octet_len: number
        direct_save: boolean
      }
      expect(payload.uri_list).toBe(`file://${file}\r\n`)
      expect(payload.plain).toBe(file)
      expect(payload.gnome).toBe(`copy\nfile://${file}\n`)
      expect(payload.octet_len).toBe(Buffer.byteLength(body))
      expect(payload.direct_save).toBe(true)
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })
})
