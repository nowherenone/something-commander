/** Convert a hex-encoded string (each byte = 2 hex chars) into formatted hex dump lines. */
export function formatHexLines(hexString: string): string[] {
  const lines: string[] = []
  const bytesPerLine = 16
  for (let i = 0; i < hexString.length; i += bytesPerLine * 2) {
    const offset = (i / 2).toString(16).padStart(8, '0')
    const hexPart: string[] = []
    let asciiPart = ''
    for (let j = 0; j < bytesPerLine; j++) {
      const pos = i + j * 2
      if (pos < hexString.length) {
        const byte = hexString.slice(pos, pos + 2)
        hexPart.push(byte)
        const charCode = parseInt(byte, 16)
        asciiPart += charCode >= 32 && charCode <= 126 ? String.fromCharCode(charCode) : '.'
      } else {
        hexPart.push('  ')
        asciiPart += ' '
      }
    }
    lines.push(`${offset}  ${hexPart.join(' ')}  |${asciiPart}|`)
  }
  return lines
}
