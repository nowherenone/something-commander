/**
 * Drives shipped copy/move destination helpers used by ConfirmOperation +
 * the operation queue (rename-on-copy for a single file).
 */
import { describe, expect, it } from 'vitest'
import {
  defaultCopyMoveDestPath,
  joinLocationPath,
  parseCopyMoveDestInput
} from '../renderer/src/utils/entry-helpers'
import { applyDestinationFileName } from '../renderer/src/services/file-operation-service'
import type { FileItem } from '../renderer/src/stores/operations-store'

describe('joinLocationPath / defaultCopyMoveDestPath', () => {
  it('joins with the host separator style', () => {
    expect(joinLocationPath('/home/out', 'a.txt')).toBe('/home/out/a.txt')
    expect(joinLocationPath('D:\\docs', 'a.txt')).toBe('D:\\docs\\a.txt')
  })

  it('single file gets full path; multi-item stays directory', () => {
    expect(
      defaultCopyMoveDestPath('/dest', [{ name: 'readme.txt', isContainer: false }])
    ).toBe('/dest/readme.txt')
    expect(
      defaultCopyMoveDestPath('/dest', [
        { name: 'a.txt', isContainer: false },
        { name: 'b.txt', isContainer: false }
      ])
    ).toBe('/dest')
    expect(
      defaultCopyMoveDestPath('/dest', [{ name: 'folder', isContainer: true }])
    ).toBe('/dest')
  })
})

describe('parseCopyMoveDestInput', () => {
  it('multi-item: field is directory only', () => {
    expect(
      parseCopyMoveDestInput('/out/sub/', { isSingleFile: false, originalFileName: '' })
    ).toEqual({ destDir: '/out/sub' })
  })

  it('single file: splits dir + renamed file name', () => {
    expect(
      parseCopyMoveDestInput('/out/copy-of-a.txt', {
        isSingleFile: true,
        originalFileName: 'a.txt'
      })
    ).toEqual({ destDir: '/out', destFileName: 'copy-of-a.txt' })

    expect(
      parseCopyMoveDestInput('D:\\docs\\renamed.md', {
        isSingleFile: true,
        originalFileName: 'note.md'
      })
    ).toEqual({ destDir: 'D:\\docs', destFileName: 'renamed.md' })
  })

  it('single file: trailing slash keeps original name', () => {
    expect(
      parseCopyMoveDestInput('/out/', {
        isSingleFile: true,
        originalFileName: 'a.txt'
      })
    ).toEqual({ destDir: '/out', destFileName: 'a.txt' })
  })

  it('same-folder rename is valid', () => {
    const parsed = parseCopyMoveDestInput('/work/a-copy.txt', {
      isSingleFile: true,
      originalFileName: 'a.txt'
    })
    expect(parsed.destDir).toBe('/work')
    expect(parsed.destFileName).toBe('a-copy.txt')
  })
})

describe('applyDestinationFileName (shipped service helper)', () => {
  it('rewrites the first file dest path and relative name', () => {
    const list: FileItem[] = [
      {
        sourcePath: '/src/a.txt',
        destPath: '/out/a.txt',
        size: 10,
        isDirectory: false,
        relativePath: 'a.txt'
      }
    ]
    const next = applyDestinationFileName(list, 'b.txt')
    expect(next[0].destPath).toBe('/out/b.txt')
    expect(next[0].relativePath).toBe('b.txt')
    expect(list[0].destPath).toBe('/out/a.txt') // pure — original untouched
  })

  it('no-ops when destinationFileName is omitted', () => {
    const list: FileItem[] = [
      {
        sourcePath: '/src/a.txt',
        destPath: '/out/a.txt',
        size: 1,
        isDirectory: false,
        relativePath: 'a.txt'
      }
    ]
    expect(applyDestinationFileName(list, undefined)).toBe(list)
  })
})
