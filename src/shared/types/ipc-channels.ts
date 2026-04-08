export const IPC_CHANNELS = {
  // Plugin queries
  PLUGIN_LIST: 'plugin:list',
  PLUGIN_READ_DIR: 'plugin:readDirectory',
  PLUGIN_RESOLVE_LOC: 'plugin:resolveLocation',
  PLUGIN_GET_OPS: 'plugin:getSupportedOperations',
  PLUGIN_EXEC_OP: 'plugin:executeOperation',
  PLUGIN_GET_CONTENT: 'plugin:getContent',

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
  SHOW_CONTEXT_MENU: 'util:showContextMenu',
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
  STREAM_COPY_FILE: 'ops:streamCopyFile',
  ENUMERATE_FILES: 'ops:enumerateFiles',

  // Persistent user data store (survives builds)
  STORE_GET: 'store:get',
  STORE_SET: 'store:set',

  // Drag and drop
  NATIVE_DRAG_START: 'util:nativeDragStart',

  // Operation progress events (main → renderer)
  OP_PROGRESS: 'ops:progress',
  OP_COMPLETE: 'ops:complete',
  OP_ERROR: 'ops:error'
} as const
