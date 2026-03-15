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
  searchFiles: vi.fn().mockResolvedValue([])
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
