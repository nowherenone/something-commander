import React from 'react'

/**
 * Single-weight inline-SVG entry icons (F-15).
 *
 * Replaces the emoji-based icon map: emoji rendering varies wildly across
 * platforms (color, weight, even presence) and cannot inherit text color.
 * Every glyph is drawn on a 24x24 grid, stroked at a fixed 1.6 weight with
 * `currentColor`, and sized in `em` so it tracks the font-size of whatever
 * span wraps it (list rows render at 14px).
 */

const GLYPHS: Record<string, React.ReactNode> = {
  folder: (
    <path d="M3 18.2V6.3c0-.72.58-1.3 1.3-1.3h4.9l2.2 2.4h8.3c.72 0 1.3.58 1.3 1.3v9.5c0 .72-.58 1.3-1.3 1.3H4.3c-.72 0-1.3-.58-1.3-1.3Z" />
  ),
  file: (
    <>
      <path d="M13.5 3H7.3C6.58 3 6 3.58 6 4.3v15.4c0 .72.58 1.3 1.3 1.3h9.4c.72 0 1.3-.58 1.3-1.3V7.5Z" />
      <path d="M13.5 3v3.2c0 .72.58 1.3 1.3 1.3H18" />
    </>
  ),
  image: (
    <>
      <rect x="3.5" y="4.75" width="17" height="14.5" rx="1.5" />
      <circle cx="9" cy="9.75" r="1.35" />
      <path d="m6.3 16.25 3.5-3.9 2.8 2.9 2.3-2.4 2.8 3.1" />
    </>
  ),
  video: (
    <>
      <rect x="3.25" y="5.25" width="17.5" height="13.5" rx="1.6" />
      <path d="M10.2 9.1 15.4 12l-5.2 2.9Z" />
    </>
  ),
  audio: (
    <>
      <circle cx="8.3" cy="17" r="2.1" />
      <circle cx="16.3" cy="15.2" r="2.1" />
      <path d="M10.4 17V6.9l8-1.6v9.9" />
    </>
  ),
  archive: (
    <>
      <rect x="4.75" y="4.75" width="14.5" height="14.5" rx="1.6" />
      <path d="M12 4.75v5.6" strokeDasharray="2.4 2" />
      <path d="M10.55 10.35h2.9l-.4 2.6h-2.1Z" />
      <path d="M12 12.95v6.3" strokeDasharray="2.4 2" />
    </>
  ),
  code: (
    <>
      <path d="M8.6 7.6 3.5 12l5.1 4.4" />
      <path d="m15.4 7.6 5.1 4.4-5.1 4.4" />
      <path d="M13.3 5.6 10.7 18.4" />
    </>
  ),
  document: (
    <>
      <path d="M13.5 3H7.3C6.58 3 6 3.58 6 4.3v15.4c0 .72.58 1.3 1.3 1.3h9.4c.72 0 1.3-.58 1.3-1.3V7.5Z" />
      <path d="M13.5 3v3.2c0 .72.58 1.3 1.3 1.3H18" />
      <path d="M9.25 9.75H12M9.25 13h5.5M9.25 16.25h5.5" />
    </>
  ),
  drive: (
    <>
      <ellipse cx="12" cy="6" rx="7.5" ry="2.75" />
      <path d="M4.5 6v12c0 1.52 3.36 2.75 7.5 2.75s7.5-1.23 7.5-2.75V6" />
      <path d="M4.5 12c0 1.52 3.36 2.75 7.5 2.75s7.5-1.23 7.5-2.75" />
    </>
  ),
  network: (
    <>
      <circle cx="12" cy="12" r="8.25" />
      <ellipse cx="12" cy="12" rx="3.7" ry="8.25" />
      <path d="M3.75 12h16.5" />
    </>
  )
}

function normalizeHint(hint: string): string {
  return hint === 'hard-drive' ? 'drive' : hint
}

export function EntryIcon({ hint }: { hint: string }): React.JSX.Element {
  const glyph = GLYPHS[normalizeHint(hint)] ?? GLYPHS.file
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ verticalAlign: '-0.15em', flexShrink: 0 }}
    >
      {glyph}
    </svg>
  )
}
