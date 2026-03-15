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

export interface FileOperation {
  id: string
  type: 'copy' | 'move' | 'delete'
  sourceEntries: Entry[]
  sourcePluginId: string
  destinationDisplay: string
  destinationLocationId: string
  destinationPluginId: string
  status: 'queued' | 'running' | 'done' | 'error' | 'cancelled'
  currentFile: string
  processedFiles: number
  totalFiles: number
  processedBytes: number
  totalBytes: number
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
  resolveOverwrite: (action: 'overwrite' | 'skip' | 'overwrite-all' | 'skip-all') => void
}

let opCounter = 0

export const useOperationsStore = create<OperationsState>((set, get) => ({
  operations: [],
  showDialog: false,

  enqueue: (op) => {
    const id = `op-${++opCounter}-${Date.now()}`
    // Calculate total bytes
    let totalBytes = 0
    for (const e of op.sourceEntries) {
      if (e.size > 0) totalBytes += e.size
    }

    const operation: FileOperation = {
      ...op,
      id,
      status: 'queued',
      currentFile: '',
      processedFiles: 0,
      totalFiles: op.sourceEntries.length,
      processedBytes: 0,
      totalBytes,
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
        op.id === id ? { ...op, status: 'cancelled' as const } : op
      )
    }))
  },

  clearCompleted: () => {
    set((s) => ({
      operations: s.operations.filter((op) => op.status === 'running' || op.status === 'queued')
    }))
  },

  setShowDialog: (show) => set({ showDialog: show }),

  getCurrentOperation: () => {
    const ops = get().operations
    return ops.find((op) => op.status === 'running') || ops.find((op) => op.status === 'queued')
  },

  resolveOverwrite: (_action) => {
    // This is handled by the operation executor via polling
    // The action is stored and the executor reads it
  }
}))
