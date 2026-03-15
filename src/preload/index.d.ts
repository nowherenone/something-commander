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

interface UtilAPI {
  calcFolderSize(folderPath: string): Promise<number>
  runCommand(
    command: string,
    cwd: string,
    shell?: string
  ): Promise<{ stdout: string; stderr: string; code: number }>
  readFileContent(
    filePath: string,
    maxBytes?: number
  ): Promise<{
    content: string
    isBinary: boolean
    totalSize: number
    truncated: boolean
    error?: string
  }>
  searchFiles(
    rootPath: string,
    pattern: string,
    contentPattern: string,
    maxResults?: number
  ): Promise<Array<{ path: string; name: string; isDirectory: boolean; size: number }>>
  copySingleFile(sourcePath: string, destPath: string, isDirectory: boolean): Promise<{ success: boolean; error?: string }>
  moveSingleFile(sourcePath: string, destPath: string, isDirectory: boolean): Promise<{ success: boolean; error?: string }>
  deleteSingle(targetPath: string): Promise<{ success: boolean; error?: string }>
  checkExists(filePath: string): Promise<boolean>
  getFileInfo(filePath: string): Promise<{ size: number; modifiedAt: number; isDirectory: boolean } | null>
}

interface FlemanagerAPI {
  plugins: PluginsAPI
  util: UtilAPI
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: FlemanagerAPI
  }
}
