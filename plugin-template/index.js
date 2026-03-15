const os = require('os')

/**
 * Example Flemanager plugin that shows system information as a virtual directory.
 *
 * To install: copy this folder to ~/.flemanager/plugins/example-plugin/
 * Then open Tools > Plugin Manager > Refresh
 */
class ExamplePlugin {
  constructor() {
    this.manifest = {
      id: 'example-sysinfo',
      displayName: 'System Info',
      version: '1.0.0',
      iconHint: 'network',
      schemes: ['sysinfo']
    }
  }

  async initialize() {
    return true
  }

  async dispose() {}

  async readDirectory(locationId) {
    const info = {
      'hostname.txt': os.hostname(),
      'platform.txt': `${os.platform()} ${os.arch()}`,
      'cpus.txt': os.cpus().map(c => c.model).join('\n'),
      'memory.txt': `Total: ${(os.totalmem() / 1e9).toFixed(1)} GB\nFree: ${(os.freemem() / 1e9).toFixed(1)} GB`,
      'uptime.txt': `${(os.uptime() / 3600).toFixed(1)} hours`,
      'user.txt': os.userInfo().username,
      'homedir.txt': os.homedir(),
      'tmpdir.txt': os.tmpdir(),
      'node-version.txt': process.version,
      'env-PATH.txt': process.env.PATH || ''
    }

    const entries = Object.entries(info).map(([name, content]) => ({
      id: `sysinfo::${name}`,
      name,
      isContainer: false,
      size: Buffer.byteLength(content, 'utf-8'),
      modifiedAt: Date.now(),
      mimeType: 'text/plain',
      iconHint: 'document',
      meta: { extension: 'txt', content },
      attributes: { readonly: true, hidden: false, symlink: false }
    }))

    return {
      entries,
      location: 'System Information',
      parentId: null
    }
  }

  async resolveLocation(input) {
    if (input === 'sysinfo://' || input === 'sysinfo') {
      return 'sysinfo::'
    }
    return null
  }

  getSupportedOperations() {
    return [] // read-only
  }

  async executeOperation() {
    return { success: false, errors: [{ entryId: '', message: 'Read-only plugin' }] }
  }
}

module.exports = ExamplePlugin
