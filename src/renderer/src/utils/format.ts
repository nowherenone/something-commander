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
