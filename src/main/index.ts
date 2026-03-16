import { app, shell, BrowserWindow, Menu } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerAllIPC } from './ipc'
import { pluginManager } from './plugins/plugin-manager'
import { LocalFilesystemPlugin } from './plugins/local-filesystem'
import { ArchivePlugin } from './plugins/archive'
import { SftpPlugin } from './plugins/sftp'
import { S3Plugin } from './plugins/s3'
import { loadAllPlugins } from './plugins/plugin-loader'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    show: false,
    autoHideMenuBar: true,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // Forward renderer console messages to main process stdout
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const levels = ['DEBUG', 'INFO', 'WARN', 'ERROR']
    console.log(`[Renderer ${levels[level] || level}] ${message} (${sourceId}:${line})`)
  })

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error(`[Renderer] Failed to load: ${errorCode} ${errorDescription}`)
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.somewhat-commander')

  // Remove default Electron menu to prevent Alt+key conflicts
  Menu.setApplicationMenu(null)

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Register plugins
  // Register built-in plugins
  pluginManager.register(new LocalFilesystemPlugin())
  pluginManager.register(new ArchivePlugin())
  pluginManager.register(new SftpPlugin())
  pluginManager.register(new S3Plugin())
  await pluginManager.initializeAll()

  // Load external plugins
  const externalPlugins = await loadAllPlugins()
  for (const p of externalPlugins) {
    if (p.error) {
      console.warn(`[Plugin] Failed to load ${p.id}: ${p.error}`)
    }
  }

  // Register IPC handlers
  registerAllIPC()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', async () => {
  await pluginManager.disposeAll()
})
