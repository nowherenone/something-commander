import { create } from 'zustand'
import type { Entry } from '@shared/types'

export interface FileOperation {
  id: string
  type: 'copy' | 'move' | 'delete'
  sourceEntries: Entry[]
  sourcePluginId: string
  destinationDisplay: string
  destinationLocationId: string
  destinationPluginId: string
  status: 'running' | 'done' | 'error' | 'cancelled'
  currentFile: string
  processedFiles: number
  totalFiles: number
  error?: string
}

interface OperationsState {
  operations: FileOperation[]

  startOperation: (op: Omit<FileOperation, 'id' | 'status' | 'currentFile' | 'processedFiles' | 'totalFiles'>) => string
  updateOperation: (id: string, update: Partial<FileOperation>) => void
  removeOperation: (id: string) => void
  cancelOperation: (id: string) => void
  clearCompleted: () => void
}

let opCounter = 0

export const useOperationsStore = create<OperationsState>((set, get) => ({
  operations: [],

  startOperation: (op) => {
    const id = `op-${++opCounter}-${Date.now()}`
    const operation: FileOperation = {
      ...op,
      id,
      status: 'running',
      currentFile: '',
      processedFiles: 0,
      totalFiles: op.sourceEntries.length
    }
    set((s) => ({ operations: [...s.operations, operation] }))
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
    set((s) => ({ operations: s.operations.filter((op) => op.id !== id) }))
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
      operations: s.operations.filter((op) => op.status === 'running')
    }))
  }
}))
