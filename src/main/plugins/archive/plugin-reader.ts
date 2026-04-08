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
    const length = end - start
    let reading = false

    return new Readable({
      read(): void {
        if (reading) return
        reading = true
        readAt(start, length)
          .then((buf) => {
            this.push(buf)
            this.push(null)
          })
          .catch((err) => {
            this.destroy(err instanceof Error ? err : new Error(String(err)))
          })
      }
    })
  }
}
