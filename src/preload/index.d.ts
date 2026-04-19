import type { ElectronAPI } from '@electron-toolkit/preload'
import type {
  PluginManifest,
  ReadDirectoryResult,
  PluginOperation,
  OperationRequest,
  OperationResult
} from '../shared/types'

interface PluginsAPI {
  list(): Promise<PluginManifest[]>
  readDirectory(pluginId: string, locationId: string | null): Promise<ReadDirectoryResult>
  resolveLocation(pluginId: string, input: string): Promise<string | null>
  getSupportedOperations(pluginId: string): Promise<PluginOperation[]>
  executeOperation(pluginId: string, op: OperationRequest): Promise<OperationResult>
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
  getArchiveFormats(): Promise<Array<{ label: string; extensions: string[]; primaryExtension: string; supportsWrite: boolean }>>
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
  s3Connect(bucket: string, region: string, accessKeyId: string, secretAccessKey: string, label?: string): Promise<string>
  s3Disconnect(connId: string): Promise<void>
  smbConnect(host: string, share: string, username: string, password: string, domain?: string, label?: string): Promise<string>
  smbDisconnect(connId: string): Promise<void>
  pluginScan(): Promise<Array<{ id: string; name: string; version: string; description: string; path: string; enabled: boolean; error?: string }>>
  pluginLoad(pluginDir: string): Promise<{ success: boolean; error?: string }>
  pluginUnload(pluginId: string): Promise<{ success: boolean }>
  pluginGetDir(): Promise<string>
  streamCopyFile(
    sourcePluginId: string,
    sourceEntryId: string,
    destPluginId: string,
    destLocationId: string,
    destFileName: string
  ): Promise<{ success: boolean; bytesWritten: number; error?: string }>
  extractFromArchive(archivePath: string, internalPath: string, destDir: string): Promise<{ success: boolean; error?: string; extractedCount: number }>
  onCopyFileProgress(callback: (bytesCopied: number) => void): () => void
  enumerateFiles(
    pluginId: string,
    entryIds: string[],
    destDir: string
  ): Promise<Array<{ sourcePath: string; destPath: string; size: number; isDirectory: boolean; relativePath: string }>>
  startNativeDrag(filePaths: string[]): void
}

interface StoreAPI {
  get(key: string): Promise<unknown>
  set(key: string, value: unknown): Promise<void>
}

interface SomethingCommanderAPI {
  plugins: PluginsAPI
  util: UtilAPI
  store: StoreAPI
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: SomethingCommanderAPI
  }
}
