import { describe, it, expect } from 'vitest'
import {
  isArchivePath,
  parseArchivePath,
  joinArchivePath,
  toArchivePathForInternalFile
} from '../renderer/src/utils/archive-path'

describe('archive-path', () => {
  describe('isArchivePath', () => {
    it('recognizes archive paths containing `::`', () => {
      expect(isArchivePath('D:\\a.zip::inner/file.txt')).toBe(true)
      expect(isArchivePath('/home/user/a.zip::')).toBe(true)
    })

    it('rejects plain filesystem paths', () => {
      expect(isArchivePath('/home/user/file.txt')).toBe(false)
      expect(isArchivePath('C:\\Users\\file.txt')).toBe(false)
    })
  })

  describe('parseArchivePath', () => {
    it('splits an archive path into archive + internal', () => {
      expect(parseArchivePath('D:\\a.zip::sub/file.txt')).toEqual({
        archive: 'D:\\a.zip',
        internal: 'sub/file.txt'
      })
    })

    it('normalizes backslashes to forward slashes inside the archive', () => {
      expect(parseArchivePath('D:\\a.zip::sub\\file.txt').internal).toBe('sub/file.txt')
    })

    it('strips a leading slash from the internal path', () => {
      expect(parseArchivePath('D:\\a.zip::/folder/file').internal).toBe('folder/file')
    })

    it('returns empty internal for archive-root locations', () => {
      expect(parseArchivePath('D:\\a.zip::')).toEqual({ archive: 'D:\\a.zip', internal: '' })
    })

    it('returns the whole input as archive when `::` is absent', () => {
      expect(parseArchivePath('/home/a.zip')).toEqual({ archive: '/home/a.zip', internal: '' })
    })
  })

  describe('joinArchivePath', () => {
    it('rebuilds a location from parts and normalizes slashes', () => {
      expect(joinArchivePath('D:\\a.zip', 'sub\\file.txt')).toBe('D:\\a.zip::sub/file.txt')
    })

    it('drops a leading slash in the internal part', () => {
      expect(joinArchivePath('/a.zip', '/x/y')).toBe('/a.zip::x/y')
    })
  })

  describe('toArchivePathForInternalFile', () => {
    it('splits nested archive file destinations into dir + filename', () => {
      expect(toArchivePathForInternalFile('D:\\a.zip::folder/file.txt')).toEqual({
        destDir: 'D:\\a.zip::folder',
        destFileName: 'file.txt'
      })
    })

    it('handles files at the archive root', () => {
      expect(toArchivePathForInternalFile('D:\\a.zip::file.txt')).toEqual({
        destDir: 'D:\\a.zip::',
        destFileName: 'file.txt'
      })
    })

    it('handles backslash-separated internal paths from Windows callers', () => {
      expect(toArchivePathForInternalFile('D:\\a.zip::folder\\file.txt')).toEqual({
        destDir: 'D:\\a.zip::folder',
        destFileName: 'file.txt'
      })
    })
  })
})
