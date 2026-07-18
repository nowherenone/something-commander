import React, { useEffect, useMemo, useState } from 'react'
import { OperationView } from '../components/dialogs/OperationDialog'
import type { FileOperation } from '../stores/operations-store'
import '../styles/global.css'

/** Fixed clock so speed/ETA screenshots are deterministic across runs. */
const FIXED_NOW = 1_700_000_000_000

function baseOp(partial: Partial<FileOperation> & Pick<FileOperation, 'id' | 'type' | 'status'>): FileOperation {
  return {
    sourceEntries: [],
    sourcePluginId: 'local-filesystem',
    destinationDisplay: '',
    destinationLocationId: '',
    destinationPluginId: 'local-filesystem',
    fileList: [],
    currentFile: '',
    currentFileIndex: 0,
    currentFileSize: 0,
    currentFileCopied: 0,
    totalFiles: 0,
    totalBytes: 0,
    processedFiles: 0,
    processedBytes: 0,
    startTime: 0,
    overwritePrompt: null,
    overwritePolicy: 'ask',
    ...partial
  }
}

// Mock operations in every possible state — times are fixed for visual stability
const mockOps: Record<string, FileOperation> = {
  enumerating: baseOp({
    id: 'op-1',
    type: 'copy',
    sourceEntries: [{ id: 'D:\\Projects\\myapp', name: 'myapp', isContainer: true, size: -1, modifiedAt: 0, mimeType: '', iconHint: 'folder', meta: {}, attributes: { readonly: false, hidden: false, symlink: false } }],
    destinationDisplay: 'E:\\Backup',
    destinationLocationId: 'E:\\Backup',
    status: 'enumerating'
  }),

  copying_early: baseOp({
    id: 'op-2',
    type: 'copy',
    sourceEntries: [{ id: 'D:\\Projects\\myapp', name: 'myapp', isContainer: true, size: -1, modifiedAt: 0, mimeType: '', iconHint: 'folder', meta: {}, attributes: { readonly: false, hidden: false, symlink: false } }],
    destinationDisplay: 'E:\\Backup',
    destinationLocationId: 'E:\\Backup',
    status: 'running',
    currentFile: 'src\\components\\App.tsx',
    currentFileIndex: 3,
    currentFileSize: 45000,
    currentFileCopied: 12000,
    totalFiles: 47,
    totalBytes: 3500000000,
    processedFiles: 3,
    processedBytes: 125000000,
    startTime: FIXED_NOW - 15000
  }),

  copying_halfway: baseOp({
    id: 'op-3',
    type: 'move',
    sourceEntries: [{ id: 'D:\\Videos\\vacation', name: 'vacation', isContainer: true, size: -1, modifiedAt: 0, mimeType: '', iconHint: 'folder', meta: {}, attributes: { readonly: false, hidden: false, symlink: false } }],
    destinationDisplay: 'F:\\Archive\\Videos',
    destinationLocationId: 'F:\\Archive\\Videos',
    status: 'running',
    currentFile: 'day3\\IMG_4521.MOV',
    currentFileIndex: 15,
    currentFileSize: 2147483648,
    currentFileCopied: 1073741824,
    totalFiles: 32,
    totalBytes: 15032385536,
    processedFiles: 14,
    processedBytes: 7516192768,
    startTime: FIXED_NOW - 120000
  }),

  /** Large single file out of a zip — the regression case for frozen progress bars */
  zip_copy_progress: baseOp({
    id: 'op-zip',
    type: 'copy',
    sourceEntries: [{ id: 'D:\\archives\\payload.zip::video.mp4', name: 'video.mp4', isContainer: false, size: 524288000, modifiedAt: 0, mimeType: '', iconHint: 'file', meta: {}, attributes: { readonly: false, hidden: false, symlink: false } }],
    sourcePluginId: 'archive',
    destinationDisplay: 'E:\\Extracted',
    destinationLocationId: 'E:\\Extracted',
    status: 'running',
    currentFile: 'video.mp4',
    currentFileIndex: 0,
    currentFileSize: 524288000,
    currentFileCopied: 157286400, // 30% of 500 MB
    totalFiles: 1,
    totalBytes: 524288000,
    processedFiles: 0,
    processedBytes: 0,
    startTime: FIXED_NOW - 45000
  }),

  overwrite_prompt: baseOp({
    id: 'op-4',
    type: 'copy',
    sourceEntries: [{ id: 'D:\\Work\\report.docx', name: 'report.docx', isContainer: false, size: 52400, modifiedAt: 1710500000000, mimeType: '', iconHint: 'file', meta: {}, attributes: { readonly: false, hidden: false, symlink: false } }],
    destinationDisplay: 'E:\\Shared\\Reports',
    destinationLocationId: 'E:\\Shared\\Reports',
    status: 'running',
    currentFile: 'report.docx',
    currentFileIndex: 5,
    currentFileSize: 52400,
    currentFileCopied: 0,
    totalFiles: 12,
    totalBytes: 890000,
    processedFiles: 5,
    processedBytes: 445000,
    startTime: FIXED_NOW - 5000,
    overwritePrompt: {
      sourcePath: 'D:\\Work\\report.docx',
      sourceName: 'report.docx',
      sourceSize: 52400,
      sourceDate: 1710500000000,
      destPath: 'E:\\Shared\\Reports\\report.docx',
      destSize: 48200,
      destDate: 1709800000000
    }
  }),

  error: baseOp({
    id: 'op-5',
    type: 'copy',
    sourceEntries: [{ id: 'D:\\Videos\\flight.mp4', name: 'flight.mp4', isContainer: false, size: 3598000000, modifiedAt: 0, mimeType: '', iconHint: 'file', meta: {}, attributes: { readonly: false, hidden: false, symlink: false } }],
    destinationDisplay: 'C:\\temp',
    destinationLocationId: 'C:\\temp',
    status: 'error',
    currentFile: 'flight.mp4',
    currentFileSize: 3598000000,
    totalFiles: 1,
    totalBytes: 3598000000,
    startTime: FIXED_NOW - 2000,
    error: 'flight.mp4: ENOSPC: no space left on device'
  }),

  cancelled: baseOp({
    id: 'op-6',
    type: 'move',
    sourceEntries: [{ id: 'D:\\Downloads\\stuff', name: 'stuff', isContainer: true, size: -1, modifiedAt: 0, mimeType: '', iconHint: 'folder', meta: {}, attributes: { readonly: false, hidden: false, symlink: false } }],
    destinationDisplay: 'E:\\Sorted',
    destinationLocationId: 'E:\\Sorted',
    status: 'cancelled',
    currentFileIndex: 8,
    totalFiles: 25,
    totalBytes: 500000000,
    processedFiles: 8,
    processedBytes: 200000000,
    startTime: FIXED_NOW - 30000
  }),

  deleting: baseOp({
    id: 'op-7',
    type: 'delete',
    sourceEntries: [{ id: 'D:\\temp\\cache', name: 'cache', isContainer: true, size: -1, modifiedAt: 0, mimeType: '', iconHint: 'folder', meta: {}, attributes: { readonly: false, hidden: false, symlink: false } }],
    destinationDisplay: 'Trash',
    status: 'running',
    currentFile: 'cache\\thumbnails\\img_0042.jpg',
    currentFileIndex: 150,
    totalFiles: 312,
    totalBytes: 45000000,
    processedFiles: 150,
    processedBytes: 22000000,
    startTime: FIXED_NOW - 8000
  })
}

const LIVE_TOTAL = 500 * 1024 * 1024 // 500 MB zip member

function LiveZipProgress(): React.JSX.Element {
  const [pct, setPct] = useState(0)
  const op = useMemo((): FileOperation => {
    const copied = Math.round((LIVE_TOTAL * pct) / 100)
    return baseOp({
      id: 'op-live-zip',
      type: 'copy',
      sourceEntries: [{
        id: 'D:\\archives\\big.zip::payload.bin',
        name: 'payload.bin',
        isContainer: false,
        size: LIVE_TOTAL,
        modifiedAt: 0,
        mimeType: '',
        iconHint: 'file',
        meta: {},
        attributes: { readonly: false, hidden: false, symlink: false }
      }],
      sourcePluginId: 'archive',
      destinationDisplay: 'E:\\Out',
      destinationLocationId: 'E:\\Out',
      status: 'running',
      currentFile: 'payload.bin',
      currentFileIndex: 0,
      currentFileSize: LIVE_TOTAL,
      currentFileCopied: copied,
      totalFiles: 1,
      totalBytes: LIVE_TOTAL,
      processedFiles: 0,
      processedBytes: 0,
      startTime: FIXED_NOW - 30000
    })
  }, [pct])

  return (
    <div style={{ width: 480 }} data-testid="live-zip-progress">
      <div style={{
        color: '#738091',
        fontSize: 11,
        marginBottom: 4,
        textTransform: 'uppercase',
        letterSpacing: 1
      }}>
        live_zip_progress (step with buttons)
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        {[0, 10, 25, 50, 75, 100].map((p) => (
          <button
            key={p}
            type="button"
            data-testid={`progress-step-${p}`}
            onClick={() => setPct(p)}
            style={{
              background: pct === p ? '#4c8bf5' : '#2f343c',
              color: '#f6f7f9',
              border: '1px solid #5f6b7c',
              borderRadius: 4,
              padding: '4px 10px',
              cursor: 'pointer',
              fontSize: 12
            }}
          >
            {p}%
          </button>
        ))}
        <span data-testid="live-progress-pct" style={{ color: '#a7b6c2', fontSize: 12, alignSelf: 'center' }}>
          {pct}%
        </span>
      </div>
      <OperationView op={op} />
    </div>
  )
}

export function TestHarness(): React.JSX.Element {
  // Freeze Date.now for speed/ETA math inside OperationView for this page only.
  useEffect(() => {
    const realNow = Date.now.bind(Date)
    Date.now = () => FIXED_NOW
    return () => {
      Date.now = realNow
    }
  }, [])

  return (
    <div
      style={{
        background: '#1c2127',
        minHeight: '100vh',
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
        alignItems: 'center'
      }}
      data-testid="test-harness"
    >
      <h2 style={{ color: '#f6f7f9', fontSize: 16, margin: 0 }}>Operation Dialog Test Harness</h2>

      <LiveZipProgress />

      {Object.entries(mockOps).map(([name, op]) => (
        <div key={name} style={{ width: 480 }} data-testid={`harness-${name}`}>
          <div style={{
            color: '#738091',
            fontSize: 11,
            marginBottom: 4,
            textTransform: 'uppercase',
            letterSpacing: 1
          }}>
            {name}
          </div>
          <OperationView op={op} />
        </div>
      ))}
    </div>
  )
}
