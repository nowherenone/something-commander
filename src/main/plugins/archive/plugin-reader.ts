import { Readable } from 'stream'
import * as yauzl from 'yauzl'

/**
 * Abstraction for reading an archive file from any source plugin.
 * ZIP drivers use readAt for random access; TAR drivers use createReadStream for sequential.
 */
export interface SourceAccess {
  readAt(offset: number, length: number): Promise<Buffer>
  createReadStream(): NodeJS.ReadableStream
  totalSize: number
  /** When set, the archive is already on disk at this path (avoids temp copy). */
  localPath?: string
}

/**
 * yauzl RandomAccessReader that reads from any plugin's readAt.
 * Used by the ZIP driver to read ZIP files from SMB, SFTP, S3, local FS,
 * or even from inside another archive.
 */
export class PluginRandomAccessReader extends yauzl.RandomAccessReader {
  private _readAt: (offset: number, length: number) => Promise<Buffer>

  constructor(readAtFn: (offset: number, length: number) => Promise<Buffer>) {
    super()
    this._readAt = readAtFn
  }

  _readStreamForRange(start: number, end: number): Readable {
    const readAt = this._readAt
    const CHUNK = 256 * 1024
    let offset = start
    let reading = false

    return new Readable({
      read(): void {
        if (reading) return
        if (offset >= end) {
          this.push(null)
          return
        }
        reading = true
        const length = Math.min(CHUNK, end - offset)
        const at = offset
        readAt(at, length)
          .then((buf) => {
            offset += buf.length
            if (buf.length === 0) {
              this.push(null)
              return
            }
            this.push(buf)
          })
          .catch((err) => {
            this.destroy(err instanceof Error ? err : new Error(String(err)))
          })
          .finally(() => {
            reading = false
          })
      }
    })
  }
}
