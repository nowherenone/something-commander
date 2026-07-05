import { parseArchiveLocation } from './archive-path'

export interface BreadcrumbSegment {
  label: string
  /** Plugin location id to navigate to; null = plugin home/root. */
  locationId: string | null
}

export function buildBreadcrumbSegments(
  pluginId: string,
  locationId: string | null,
  locationDisplay: string
): BreadcrumbSegment[] {
  if (!locationId) {
    return [{ label: locationDisplay || 'Home', locationId: null }]
  }

  switch (pluginId) {
    case 'archive':
      return buildArchiveSegments(locationId, locationDisplay)
    case 'sftp':
      return buildSftpSegments(locationId, locationDisplay)
    case 's3':
      return buildS3Segments(locationId, locationDisplay)
    case 'smb':
      return buildSmbSegments(locationId, locationDisplay)
    default:
      return buildFilesystemSegments(locationId)
  }
}

function buildFilesystemSegments(locationId: string): BreadcrumbSegment[] {
  const isWin = /^[A-Za-z]:/.test(locationId)
  if (isWin) {
    const normalized = locationId.replace(/\//g, '\\')
    const parts = normalized.split('\\').filter(Boolean)
    const segments: BreadcrumbSegment[] = []
    let accumulated = ''
    for (let i = 0; i < parts.length; i++) {
      if (i === 0 && parts[0].endsWith(':')) {
        accumulated = parts[0] + '\\'
        segments.push({ label: parts[0], locationId: accumulated.slice(0, -1) })
      } else {
        accumulated += parts[i] + '\\'
        segments.push({ label: parts[i], locationId: accumulated.replace(/\\+$/, '') })
      }
    }
    return segments
  }

  const normalized = locationId.replace(/\\/g, '/')
  const parts = normalized.split('/').filter(Boolean)
  const segments: BreadcrumbSegment[] = [{ label: '/', locationId: '/' }]
  let acc = ''
  for (const part of parts) {
    acc += `/${part}`
    segments.push({ label: part, locationId: acc })
  }
  return segments
}

function buildArchiveSegments(locationId: string, locationDisplay: string): BreadcrumbSegment[] {
  const { archive, internal } = parseArchiveLocation(locationId)
  const archiveLabel = locationDisplay.startsWith('[')
    ? locationDisplay.slice(0, locationDisplay.indexOf(']') + 1)
    : `[${archive.split(/[\\/]/).pop() || archive}]`

  const segments: BreadcrumbSegment[] = [{ label: archiveLabel, locationId: `${archive}::` }]
  const parts = internal.replace(/\/$/, '').split('/').filter(Boolean)
  let prefix = ''
  for (const part of parts) {
    prefix += `${part}/`
    segments.push({ label: part, locationId: `${archive}::${prefix}` })
  }
  return segments
}

function buildSftpSegments(locationId: string, locationDisplay: string): BreadcrumbSegment[] {
  const sepIdx = locationId.indexOf('::')
  if (sepIdx < 0) return [{ label: locationDisplay, locationId }]

  const connId = locationId.slice(0, sepIdx)
  const remotePath = locationId.slice(sepIdx + 2) || '/'
  const rootLabel = locationDisplay.startsWith('sftp://')
    ? `sftp://${connId}`
    : connId

  const segments: BreadcrumbSegment[] = [{ label: rootLabel, locationId: `${connId}::/` }]
  const parts = remotePath.replace(/\/$/, '').split('/').filter(Boolean)

  let acc = ''
  for (const part of parts) {
    acc += `/${part}`
    segments.push({ label: part, locationId: `${connId}::${acc}` })
  }

  return segments
}

function buildS3Segments(locationId: string, locationDisplay: string): BreadcrumbSegment[] {
  const sepIdx = locationId.indexOf('::')
  if (sepIdx < 0) return [{ label: locationDisplay, locationId }]

  const connId = locationId.slice(0, sepIdx)
  const prefix = locationId.slice(sepIdx + 2)
  const bucket = locationDisplay.match(/^s3:\/\/([^/]+)/)?.[1] ?? connId
  const segments: BreadcrumbSegment[] = [{ label: `s3://${bucket}`, locationId: `${connId}::` }]

  const parts = prefix.replace(/\/$/, '').split('/').filter(Boolean)
  let acc = ''
  for (const part of parts) {
    acc += `${part}/`
    segments.push({ label: part, locationId: `${connId}::${acc}` })
  }

  return segments
}

function buildSmbSegments(locationId: string, locationDisplay: string): BreadcrumbSegment[] {
  const atIdx = locationId.indexOf('@')
  if (atIdx < 0) return [{ label: locationDisplay, locationId }]

  const firstSlash = locationId.indexOf('/', atIdx)
  if (firstSlash < 0) {
    return [{ label: locationDisplay, locationId }]
  }

  const serverId = locationId.slice(0, firstSlash)
  const rest = locationId.slice(firstSlash + 1)
  const slashInRest = rest.indexOf('/')
  const host = locationDisplay.match(/^smb:\/\/([^/]+)/)?.[1] ?? serverId.split('@')[1] ?? serverId

  if (slashInRest < 0) {
    return [
      { label: `smb://${host}`, locationId: serverId },
      { label: rest, locationId }
    ]
  }

  const share = rest.slice(0, slashInRest)
  const pathParts = rest.slice(slashInRest + 1).split('/').filter(Boolean)
  const displayParts = locationDisplay.replace(/^smb:\/\/[^/]+\/[^/]+\/?/, '').split('/').filter(Boolean)

  const segments: BreadcrumbSegment[] = [
    { label: `smb://${host}`, locationId: serverId },
    { label: share, locationId: `${serverId}/${share}` }
  ]

  let acc = ''
  for (let i = 0; i < pathParts.length; i++) {
    acc += (acc ? '/' : '') + pathParts[i]
    segments.push({
      label: displayParts[i] ?? pathParts[i],
      locationId: `${serverId}/${share}/${acc}`
    })
  }

  return segments
}