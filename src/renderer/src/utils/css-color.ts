/**
 * Normalize any CSS color expression into a `#RRGGBB` string so HTML
 * `<input type="color">` can display it. Returns '#000000' if unparseable.
 */
export function cssColorToHex(color: string): string {
  if (!color) return '#000000'
  const c = color.trim()
  if (c.startsWith('#')) {
    if (c.length === 4) {
      // #abc → #aabbcc
      return (
        '#' +
        c
          .slice(1)
          .split('')
          .map((ch) => ch + ch)
          .join('')
          .toLowerCase()
      )
    }
    return c.slice(0, 7).toLowerCase()
  }
  const rgb = c.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (rgb) {
    const hex = (n: string): string => parseInt(n, 10).toString(16).padStart(2, '0')
    return `#${hex(rgb[1])}${hex(rgb[2])}${hex(rgb[3])}`
  }
  return '#000000'
}
