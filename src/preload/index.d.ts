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
  isArchive(filePath: string): Promise<boolean>
  openFile(filePath: string): Promise<string>
  openViewerWindow(filePath: string, fileName: string): Promise<void>
  openEditorWindow(filePath: string, fileName: string): Promise<void>
  readFileChunk(filePath: string, offset: number, length: number): Promise<{ data: string; bytesRead: number; error?: string }>
  getFileSize(filePath: string): Promise<number>
  saveFile(filePath: string, content: string): Promise<{ success: boolean; error?: string }>
  showContextMenu(items: Array<{ label: string; id: string; separator?: boolean }>): Promise<string | null>
  getDiskSpace(dirPath: string): Promise<{ free: number; total: number }>
  sftpConnect(host: string, port: number, username: string, password?: string): Promise<string>
  sftpDisconnect(connId: string): Promise<void>
  sftpListConnections(): Promise<string[]>
  pluginScan(): Promise<Array<{ id: string; name: string; version: string; description: string; path: string; enabled: boolean; error?: string }>>
  pluginLoad(pluginDir: string): Promise<{ success: boolean; error?: string }>
  pluginUnload(pluginId: string): Promise<{ success: boolean }>
  pluginGetDir(): Promise<string>
  onCopyFileProgress(callback: (bytesCopied: number) => void): () => void
  enumerateFiles(
    sourcePaths: string[],
    destDir: string
  ): Promise<Array<{ sourcePath: string; destPath: string; size: number; isDirectory: boolean; relativePath: string }>>
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
