import { describe, it, expect } from 'vitest'
import {
  detectShellKind,
  quoteArg,
  tokenize,
  parseCommandLine,
  singleWord,
  normalizePath,
  resolveLocalCd,
  resolveInnerCd,
  innerStyleFor,
  isLocalDirectory,
  pushHistory,
  insertWithSpacing,
  matchBookmark,
  HISTORY_CAP
} from '../shared/cmdline'

describe('detectShellKind', () => {
  it('classifies common shells', () => {
    expect(detectShellKind('/bin/bash', 'linux')).toBe('posix')
    expect(detectShellKind('/usr/bin/zsh', 'darwin')).toBe('posix')
    expect(detectShellKind('powershell', 'win32')).toBe('powershell')
    expect(detectShellKind('C:\\Program Files\\PowerShell\\7\\pwsh.exe', 'win32')).toBe('powershell')
    expect(detectShellKind('cmd.exe', 'win32')).toBe('cmd')
    expect(detectShellKind('C:\\Windows\\System32\\CMD.EXE', 'win32')).toBe('cmd')
  })
  it('blank falls back to the platform default', () => {
    expect(detectShellKind('', 'win32')).toBe('powershell')
    expect(detectShellKind(undefined, 'linux')).toBe('posix')
  })
})

describe('quoteArg', () => {
  it('leaves plain names alone', () => {
    expect(quoteArg('readme.md', 'posix')).toBe('readme.md')
    expect(quoteArg('/usr/local/bin', 'posix')).toBe('/usr/local/bin')
    expect(quoteArg('C:\\Users\\me', 'powershell')).toBe('C:\\Users\\me')
    expect(quoteArg('C:\\Users\\me', 'cmd')).toBe('C:\\Users\\me')
  })
  it('posix: single quotes, embedded quote escaped', () => {
    expect(quoteArg('my file.txt', 'posix')).toBe("'my file.txt'")
    expect(quoteArg("it's", 'posix')).toBe("'it'\\''s'")
    expect(quoteArg('$HOME', 'posix')).toBe("'$HOME'")
    expect(quoteArg('a*b', 'posix')).toBe("'a*b'")
    expect(quoteArg('~x', 'posix')).toBe("'~x'")
  })
  it('powershell: single quotes doubled, leading dash quoted', () => {
    expect(quoteArg('My Docs', 'powershell')).toBe("'My Docs'")
    expect(quoteArg("O'Brien.txt", 'powershell')).toBe("'O''Brien.txt'")
    expect(quoteArg('-rf', 'powershell')).toBe("'-rf'")
    expect(quoteArg('$env:x', 'powershell')).toBe("'$env:x'")
    expect(quoteArg('a\u2019b c', 'powershell')).toBe("'a\u2019\u2019b c'")
  })
  it('cmd: double quotes', () => {
    expect(quoteArg('Program Files', 'cmd')).toBe('"Program Files"')
    expect(quoteArg('a&b', 'cmd')).toBe('"a&b"')
    expect(quoteArg('100%', 'cmd')).toBe('"100%"')
  })
  it('empty string', () => {
    expect(quoteArg('', 'posix')).toBe("''")
    expect(quoteArg('', 'cmd')).toBe('""')
  })
})

describe('tokenize', () => {
  it('splits on whitespace and honours quotes', () => {
    expect(tokenize('cd  "my dir"').tokens).toEqual(['cd', 'my dir'])
    expect(tokenize("cd 'a b'/c").tokens).toEqual(['cd', 'a b/c'])
    expect(tokenize('echo "a\\"b"').tokens).toEqual(['echo', 'a"b'])
  })
  it('backslash escapes on posix only', () => {
    expect(tokenize('cd my\\ dir').tokens).toEqual(['cd', 'my dir'])
    expect(tokenize('cd C:\\Users\\me', { windows: true }).tokens).toEqual(['cd', 'C:\\Users\\me'])
  })
  it('flags unterminated quotes', () => {
    expect(tokenize('cd "oops').unterminated).toBe(true)
    expect(tokenize('cd "ok"').unterminated).toBe(false)
  })
  it('flags shell syntax outside quotes', () => {
    expect(tokenize('ls | wc -l').hasShellSyntax).toBe(true)
    expect(tokenize('cd foo && make').hasShellSyntax).toBe(true)
    expect(tokenize('echo $HOME').hasShellSyntax).toBe(true)
    expect(tokenize('ls *.txt').hasShellSyntax).toBe(true)
    expect(tokenize('echo "a|b"').hasShellSyntax).toBe(false)
    expect(tokenize("echo '$HOME'").hasShellSyntax).toBe(false)
    expect(tokenize('echo "$HOME"').hasShellSyntax).toBe(true)
    expect(tokenize('cd %USERPROFILE%', { windows: true }).hasShellSyntax).toBe(true)
  })
  it('empty quotes produce an empty token', () => {
    expect(tokenize('mkdir ""').tokens).toEqual(['mkdir', ''])
  })
})

describe('parseCommandLine', () => {
  it('recognizes built-ins', () => {
    expect(parseCommandLine('cd ..', 'linux')).toEqual({ kind: 'builtin', name: 'cd', args: ['..'] })
    expect(parseCommandLine('cd', 'linux')).toEqual({ kind: 'builtin', name: 'cd', args: [] })
    expect(parseCommandLine('mkdir "new folder"', 'linux')).toEqual({ kind: 'builtin', name: 'mkdir', args: ['new folder'] })
    expect(parseCommandLine('md x', 'win32')).toEqual({ kind: 'builtin', name: 'mkdir', args: ['x'] })
    expect(parseCommandLine('j my proj', 'linux')).toEqual({ kind: 'builtin', name: 'j', args: ['my', 'proj'] })
  })
  it('DOS shorthands and /d', () => {
    expect(parseCommandLine('cd..', 'win32')).toEqual({ kind: 'builtin', name: 'cd', args: ['..'] })
    expect(parseCommandLine('cd\\', 'win32')).toEqual({ kind: 'builtin', name: 'cd', args: ['\\'] })
    expect(parseCommandLine('CD /d D:\\work', 'win32')).toEqual({ kind: 'builtin', name: 'cd', args: ['D:\\work'] })
    expect(parseCommandLine('cd C:\\Program Files', 'win32')).toEqual({
      kind: 'builtin',
      name: 'cd',
      args: ['C:\\Program Files']
    })
  })
  it('built-in names are case-sensitive on posix', () => {
    expect(parseCommandLine('CD ..', 'linux').kind).toBe('shell')
  })
  it('passes shell syntax, flags and extra args through', () => {
    expect(parseCommandLine('cd foo && make', 'linux').kind).toBe('shell')
    expect(parseCommandLine('mkdir -p a/b', 'linux').kind).toBe('shell')
    expect(parseCommandLine('mkdir a b', 'linux').kind).toBe('shell')
    expect(parseCommandLine('cd a b', 'linux').kind).toBe('shell')
    expect(parseCommandLine('cd -P x', 'linux').kind).toBe('shell')
    expect(parseCommandLine('ls -la', 'linux')).toEqual({ kind: 'shell', command: 'ls -la', forced: false })
  })
  it('keeps `cd -`', () => {
    expect(parseCommandLine('cd -', 'linux')).toEqual({ kind: 'builtin', name: 'cd', args: ['-'] })
  })
  it('! forces the shell', () => {
    expect(parseCommandLine('!cd /tmp', 'linux')).toEqual({ kind: 'shell', command: 'cd /tmp', forced: true })
    expect(parseCommandLine('!', 'linux')).toEqual({ kind: 'empty' })
  })
  it('empty', () => {
    expect(parseCommandLine('   ', 'linux')).toEqual({ kind: 'empty' })
  })
})

describe('singleWord', () => {
  it('returns the only word', () => {
    expect(singleWord('notes.txt', 'linux')).toBe('notes.txt')
    expect(singleWord('"my notes.txt"', 'linux')).toBe('my notes.txt')
    expect(singleWord('ls -l', 'linux')).toBeNull()
    expect(singleWord('a|b', 'linux')).toBeNull()
  })
})

describe('normalizePath', () => {
  it('posix', () => {
    expect(normalizePath('/a/b/../c/./d//', false)).toBe('/a/c/d')
    expect(normalizePath('/..', false)).toBe('/')
    expect(normalizePath('a/../..', false)).toBe('..')
  })
  it('windows', () => {
    expect(normalizePath('c:/Users/me/../you', true)).toBe('C:\\Users\\you')
    expect(normalizePath('C:\\..', true)).toBe('C:\\')
    expect(normalizePath('\\\\srv\\share\\a\\..\\b', true)).toBe('\\\\srv\\share\\b')
  })
})

describe('resolveLocalCd', () => {
  const posix = { platform: 'linux', cwd: '/home/me/src', home: '/home/me', previous: '/tmp' }
  const win = { platform: 'win32', cwd: 'C:\\Users\\me', home: 'C:\\Users\\me', previous: null }

  it('home, ~, -, absolute and relative (posix)', () => {
    expect(resolveLocalCd(undefined, posix)).toEqual({ ok: true, path: '/home/me' })
    expect(resolveLocalCd('~', posix)).toEqual({ ok: true, path: '/home/me' })
    expect(resolveLocalCd('~/docs', posix)).toEqual({ ok: true, path: '/home/me/docs' })
    expect(resolveLocalCd('-', posix)).toEqual({ ok: true, path: '/tmp' })
    expect(resolveLocalCd('..', posix)).toEqual({ ok: true, path: '/home/me' })
    expect(resolveLocalCd('../../..', posix)).toEqual({ ok: true, path: '/' })
    expect(resolveLocalCd('lib/x', posix)).toEqual({ ok: true, path: '/home/me/src/lib/x' })
    expect(resolveLocalCd('/etc/', posix)).toEqual({ ok: true, path: '/etc' })
  })
  it('cd - without a previous dir is an error', () => {
    expect(resolveLocalCd('-', win).ok).toBe(false)
  })
  it('windows drive letters and roots', () => {
    expect(resolveLocalCd('D:', win)).toEqual({ ok: true, path: 'D:\\' })
    expect(resolveLocalCd('d:', win)).toEqual({ ok: true, path: 'D:\\' })
    expect(resolveLocalCd('D:\\work\\..\\play', win)).toEqual({ ok: true, path: 'D:\\play' })
    expect(resolveLocalCd('D:/work', win)).toEqual({ ok: true, path: 'D:\\work' })
    expect(resolveLocalCd('E:stuff', win)).toEqual({ ok: true, path: 'E:\\stuff' })
    expect(resolveLocalCd('\\', win)).toEqual({ ok: true, path: 'C:\\' })
    expect(resolveLocalCd('\\Windows', win)).toEqual({ ok: true, path: 'C:\\Windows' })
    expect(resolveLocalCd('..', win)).toEqual({ ok: true, path: 'C:\\Users' })
    expect(resolveLocalCd('Desktop', win)).toEqual({ ok: true, path: 'C:\\Users\\me\\Desktop' })
    expect(resolveLocalCd('~\\Downloads', win)).toEqual({ ok: true, path: 'C:\\Users\\me\\Downloads' })
    expect(resolveLocalCd('\\\\nas\\media', win)).toEqual({ ok: true, path: '\\\\nas\\media\\' })
  })
  it('relative paths need a cwd (drive/home root list)', () => {
    expect(resolveLocalCd('foo', { ...posix, cwd: null }).ok).toBe(false)
    expect(resolveLocalCd('/etc', { ...posix, cwd: null })).toEqual({ ok: true, path: '/etc' })
  })
})

describe('resolveInnerCd', () => {
  it('sftp (absolute inner paths)', () => {
    const s = innerStyleFor('sftp')!
    expect(resolveInnerCd('logs', 'me@h:22::/var', s.style)).toEqual({ ok: true, path: 'me@h:22::/var/logs' })
    expect(resolveInnerCd('..', 'me@h:22::/var', s.style)).toEqual({ ok: true, path: 'me@h:22::/' })
    expect(resolveInnerCd('/etc', 'me@h:22::/var', s.style)).toEqual({ ok: true, path: 'me@h:22::/etc' })
    expect(resolveInnerCd('a', 'me@h:22::', s.style)).toEqual({ ok: true, path: 'me@h:22::/a' })
    expect(resolveInnerCd('~', 'me@h:22::/var', s.style).ok).toBe(false)
  })
  it('s3 prefixes', () => {
    const s = innerStyleFor('s3')!
    expect(resolveInnerCd('photos', 's3-b::', s.style)).toEqual({ ok: true, path: 's3-b::photos/' })
    expect(resolveInnerCd('..', 's3-b::photos/2024/', s.style)).toEqual({ ok: true, path: 's3-b::photos/' })
    expect(resolveInnerCd('..', 's3-b::photos/', s.style)).toEqual({ ok: true, path: 's3-b::' })
    expect(resolveInnerCd('/x/y', 's3-b::photos/', s.style)).toEqual({ ok: true, path: 's3-b::x/y/' })
  })
  it('archives split on the last ::', () => {
    const s = innerStyleFor('archive')!
    expect(resolveInnerCd('src', 'sftp:me@h:22::/a.zip::docs/', s.style, s.lastSep)).toEqual({
      ok: true,
      path: 'sftp:me@h:22::/a.zip::docs/src/'
    })
    expect(resolveInnerCd('..', '/x/a.zip::docs/', s.style, s.lastSep)).toEqual({ ok: true, path: '/x/a.zip::' })
  })
  it('unknown plugins have no inner style', () => {
    expect(innerStyleFor('smb')).toBeNull()
  })
})

describe('isLocalDirectory', () => {
  it('only real local dirs', () => {
    expect(isLocalDirectory('local-filesystem', '/tmp')).toBe(true)
    expect(isLocalDirectory('local-filesystem', null)).toBe(false)
    expect(isLocalDirectory('sftp', 'me@h::/')).toBe(false)
    expect(isLocalDirectory('archive', '/a.zip::')).toBe(false)
  })
})

describe('pushHistory', () => {
  it('dedupes, moves to front, trims', () => {
    expect(pushHistory(['b', 'a'], 'a')).toEqual(['a', 'b'])
    expect(pushHistory(['a'], '  c  ')).toEqual(['c', 'a'])
    expect(pushHistory(['a'], '   ')).toEqual(['a'])
  })
  it('caps the length', () => {
    const many = Array.from({ length: HISTORY_CAP }, (_, i) => `cmd${i}`)
    const next = pushHistory(many, 'new')
    expect(next).toHaveLength(HISTORY_CAP)
    expect(next[0]).toBe('new')
    expect(next).not.toContain(`cmd${HISTORY_CAP - 1}`)
  })
})

describe('insertWithSpacing', () => {
  it('pads like Total Commander', () => {
    expect(insertWithSpacing('', 0, 0, 'a.txt')).toEqual({ value: 'a.txt ', caret: 6 })
    expect(insertWithSpacing('vim', 3, 3, 'a.txt')).toEqual({ value: 'vim a.txt ', caret: 10 })
    expect(insertWithSpacing('vim ', 4, 4, 'a.txt')).toEqual({ value: 'vim a.txt ', caret: 10 })
    expect(insertWithSpacing('cp  dest', 3, 3, 'x')).toEqual({ value: 'cp x dest', caret: 4 })
  })
  it('replaces the selection', () => {
    expect(insertWithSpacing('cat OLD', 4, 7, 'new')).toEqual({ value: 'cat new ', caret: 8 })
  })
})

describe('matchBookmark', () => {
  const bms = [{ name: 'Projects' }, { name: 'proj-old' }, { name: 'Downloads' }]
  it('exact, then prefix, then substring, case-insensitive', () => {
    expect(matchBookmark(bms, 'proj-old')?.name).toBe('proj-old')
    expect(matchBookmark(bms, 'proj')?.name).toBe('Projects')
    expect(matchBookmark(bms, 'load')?.name).toBe('Downloads')
    expect(matchBookmark(bms, 'zzz')).toBeNull()
    expect(matchBookmark(bms, '')).toBeNull()
  })
})
