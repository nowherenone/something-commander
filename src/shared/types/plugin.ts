import type { Entry } from './entry'
import type { OperationRequest, OperationResult, PluginOperation } from './operations'

export interface PluginManifest {
  /** Unique plugin ID, e.g. "local-filesystem" */
  id: string
  /** Human-readable name for UI display */
  displayName: string
  /** Version string */
  version: string
  /** Icon key for the plugin itself */
  iconHint: string
  /** URI schemes this plugin handles, e.g. ["file"] or ["ftp", "sftp"] */
  schemes: string[]
}

export interface ColumnDefinition {
  /** Key into Entry.meta to read the value */
  key: string
  /** Column header label */
  label: string
  /** Default width in pixels */
  width: number
  /** Whether this column is sortable */
  sortable?: boolean
}

export interface ReadDirectoryResult {
  /** The entries in this container */
  entries: Entry[]
  /** Display string for the address bar */
  location: string
  /** Parent container ID for ".." navigation, or null at root */
  parentId: string | null
  /** Plugin-provided columns beyond the defaults (name, size, date) */
  extraColumns?: ColumnDefinition[]
}

/**
 * Every data source plugin implements this interface.
 * Plugins run in the main process only.
 */
export interface BrowsePlugin {
  readonly manifest: PluginManifest

  /** Initialize the plugin. Called once at load time. */
  initialize(): Promise<boolean>

  /** Clean up. Called on app shutdown or plugin unload. */
  dispose(): Promise<void>

  /**
   * Read contents of a container.
   * @param locationId - null means "give me the root/default view"
   */
  readDirectory(locationId: string | null): Promise<ReadDirectoryResult>

  /** Resolve a user-typed address bar string into a locationId. Returns null if invalid. */
  resolveLocation(input: string): Promise<string | null>

  /** Which operations does this plugin support? */
  getSupportedOperations(): PluginOperation[]

  /** Execute a file operation. */
  executeOperation(op: OperationRequest): Promise<OperationResult>

  /** Enumerate all files recursively under given entries for progress tracking. */
  enumerateFiles?(entryIds: string[], destDir: string): Promise<Array<{
    sourcePath: string
    destPath: string
    size: number
    isDirectory: boolean
    relativePath: string
  }>>

  /** Optional: provide file content for viewing. */
  getContent?(entryId: string): Promise<Buffer | null>

  /** Optional: watch a location for changes. */
  watch?(locationId: string, onChange: () => void): { dispose(): void }
}
