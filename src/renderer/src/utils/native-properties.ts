import { isArchivePath } from './archive-path'

/**
 * Native OS properties only make sense for real local paths: not for plugin
 * filesystems (SFTP/SMB/S3/…) and not for entries inside an archive, which
 * the local plugin addresses as `archive.zip::inner/path`.
 */
export function canShowNativeProperties(pluginId: string | undefined, entryId: string | undefined): boolean {
  if (pluginId !== 'local-filesystem') return false
  if (!entryId) return false
  return !isArchivePath(entryId)
}

/** Open the native properties window; returns a toast message, or null when silent. */
export async function showNativeProperties(pluginId: string, entryId: string): Promise<string | null> {
  if (!canShowNativeProperties(pluginId, entryId)) {
    return 'Properties are only available for local files'
  }
  const result = await window.api.util.showFileProperties(entryId)
  if (!result.success) return result.error || 'Could not open file properties'
  if (result.fallback === 'showItemInFolder') {
    return 'No properties dialog available — revealed in file manager'
  }
  return null
}
