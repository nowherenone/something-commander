export const IPC_CHANNELS = {
  // Plugin queries
  PLUGIN_LIST: 'plugin:list',
  PLUGIN_READ_DIR: 'plugin:readDirectory',
  PLUGIN_RESOLVE_LOC: 'plugin:resolveLocation',
  PLUGIN_GET_OPS: 'plugin:getSupportedOperations',
  PLUGIN_EXEC_OP: 'plugin:executeOperation',
  PLUGIN_GET_CONTENT: 'plugin:getContent',

  // Operation progress events (main → renderer)
  OP_PROGRESS: 'ops:progress',
  OP_COMPLETE: 'ops:complete',
  OP_ERROR: 'ops:error'
} as const
