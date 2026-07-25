export const IPC_CHANNELS = {
  // Plugin queries
  PLUGIN_LIST: 'plugin:list',
  PLUGIN_READ_DIR: 'plugin:readDirectory',
  PLUGIN_RESOLVE_LOC: 'plugin:resolveLocation',
  PLUGIN_GET_OPS: 'plugin:getSupportedOperations',
  PLUGIN_EXEC_OP: 'plugin:executeOperation',
  /** Plugin-scoped exists/stat/size — preferred over bare-path util checks */
  PLUGIN_EXISTS: 'plugin:exists',
  PLUGIN_STAT: 'plugin:statEntry',
  PLUGIN_GET_SIZE: 'plugin:getSize',

  // Utility
  CALC_FOLDER_SIZE: 'util:calcFolderSize',
  RUN_COMMAND: 'util:runCommand',
  READ_FILE_CONTENT: 'util:readFileContent',
  SEARCH_FILES: 'util:searchFiles',
  COPY_SINGLE_FILE: 'ops:copySingleFile',
  COPY_FILE_PROGRESS: 'ops:copyFileProgress',
  MOVE_SINGLE_FILE: 'ops:moveSingleFile',
  DELETE_SINGLE: 'ops:deleteSingle',
  CHECK_EXISTS: 'ops:checkExists',
  GET_FILE_INFO: 'ops:getFileInfo',
  IS_ARCHIVE: 'util:isArchive',
  ARCHIVE_FORMATS: 'util:archiveFormats',
  OPEN_FILE: 'util:openFile',
  OPEN_VIEWER_WINDOW: 'util:openViewerWindow',
  OPEN_EDITOR_WINDOW: 'util:openEditorWindow',
  READ_FILE_CHUNK: 'util:readFileChunk',
  GET_FILE_SIZE: 'util:getFileSize',
  SAVE_FILE: 'util:saveFile',
  /** Save editor content through any plugin (pluginId + entryId). */
  SAVE_ENTRY_CONTENT: 'util:saveEntryContent',
  READ_ENTRY_CONTENT: 'util:readEntryContent',
  SHOW_CONTEXT_MENU: 'util:showContextMenu',
  SHOW_FILE_PROPERTIES: 'util:showFileProperties',
  GET_DISK_SPACE: 'util:getDiskSpace',
  SFTP_CONNECT: 'sftp:connect',
  SFTP_DISCONNECT: 'sftp:disconnect',
  SFTP_LIST_CONNECTIONS: 'sftp:listConnections',
  S3_CONNECT: 's3:connect',
  S3_DISCONNECT: 's3:disconnect',
  SMB_CONNECT: 'smb:connect',
  SMB_DISCONNECT: 'smb:disconnect',

  // External plugin management
  PLUGIN_SCAN: 'plugin:scan',
  PLUGIN_LOAD: 'plugin:load',
  PLUGIN_UNLOAD: 'plugin:unload',
  PLUGIN_GET_DIR: 'plugin:getDir',
  EXTRACT_FROM_ARCHIVE: 'ops:extractFromArchive',
  EXTRACT_PROGRESS: 'ops:extractProgress',
  /**
   * Start a stream copy and return immediately { started, transferId }.
   * Completion is delivered via STREAM_COPY_DONE (do not hold the invoke open
   * for multi-GB copies — that starves progress IPC in the real app).
   */
  STREAM_COPY_FILE: 'ops:streamCopyFile',
  STREAM_COPY_DONE: 'ops:streamCopyDone',
  CANCEL_STREAM_COPY: 'ops:cancelStreamCopy',
  /** Poll in-flight stream copy bytes (works even when progress events stall). */
  GET_STREAM_COPY_PROGRESS: 'ops:getStreamCopyProgress',
  ENUMERATE_FILES: 'ops:enumerateFiles',

  // Persistent user data store (survives builds)
  STORE_GET: 'store:get',
  STORE_SET: 'store:set',

  // Drag and drop
  NATIVE_DRAG_START: 'util:nativeDragStart',

  // Auto-update
  CHECK_FOR_UPDATES: 'update:checkForUpdates',
  DOWNLOAD_UPDATE: 'update:downloadUpdate',
  QUIT_AND_INSTALL: 'update:quitAndInstall',
  GET_UPDATE_STATUS: 'update:getStatus',

  // Drive hotplug notifications
  DRIVES_CHANGED: 'util:drivesChanged'
} as const
