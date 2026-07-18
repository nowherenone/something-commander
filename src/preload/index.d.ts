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
  openViewerWindow(pluginId: string, entryId: string, fileName: string): Promise<void>
  openEditorWindow(pluginId: string, entryId: string, fileName: string): Promise<void>
  readFileChunk(filePath: string, offset: number, length: number): Promise<{ data: string; bytesRead: number; error?: string }>
  getFileSize(filePath: string): Promise<number>
  readEntryContent(pluginId: string, entryId: string, offset?: number, length?: number): Promise<{ data: string | Buffer; totalSize: number; isBinary: boolean; error?: string }>
  saveFile(filePath: string, content: string): Promise<{ success: boolean; error?: string }>
  showContextMenu(items: Array<{ label: string; id: string; separator?: boolean }>): Promise<string | null>
  showFileProperties(filePath: string): Promise<{ success: boolean; error?: string }>
  getDiskSpace(pluginId: string, locationId: string): Promise<{ free: number; total: number }>
  encryptString(plainText: string): Promise<string>
  decryptString(encrypted: string): Promise<string>
  sftpConnect(host: string, port: number, username: string, password?: string): Promise<string>
  sftpDisconnect(connId: string): Promise<void>
  sftpListConnections(): Promise<string[]>
  s3Connect(bucket: string, region: string, accessKeyId: string, secretAccessKey: string, label?: string): Promise<string>
  s3Disconnect(connId: string): Promise<void>
  smbConnect(host: string, share: string | undefined, username: string, password: string, domain?: string, label?: string): Promise<string>
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
    destFileName: string,
    transferId?: string
  ): Promise<{ success: boolean; bytesWritten: number; error?: string }>
  cancelStreamCopy(transferId: string): Promise<void>
  extractFromArchive(archivePath: string, internalPath: string, destDir: string): Promise<{ success: boolean; error?: string; extractedCount: number }>
  onCopyFileProgress(callback: (bytesCopied: number) => void): () => void
  onExtractProgress(
    callback: (progress: {
      currentFile: string
      filesDone: number
      bytesDone: number
      currentFileBytes?: number
      currentFileSize?: number
    }) => void
  ): () => void
  enumerateFiles(
    pluginId: string,
    entryIds: string[],
    destDir: string
  ): Promise<Array<{ sourcePath: string; destPath: string; size: number; isDirectory: boolean; relativePath: string }>>
  startNativeDrag(filePaths: string[]): void
  onDrivesChanged(callback: () => void): () => void
}

interface StoreAPI {
  get(key: string): Promise<unknown>
  set(key: string, value: unknown): Promise<void>
}

interface UpdateStatus {
  type: string
  data?: any
}

interface UpdateAPI {
  checkForUpdates(): Promise<{ updateAvailable: boolean; version?: string; error?: string }>
  downloadUpdate(): Promise<{ success: boolean; error?: string }>
  quitAndInstall(): void
  onUpdateStatus(callback: (status: UpdateStatus) => void): () => void
  setAutoDownload(enabled: boolean): void
}

interface SomethingCommanderAPI {
  plugins: PluginsAPI
  util: UtilAPI
  store: StoreAPI
  update: UpdateAPI
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: SomethingCommanderAPI
  }
}
