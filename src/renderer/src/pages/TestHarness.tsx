import React from 'react'
import { OperationView } from '../components/dialogs/OperationDialog'
import type { FileOperation } from '../stores/operations-store'
import '../styles/global.css'

// Mock operations in every possible state
const mockOps: Record<string, FileOperation> = {
  enumerating: {
    id: 'op-1',
    type: 'copy',
    sourceEntries: [{ id: 'D:\\Projects\\myapp', name: 'myapp', isContainer: true, size: -1, modifiedAt: 0, mimeType: '', iconHint: 'folder', meta: {}, attributes: { readonly: false, hidden: false, symlink: false } }],
    sourcePluginId: 'local-filesystem',
    destinationDisplay: 'E:\\Backup',
    destinationLocationId: 'E:\\Backup',
    destinationPluginId: 'local-filesystem',
    status: 'enumerating',
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
    overwritePolicy: 'ask'
  },

  copying_early: {
    id: 'op-2',
    type: 'copy',
    sourceEntries: [{ id: 'D:\\Projects\\myapp', name: 'myapp', isContainer: true, size: -1, modifiedAt: 0, mimeType: '', iconHint: 'folder', meta: {}, attributes: { readonly: false, hidden: false, symlink: false } }],
    sourcePluginId: 'local-filesystem',
    destinationDisplay: 'E:\\Backup',
    destinationLocationId: 'E:\\Backup',
    destinationPluginId: 'local-filesystem',
    status: 'running',
    fileList: [],
    currentFile: 'src\\components\\App.tsx',
    currentFileIndex: 3,
    currentFileSize: 45000,
    currentFileCopied: 12000,
    totalFiles: 47,
    totalBytes: 3500000000,
    processedFiles: 3,
    processedBytes: 125000000,
    startTime: Date.now() - 15000,
    overwritePrompt: null,
    overwritePolicy: 'ask'
  },

  copying_halfway: {
    id: 'op-3',
    type: 'move',
    sourceEntries: [{ id: 'D:\\Videos\\vacation', name: 'vacation', isContainer: true, size: -1, modifiedAt: 0, mimeType: '', iconHint: 'folder', meta: {}, attributes: { readonly: false, hidden: false, symlink: false } }],
    sourcePluginId: 'local-filesystem',
    destinationDisplay: 'F:\\Archive\\Videos',
    destinationLocationId: 'F:\\Archive\\Videos',
    destinationPluginId: 'local-filesystem',
    status: 'running',
    fileList: [],
    currentFile: 'day3\\IMG_4521.MOV',
    currentFileIndex: 15,
    currentFileSize: 2147483648,
    currentFileCopied: 1073741824,
    totalFiles: 32,
    totalBytes: 15032385536,
    processedFiles: 14,
    processedBytes: 7516192768,
    startTime: Date.now() - 120000,
    overwritePrompt: null,
    overwritePolicy: 'ask'
  },

  overwrite_prompt: {
    id: 'op-4',
    type: 'copy',
    sourceEntries: [{ id: 'D:\\Work\\report.docx', name: 'report.docx', isContainer: false, size: 52400, modifiedAt: 1710500000000, mimeType: '', iconHint: 'file', meta: {}, attributes: { readonly: false, hidden: false, symlink: false } }],
    sourcePluginId: 'local-filesystem',
    destinationDisplay: 'E:\\Shared\\Reports',
    destinationLocationId: 'E:\\Shared\\Reports',
    destinationPluginId: 'local-filesystem',
    status: 'running',
    fileList: [],
    currentFile: 'report.docx',
    currentFileIndex: 5,
    currentFileSize: 52400,
    currentFileCopied: 0,
    totalFiles: 12,
    totalBytes: 890000,
    processedFiles: 5,
    processedBytes: 445000,
    startTime: Date.now() - 5000,
    overwritePrompt: {
      sourcePath: 'D:\\Work\\report.docx',
      sourceName: 'report.docx',
      sourceSize: 52400,
      sourceDate: 1710500000000,
      destPath: 'E:\\Shared\\Reports\\report.docx',
      destSize: 48200,
      destDate: 1709800000000
    },
    overwritePolicy: 'ask'
  },

  error: {
    id: 'op-5',
    type: 'copy',
    sourceEntries: [{ id: 'D:\\Videos\\flight.mp4', name: 'flight.mp4', isContainer: false, size: 3598000000, modifiedAt: 0, mimeType: '', iconHint: 'file', meta: {}, attributes: { readonly: false, hidden: false, symlink: false } }],
    sourcePluginId: 'local-filesystem',
    destinationDisplay: 'C:\\temp',
    destinationLocationId: 'C:\\temp',
    destinationPluginId: 'local-filesystem',
    status: 'error',
    fileList: [],
    currentFile: 'flight.mp4',
    currentFileIndex: 0,
    currentFileSize: 3598000000,
    currentFileCopied: 0,
    totalFiles: 1,
    totalBytes: 3598000000,
    processedFiles: 0,
    processedBytes: 0,
    startTime: Date.now() - 2000,
    error: 'flight.mp4: ENOSPC: no space left on device',
    overwritePrompt: null,
    overwritePolicy: 'ask'
  },

  cancelled: {
    id: 'op-6',
    type: 'move',
    sourceEntries: [{ id: 'D:\\Downloads\\stuff', name: 'stuff', isContainer: true, size: -1, modifiedAt: 0, mimeType: '', iconHint: 'folder', meta: {}, attributes: { readonly: false, hidden: false, symlink: false } }],
    sourcePluginId: 'local-filesystem',
    destinationDisplay: 'E:\\Sorted',
    destinationLocationId: 'E:\\Sorted',
    destinationPluginId: 'local-filesystem',
    status: 'cancelled',
    fileList: [],
    currentFile: '',
    currentFileIndex: 8,
    currentFileSize: 0,
    currentFileCopied: 0,
    totalFiles: 25,
    totalBytes: 500000000,
    processedFiles: 8,
    processedBytes: 200000000,
    startTime: Date.now() - 30000,
    overwritePrompt: null,
    overwritePolicy: 'ask'
  },

  deleting: {
    id: 'op-7',
    type: 'delete',
    sourceEntries: [{ id: 'D:\\temp\\cache', name: 'cache', isContainer: true, size: -1, modifiedAt: 0, mimeType: '', iconHint: 'folder', meta: {}, attributes: { readonly: false, hidden: false, symlink: false } }],
    sourcePluginId: 'local-filesystem',
    destinationDisplay: 'Trash',
    destinationLocationId: '',
    destinationPluginId: 'local-filesystem',
    status: 'running',
    fileList: [],
    currentFile: 'cache\\thumbnails\\img_0042.jpg',
    currentFileIndex: 150,
    currentFileSize: 0,
    currentFileCopied: 0,
    totalFiles: 312,
    totalBytes: 45000000,
    processedFiles: 150,
    processedBytes: 22000000,
    startTime: Date.now() - 8000,
    overwritePrompt: null,
    overwritePolicy: 'ask'
  }
}

export function TestHarness(): React.JSX.Element {
  return (
    <div style={{
      background: '#1c2127',
      minHeight: '100vh',
      padding: 24,
      display: 'flex',
      flexDirection: 'column',
      gap: 24,
      alignItems: 'center'
    }}>
      <h2 style={{ color: '#f6f7f9', fontSize: 16, margin: 0 }}>Operation Dialog Test Harness</h2>

      {Object.entries(mockOps).map(([name, op]) => (
        <div key={name} style={{ width: 480 }}>
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
