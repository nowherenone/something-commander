import { describe, it, expect } from 'vitest'
import { TerminalBuffer, applySgr, xterm256 } from '../shared/ansi'

const ESC = '\x1b'

describe('applySgr', () => {
  it('basic colors and attributes', () => {
    expect(applySgr({}, [31])).toEqual({ fg: 1 })
    expect(applySgr({}, [1, 92, 44])).toEqual({ bold: true, fg: 10, bg: 4 })
    expect(applySgr({ fg: 1, bold: true }, [0])).toEqual({})
    expect(applySgr({ fg: 1, bold: true }, [22, 39])).toEqual({})
  })
  it('256 and truecolor', () => {
    expect(applySgr({}, [38, 5, 3])).toEqual({ fg: 3 })
    expect(applySgr({}, [38, 5, 196])).toEqual({ fg: '#ff0000' })
    expect(applySgr({}, [48, 2, 1, 2, 300])).toEqual({ bg: '#0102ff' })
  })
  it('xterm grayscale ramp', () => {
    expect(xterm256(232)).toBe('#080808')
    expect(xterm256(255)).toBe('#eeeeee')
  })
})

describe('TerminalBuffer', () => {
  it('splits lines and styles', () => {
    const b = new TerminalBuffer()
    b.write(`plain ${ESC}[31mred${ESC}[0m done\nnext`)
    expect(b.lines).toHaveLength(2)
    expect(b.lines[0].map((s) => [s.text, s.style.fg])).toEqual([
      ['plain ', undefined],
      ['red', 1],
      [' done', undefined]
    ])
    expect(b.toPlainText()).toBe('plain red done\nnext')
  })

  it('handles sequences split across chunks', () => {
    const b = new TerminalBuffer()
    b.write(`a${ESC}`)
    b.write('[3')
    b.write('2mgreen')
    expect(b.toPlainText()).toBe('agreen')
    expect(b.lines[0][1]).toMatchObject({ text: 'green', style: { fg: 2 } })
  })

  it('drops non-SGR CSI and OSC sequences', () => {
    const b = new TerminalBuffer()
    b.write(`${ESC}]0;title${'\x07'}x${ESC}[2Jy${ESC}[?25lz${ESC}]8;;http://a${ESC}\\link`)
    expect(b.toPlainText()).toBe('xyzlink')
  })

  it('carriage return rewrites the line (progress bars), CRLF is a newline', () => {
    const b = new TerminalBuffer()
    b.write('10%\r50%\r100%\ndone\r\nok')
    expect(b.toPlainText()).toBe('100%\ndone\nok')
  })

  it('backspace and stray control chars', () => {
    const b = new TerminalBuffer()
    b.write('abc\b\bX\x07\x00Y')
    expect(b.toPlainText()).toBe('aXY')
  })

  it('marks stderr segments', () => {
    const b = new TerminalBuffer()
    b.write('out ')
    b.write('err', true)
    expect(b.lines[0].map((s) => !!s.err)).toEqual([false, true])
  })

  it('caps lines', () => {
    const b = new TerminalBuffer({ maxLines: 3 })
    b.write('1\n2\n3\n4\n5')
    expect(b.toPlainText()).toBe('3\n4\n5')
    expect(b.dropped).toBe(2)
  })
})
