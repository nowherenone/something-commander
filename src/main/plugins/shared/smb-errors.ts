/**
 * node-smb2 throws raw Response objects instead of Errors for protocol
 * failures, and those carry BigInt fields that Electron cannot serialize
 * across IPC. This module converts them to plain Error instances with a
 * human-readable message.
 */

export const NTSTATUS_MESSAGES: Record<number, string> = {
  0xC000006D: 'Login failed: bad username or password',
  0xC0000022: 'Access denied',
  0xC00000CC: 'Share not found (bad network name)',
  0xC000006E: 'Account restriction (locked, disabled, or expired)',
  0xC0000064: 'User does not exist',
  0xC000015B: 'Logon type not allowed',
  0xC0000034: 'Path not found',
  0xC000000F: 'File/folder not found',
  0xC0000035: 'Already exists',
  0xC0000043: 'Sharing violation'
}

export function smbError(err: unknown): Error {
  if (err instanceof Error) return err
  if (typeof err === 'object' && err !== null) {
    const resp = err as Record<string, unknown>
    const header = resp.header as Record<string, unknown> | undefined
    if (header?.status) {
      const status = Number(header.status) >>> 0 // unsigned
      const known = NTSTATUS_MESSAGES[status]
      if (known) return new Error(known)
      return new Error(`SMB error 0x${status.toString(16).toUpperCase().padStart(8, '0')}`)
    }
  }
  return new Error(typeof err === 'string' ? err : 'Unknown SMB error')
}
