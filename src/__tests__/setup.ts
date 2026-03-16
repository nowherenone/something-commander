import '@testing-library/jest-dom/vitest'

// Mock window.api for renderer tests
const mockPluginsApi = {
  list: vi.fn().mockResolvedValue([]),
  readDirectory: vi.fn().mockResolvedValue({
    entries: [],
    location: '/test',
    parentId: null,
    extraColumns: []
  }),
  resolveLocation: vi.fn().mockResolvedValue(null),
  getSupportedOperations: vi.fn().mockResolvedValue([]),
  executeOperation: vi.fn().mockResolvedValue({ success: true }),
  onOperationProgress: vi.fn().mockReturnValue(() => {}),
  onOperationComplete: vi.fn().mockReturnValue(() => {}),
  onOperationError: vi.fn().mockReturnValue(() => {})
}

const mockUtilApi = {
  calcFolderSize: vi.fn().mockResolvedValue(0),
  runCommand: vi.fn().mockResolvedValue({ stdout: '', stderr: '', code: 0 }),
  readFileContent: vi.fn().mockResolvedValue({
    content: '',
    isBinary: false,
    totalSize: 0,
    truncated: false
  }),
  searchFiles: vi.fn().mockResolvedValue([]),
  copySingleFile: vi.fn().mockResolvedValue({ success: true }),
  moveSingleFile: vi.fn().mockResolvedValue({ success: true }),
  deleteSingle: vi.fn().mockResolvedValue({ success: true }),
  checkExists: vi.fn().mockResolvedValue(false),
  getFileInfo: vi.fn().mockResolvedValue({ size: 100, modifiedAt: 1000, isDirectory: false }),
  onCopyFileProgress: vi.fn().mockReturnValue(() => {}),
  enumerateFiles: vi.fn().mockImplementation((_pluginId: string, _entryIds: string[], _destDir: string) => Promise.resolve([])),
  isArchive: vi.fn().mockResolvedValue(false),
  openFile: vi.fn().mockResolvedValue(''),
  openViewerWindow: vi.fn().mockResolvedValue(undefined),
  openEditorWindow: vi.fn().mockResolvedValue(undefined),
  readFileChunk: vi.fn().mockResolvedValue({ data: '', bytesRead: 0 }),
  getFileSize: vi.fn().mockResolvedValue(0),
  saveFile: vi.fn().mockResolvedValue({ success: true }),
  showContextMenu: vi.fn().mockResolvedValue(null),
  getDiskSpace: vi.fn().mockResolvedValue({ free: 100000000, total: 500000000 }),
  sftpConnect: vi.fn().mockResolvedValue('user@host:22'),
  sftpDisconnect: vi.fn().mockResolvedValue(undefined),
  sftpListConnections: vi.fn().mockResolvedValue([]),
  pluginScan: vi.fn().mockResolvedValue([]),
  pluginLoad: vi.fn().mockResolvedValue({ success: true }),
  pluginUnload: vi.fn().mockResolvedValue({ success: true }),
  pluginGetDir: vi.fn().mockResolvedValue('/mock/plugins'),
  extractFromArchive: vi.fn().mockResolvedValue({ success: true, extractedCount: 1 })
}

Object.defineProperty(window, 'api', {
  value: {
    plugins: mockPluginsApi,
    util: mockUtilApi
  },
  writable: true
})

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      store = {}
    })
  }
})()

Object.defineProperty(window, 'localStorage', { value: localStorageMock })
