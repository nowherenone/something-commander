import { filesize } from 'filesize'
import { format } from 'date-fns'

export type SizeFormat = 'full' | 'short'

export function formatSize(bytes: number, sizeFormat: SizeFormat = 'short'): string {
  if (bytes < 0) return ''
  if (bytes === 0) return '0'
  if (sizeFormat === 'full') {
    return bytes.toLocaleString()
  }
  return filesize(bytes, { standard: 'si', spacer: ' ', round: 0 }) as string
}

export function formatDate(timestamp: number, dateFormat = 'yyyy-MM-dd HH:mm'): string {
  if (timestamp === 0) return ''
  return format(new Date(timestamp), dateFormat)
}

/**
 * Transfer speed as "N B/s" / "1.2 MB/s". Empty string until a measurable
 * number of bytes has moved, so near-zero speeds never render as "0 B/s".
 */
export function formatSpeed(bytesPerSec: number): string {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec < 1) return ''
  return `${formatSize(Math.round(bytesPerSec))}/s`
}

/** Longest ETA we will print before clamping (~100 minutes). */
export const MAX_ETA_SECONDS = 99 * 60 + 59

function formatEtaSeconds(secs: number): string {
  const clamped = Math.max(0, Math.min(secs, MAX_ETA_SECONDS))
  if (clamped < 60) return `~${Math.round(clamped)}s`
  return `~${Math.floor(clamped / 60)}m${Math.round(clamped % 60)}s`
}

/**
 * Estimated time remaining, or '' while the estimate is meaningless (no
 * bytes moved yet, speed below ~1 B/s). Speeds that would imply absurd
 * horizons clamp to ~99m59s instead of printing multi-year estimates.
 */
export function formatEta(bytes: number, totalBytes: number, elapsedMs: number): string {
  if (bytes <= 0 || elapsedMs <= 1000 || totalBytes <= 0 || totalBytes <= bytes) return ''
  const bps = (bytes / elapsedMs) * 1000
  if (!Number.isFinite(bps) || bps < 1) return ''
  const remaining = totalBytes - bytes
  const secs = remaining / bps
  if (!Number.isFinite(secs)) return ''
  return formatEtaSeconds(secs)
}
