/**
 * Editor/viewer windows are opened with `pluginId|entryId` (see viewer-ipc).
 */

export interface ParsedEditorPath {
  /** True when the window was opened with pluginId|entryId */
  usePlugin: boolean
  pluginId: string
  /** Real entry id (local path, sftp conn::path, archive.zip::internal, …) */
  entryId: string
}

export function parseEditorPath(filePath: string): ParsedEditorPath {
  const sep = filePath.indexOf('|')
  if (sep > 0) {
    return {
      usePlugin: true,
      pluginId: filePath.slice(0, sep),
      entryId: filePath.slice(sep + 1)
    }
  }
  // Plain path → treat as local filesystem for save
  return { usePlugin: false, pluginId: 'local-filesystem', entryId: filePath }
}

/**
 * Resolve plugin + entry for save. Every plugin that implements writeFromStream
 * can be targeted; unsupported cases return an error string.
 */
export function resolveEditorSaveTarget(
  filePath: string
): { pluginId: string; entryId: string } | { error: string } {
  const { pluginId, entryId } = parseEditorPath(filePath)

  if (!entryId) {
    return { error: 'No file path to save' }
  }
  if (!pluginId) {
    return { error: 'Unknown data source for this file' }
  }
  // Directory-looking targets
  if (entryId.endsWith('/') || entryId.endsWith('\\')) {
    return { error: 'Cannot save a directory as a file' }
  }

  return { pluginId, entryId }
}
