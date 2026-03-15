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
  MOVE_SINGLE_FILE: 'ops:moveSingleFile',
  DELETE_SINGLE: 'ops:deleteSingle',
  CHECK_EXISTS: 'ops:checkExists',
  GET_FILE_INFO: 'ops:getFileInfo',
  IS_ARCHIVE: 'util:isArchive',

  // Operation progress events (main → renderer)
  OP_PROGRESS: 'ops:progress',
  OP_COMPLETE: 'ops:complete',
  OP_ERROR: 'ops:error'
} as const
