import type { Entry } from './entry'

export type PluginOperation = 'copy' | 'move' | 'delete' | 'rename' | 'createDirectory'

export type OperationRequest =
  | {
      op: 'copy'
      sourceEntries: Entry[]
      destinationLocationId: string
      destinationPluginId: string
    }
  | {
      op: 'move'
      sourceEntries: Entry[]
      destinationLocationId: string
      destinationPluginId: string
    }
  | { op: 'delete'; entries: Entry[] }
  | { op: 'rename'; entry: Entry; newName: string }
  | { op: 'createDirectory'; parentLocationId: string; name: string }

export interface OperationResult {
  success: boolean
  errors?: Array<{ entryId: string; message: string }>
}
