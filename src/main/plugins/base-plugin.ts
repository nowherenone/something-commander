import type { Entry, EntryAttributes } from '@shared/types'
import * as path from 'path'

/**
 * Shared entry-construction helpers used by every `BrowsePlugin`
 * implementation in the main process. Keeps attribute defaults, icon
 * hints and extension handling consistent across plugins.
 */

export const DEFAULT_ATTRS: EntryAttributes = {
  readonly: false,
  hidden: false,
  symlink: false
}

export function getExtension(name: string): string {
  return path.extname(name).slice(1).toLowerCase()
}

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp', 'ico'])
const VIDEO_EXTS = new Set([
  'mp4',
  'mkv',
  'avi',
  'mov',
  'webm',
  'm4v',
  'wmv',
  'flv',
  'mpg',
  'mpeg',
  '3gp',
  'ogv'
])
const AUDIO_EXTS = new Set([
  'mp3',
  'wav',
  'flac',
  'ogg',
  'oga',
  'm4a',
  'aac',
  'wma',
  'opus',
  'mid',
  'midi',
  'aiff'
])
/* Disk images mount like containers — they share the archive tint. */
const ARCHIVE_EXTS = new Set(['zip', 'tar', 'gz', 'bz2', '7z', 'rar', 'xz', 'iso', 'img', 'dmg'])
const CODE_EXTS = new Set([
  'ts',
  'tsx',
  'js',
  'jsx',
  'py',
  'rs',
  'go',
  'java',
  'c',
  'cpp',
  'h',
  'sh',
  'bash',
  'zsh',
  'fish',
  'ps1',
  'bat',
  'json',
  'yml',
  'yaml',
  'toml',
  'ini',
  'cfg',
  'conf',
  'env',
  'css',
  'scss',
  'less',
  'html',
  'htm',
  'xml',
  'sql',
  'rb',
  'php',
  'lua',
  'pl',
  'swift',
  'kt',
  'scala',
  'dart',
  'vue',
  'svelte',
  'ex',
  'exs',
  'erl',
  'clj',
  'proto'
])
const DOC_EXTS = new Set([
  'md',
  'txt',
  'pdf',
  'doc',
  'docx',
  'rtf',
  'csv',
  'xls',
  'xlsx',
  'ppt',
  'pptx'
])

export function iconHintForExtension(ext: string): string {
  if (IMAGE_EXTS.has(ext)) return 'image'
  if (VIDEO_EXTS.has(ext)) return 'video'
  if (AUDIO_EXTS.has(ext)) return 'audio'
  if (ARCHIVE_EXTS.has(ext)) return 'archive'
  if (CODE_EXTS.has(ext)) return 'code'
  if (DOC_EXTS.has(ext)) return 'document'
  return 'file'
}

interface DirEntryOptions {
  iconHint?: string
  hidden?: boolean
  readonly?: boolean
  symlink?: boolean
  meta?: Record<string, unknown>
}

export function makeDirectoryEntry(id: string, name: string, opts: DirEntryOptions = {}): Entry {
  return {
    id,
    name,
    isContainer: true,
    size: -1,
    modifiedAt: 0,
    mimeType: 'inode/directory',
    iconHint: opts.iconHint ?? 'folder',
    meta: opts.meta ?? {},
    attributes: {
      readonly: opts.readonly ?? false,
      hidden: opts.hidden ?? false,
      symlink: opts.symlink ?? false
    }
  }
}

interface FileEntryOptions {
  iconHint?: string
  ext?: string
  hidden?: boolean
  readonly?: boolean
  symlink?: boolean
  mimeType?: string
  meta?: Record<string, unknown>
}

export function makeFileEntry(
  id: string,
  name: string,
  size: number,
  modifiedAt: number,
  opts: FileEntryOptions = {}
): Entry {
  const ext = opts.ext ?? getExtension(name)
  const meta: Record<string, unknown> = opts.meta ? { ...opts.meta } : {}
  if (ext && meta.extension === undefined) meta.extension = ext
  return {
    id,
    name,
    isContainer: false,
    size,
    modifiedAt,
    mimeType: opts.mimeType ?? '',
    iconHint: opts.iconHint ?? iconHintForExtension(ext),
    meta,
    attributes: {
      readonly: opts.readonly ?? false,
      hidden: opts.hidden ?? false,
      symlink: opts.symlink ?? false
    }
  }
}
