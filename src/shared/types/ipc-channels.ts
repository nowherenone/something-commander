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

  // Operation progress events (main → renderer)
  OP_PROGRESS: 'ops:progress',
  OP_COMPLETE: 'ops:complete',
  OP_ERROR: 'ops:error'
} as const
