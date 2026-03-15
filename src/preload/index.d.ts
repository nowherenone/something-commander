import type { ElectronAPI } from '@electron-toolkit/preload'
import type {
  PluginManifest,
  ReadDirectoryResult,
  PluginOperation,
  OperationRequest,
  OperationResult,
  OperationProgress
} from '../shared/types'

interface PluginsAPI {
  list(): Promise<PluginManifest[]>
  readDirectory(pluginId: string, locationId: string | null): Promise<ReadDirectoryResult>
  resolveLocation(pluginId: string, input: string): Promise<string | null>
  getSupportedOperations(pluginId: string): Promise<PluginOperation[]>
  executeOperation(pluginId: string, op: OperationRequest): Promise<OperationResult>
  onOperationProgress(callback: (data: OperationProgress) => void): () => void
  onOperationComplete(callback: (operationId: string) => void): () => void
  onOperationError(callback: (data: { operationId: string; error: string }) => void): () => void
}

interface FlemanagerAPI {
  plugins: PluginsAPI
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: FlemanagerAPI
  }
}
