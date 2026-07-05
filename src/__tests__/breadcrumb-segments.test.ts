import { describe, it, expect } from 'vitest'
import { buildBreadcrumbSegments } from '../renderer/src/utils/breadcrumb-segments'

describe('breadcrumb-segments', () => {
  it('builds local filesystem segments from location id', () => {
    const segments = buildBreadcrumbSegments(
      'local-filesystem',
      '/home/user/docs',
      '/home/user/docs'
    )
    expect(segments.map((s) => s.locationId)).toEqual(['/', '/home', '/home/user', '/home/user/docs'])
  })

  it('builds archive segments with real location ids', () => {
    const segments = buildBreadcrumbSegments(
      'archive',
      'D:\\backup.zip::src/main/',
      '[backup.zip]/src/main'
    )
    expect(segments).toEqual([
      { label: '[backup.zip]', locationId: 'D:\\backup.zip::' },
      { label: 'src', locationId: 'D:\\backup.zip::src/' },
      { label: 'main', locationId: 'D:\\backup.zip::src/main/' }
    ])
  })

  it('builds sftp segments from conn::path ids', () => {
    const segments = buildBreadcrumbSegments(
      'sftp',
      'user@host:22::/home/user',
      'sftp://user@host:22/home/user'
    )
    expect(segments.map((s) => s.locationId)).toEqual([
      'user@host:22::/',
      'user@host:22::/home',
      'user@host:22::/home/user'
    ])
  })

  it('builds s3 prefix segments with trailing slashes', () => {
    const segments = buildBreadcrumbSegments(
      's3',
      'my-bucket::images/photos/',
      's3://my-bucket/images/photos/'
    )
    expect(segments.map((s) => s.locationId)).toEqual([
      'my-bucket::',
      'my-bucket::images/',
      'my-bucket::images/photos/'
    ])
  })

  it('builds smb segments from server/share/path ids', () => {
    const segments = buildBreadcrumbSegments(
      'smb',
      'user@host/share/docs/reports',
      'smb://host/share/docs/reports'
    )
    expect(segments.map((s) => s.locationId)).toEqual([
      'user@host',
      'user@host/share',
      'user@host/share/docs',
      'user@host/share/docs/reports'
    ])
  })
})