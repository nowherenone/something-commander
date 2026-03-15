export interface EntryAttributes {
  readonly: boolean
  hidden: boolean
  symlink: boolean
}

/**
 * Universal entry produced by any BrowsePlugin.
 * Panels render arrays of these — nothing else.
 */
export interface Entry {
  /** Unique identifier within the current container. Opaque to renderer. */
  id: string

  /** Display name shown in the panel (e.g., "readme.md") */
  name: string

  /** If true, activating this entry navigates into it (like a directory) */
  isContainer: boolean

  /** Size in bytes. -1 if unknown/not applicable. */
  size: number

  /** Last modified timestamp in ms since epoch. 0 if unknown. */
  modifiedAt: number

  /** MIME type hint, e.g. "text/plain", "inode/directory". Empty if unknown. */
  mimeType: string

  /** Icon hint the renderer maps to a visual. Examples: "folder", "file", "archive", "drive" */
  iconHint: string

  /** Plugin-specific metadata. Renderer doesn't interpret this directly. */
  meta: Record<string, unknown>

  /** File attribute flags */
  attributes: EntryAttributes
}
