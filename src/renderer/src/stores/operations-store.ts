import { create } from 'zustand'
import type { Entry } from '@shared/types'

export type OverwritePolicy = 'ask' | 'overwrite-all' | 'skip-all'

export interface OverwritePrompt {
  sourcePath: string
  sourceName: string
  sourceSize: number
  sourceDate: number
  destPath: string
  destSize: number
  destDate: number
}

export interface FileItem {
  sourcePath: string
  destPath: string
  size: number
  isDirectory: boolean
  relativePath: string
}

export interface FileOperation {
  id: string
  type: 'copy' | 'move' | 'delete'
  sourceEntries: Entry[]
  sourcePluginId: string
  destinationDisplay: string
  destinationLocationId: string
  destinationPluginId: string
  status: 'enumerating' | 'queued' | 'running' | 'done' | 'error' | 'cancelled'
  // File tree (populated after enumeration)
  fileList: FileItem[]
  currentFile: string
  currentFileIndex: number
  currentFileSize: number
  currentFileCopied: number // not used yet but reserved for per-byte tracking
  totalFiles: number
  totalBytes: number
  processedFiles: number
  processedBytes: number
  error?: string
  overwritePrompt: OverwritePrompt | null
  overwritePolicy: OverwritePolicy
}

interface OperationsState {
  operations: FileOperation[]
  showDialog: boolean

  enqueue: (op: Pick<FileOperation, 'type' | 'sourceEntries' | 'sourcePluginId' | 'destinationDisplay' | 'destinationLocationId' | 'destinationPluginId'>) => string
  updateOperation: (id: string, update: Partial<FileOperation>) => void
  removeOperation: (id: string) => void
  cancelOperation: (id: string) => void
  clearCompleted: () => void
  setShowDialog: (show: boolean) => void
  getCurrentOperation: () => FileOperation | undefined
}

let opCounter = 0

export const useOperationsStore = create<OperationsState>((set, get) => ({
  operations: [],
  showDialog: false,

  enqueue: (op) => {
    const id = `op-${++opCounter}-${Date.now()}`
    const operation: FileOperation = {
      ...op,
      id,
      status: 'queued',
      fileList: [],
      currentFile: '',
      currentFileIndex: 0,
      currentFileSize: 0,
      currentFileCopied: 0,
      totalFiles: 0,
      totalBytes: 0,
      processedFiles: 0,
      processedBytes: 0,
      overwritePrompt: null,
      overwritePolicy: 'ask'
    }
    set((s) => ({
      operations: [...s.operations, operation],
      showDialog: true
    }))
    return id
  },

  updateOperation: (id, update) => {
    set((s) => ({
      operations: s.operations.map((op) =>
        op.id === id ? { ...op, ...update } : op
      )
    }))
  },

  removeOperation: (id) => {
    set((s) => {
      const ops = s.operations.filter((op) => op.id !== id)
      return { operations: ops, showDialog: ops.length > 0 ? s.showDialog : false }
    })
  },

  cancelOperation: (id) => {
    set((s) => ({
      operations: s.operations.map((op) =>
        op.id === id && (op.status === 'running' || op.status === 'enumerating' || op.status === 'queued')
          ? { ...op, status: 'cancelled' as const }
          : op
      )
    }))
  },

  clearCompleted: () => {
    set((s) => ({
      operations: s.operations.filter((op) => op.status === 'running' || op.status === 'queued' || op.status === 'enumerating')
    }))
  },

  setShowDialog: (show) => set({ showDialog: show }),

  getCurrentOperation: () => {
    const ops = get().operations
    return ops.find((op) => op.status === 'running')
      || ops.find((op) => op.status === 'enumerating')
      || ops.find((op) => op.status === 'queued')
      || ops.find((op) => op.status === 'error')
      || ops[ops.length - 1]
  }
}))
