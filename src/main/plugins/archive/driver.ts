import type { SourceAccess } from './plugin-reader'

/** Normalized archive entry - the common data model all drivers produce. */
export interface ArchiveEntry {
  /** Internal path within the archive. Directories MUST end with '/'. */
  path: string
  /** Uncompressed size in bytes (0 for directories). */
  size: number
  modifiedAt: Date
  isDirectory: boolean
}

/**
 * Format-specific implementation. ArchivePlugin routes all work through
 * the driver that matches the archive's file extension.
 *
 * All read methods accept a SourceAccess object instead of a file path.
 * This allows reading archives from any source (local FS, SMB, SFTP, S3,
 * or even nested inside another archive).
 *
 * Write methods still accept a local file path — writing to remote archives
 * is handled separately.
 */
export interface ArchiveDriver {
  /** File extensions this driver handles, e.g. ['.zip', '.jar']. */
  readonly extensions: readonly string[]
  /** Whether add/delete/rename/move operations are supported. */
  readonly supportsWrite: boolean

  /** Return all entries in the archive (metadata only, no content). */
  readEntries(source: SourceAccess): Promise<ArchiveEntry[]>

  /** Open a readable stream for a single file entry. Returns null if not found. */
  createReadStream(source: SourceAccess, entryPath: string): Promise<NodeJS.ReadableStream | null>

  /**
   * Extract entryPath to destDir on disk.
   * - entryPath='' → extract entire archive
   * - entryPath ending with '/' → extract that directory subtree
   * - otherwise → extract single file
   */
  extract(
    source: SourceAccess,
    entryPath: string,
    destDir: string
  ): Promise<{ success: boolean; error?: string; count: number }>

  // ── Write operations (only called when supportsWrite === true) ──────────────
  // Write operations still use local file paths since they modify archives on disk.

  /** Remove entries from the archive (files and/or directory trees). */
  deleteEntries?(archivePath: string, paths: string[]): Promise<void>

  /** Rename/move a single entry to a new internal path. */
  renameEntry?(archivePath: string, oldPath: string, newPath: string): Promise<void>

  /** Move entries to a new directory within the same archive. */
  moveEntries?(archivePath: string, srcPaths: string[], destInternalDir: string): Promise<void>

  /**
   * Write a file from a stream into the archive.
   * Creates the archive if it doesn't exist. Overwrites an existing entry at entryPath.
   */
  addFromStream?(
    archivePath: string,
    entryPath: string,
    stream: NodeJS.ReadableStream
  ): Promise<{ success: boolean; bytesWritten: number; error?: string }>
}
