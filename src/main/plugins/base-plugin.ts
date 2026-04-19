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
const ARCHIVE_EXTS = new Set(['zip', 'tar', 'gz', 'bz2', '7z', 'rar', 'xz'])
const CODE_EXTS = new Set(['ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'go', 'java', 'c', 'cpp', 'h'])
const DOC_EXTS = new Set(['md', 'txt', 'pdf', 'doc', 'docx', 'rtf'])

export function iconHintForExtension(ext: string): string {
  if (IMAGE_EXTS.has(ext)) return 'image'
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

export function makeDirectoryEntry(
  id: string,
  name: string,
  opts: DirEntryOptions = {}
): Entry {
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
