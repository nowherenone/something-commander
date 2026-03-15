import { filesize } from 'filesize'
import { format } from 'date-fns'

export function formatSize(bytes: number): string {
  if (bytes < 0) return ''
  if (bytes === 0) return '0 B'
  return filesize(bytes, { standard: 'si', spacer: ' ' }) as string
}

export function formatDate(timestamp: number): string {
  if (timestamp === 0) return ''
  return format(new Date(timestamp), 'yyyy-MM-dd HH:mm')
}
