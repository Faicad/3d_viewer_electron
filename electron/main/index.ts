import { app, shell, BrowserWindow, ipcMain, protocol, net, dialog, Menu } from 'electron'
import { join, extname } from 'path'
import * as fs from 'fs'
import { ALL_EXTENSIONS, FILE_FORMATS } from '../../src/renderer/config/file-formats'

// Single-instance lock (required for file associations on Windows)
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, commandLine) => {
    // Windows: user double-clicks a file while app is already running
    const filePath = extractFilePath(commandLine)
    if (filePath && mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
      mainWindow.webContents.send('open-external-file', filePath)
    }
  })
}

/** On Windows, file path comes as the second arg (first is the exe itself) */
function extractFilePath(argv: string[]): string | null {
  // argv[0] is electron/exe, argv[1:] may contain file paths
  const supported = new Set(ALL_EXTENSIONS)
  // Also support raw extensions without dot for argv matching
  const supportedNoDot = new Set(ALL_EXTENSIONS.map((e) => e.slice(1)))
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i]
    if (arg.startsWith('-')) continue
    const ext = extname(arg).toLowerCase()
    if (supported.has(ext) || supportedNoDot.has(ext)) return arg
  }
  return null
}

// Must be called before app.whenReady() to grant the custom protocol access to
// IndexedDB, fetch, and other standard web APIs.
protocol.registerSchemesAsPrivileged([
  { scheme: 'faicad-viewer', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
])

let mainWindow: BrowserWindow | null = null

function setupProtocol(): void {
  protocol.handle('faicad-viewer', (request) => {
    const url = new URL(request.url)
    const urlPath = decodeURIComponent(url.pathname)
    let rel: string
    if (urlPath.startsWith('/out/renderer/')) {
      rel = urlPath.slice('/out/renderer/'.length)
    } else {
      rel = urlPath.replace(/^\//, '')
    }
    const relWin = rel.replace(/\//g, '\\')

    // In dev mode, serve public assets (wasm etc.) from source tree
    if (import.meta.env.DEV) {
      const publicPath = join(__dirname, '..', '..', 'src', 'renderer', 'public', relWin)
      try {
        fs.accessSync(publicPath)
        return net.fetch('file:///' + publicPath.replace(/\\/g, '/'))
      } catch {
        // Fall through to asar path
      }
    }

    const asarPath = join(__dirname, '..', 'renderer', relWin)
    const fileUrl = 'file:///' + asarPath.replace(/\\/g, '/')
    return net.fetch(fileUrl).catch((err) => {
      console.error('[Protocol] FAILED —', request.url, '→', fileUrl, String(err))
      throw err
    })
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Faicad',
    backgroundColor: '#ffffff',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    }
  })

  mainWindow.once('ready-to-show', () => {
    console.log('[Main] ready-to-show, showing window')
    mainWindow!.show()
  })

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[Main] did-finish-load')
  })

  mainWindow.webContents.on('console-message', (_event, level, message, _line, _sourceId) => {
    console.log('[Main] console[' + level + ']:', message)
  })

  // ESC exits fullscreen
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.key === 'Escape' && mainWindow?.isFullScreen()) {
      mainWindow.setFullScreen(false)
    }
  })

  // Forward fullscreen state changes to renderer
  mainWindow.on('enter-full-screen', () => {
    mainWindow?.webContents.send('fullscreen-changed', true)
  })
  mainWindow.on('leave-full-screen', () => {
    mainWindow?.webContents.send('fullscreen-changed', false)
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (import.meta.env.DEV) {
    const devURL = process.env.ELECTRON_RENDERER_URL as string
    mainWindow.loadURL(devURL)
    console.log('[Main] loading (dev):', devURL)
  } else {
    mainWindow.loadURL('faicad-viewer://local/out/renderer/index.html')
    console.log('[Main] loading (prod): faicad-viewer://local/out/renderer/index.html')
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

const ENABLED_FORMATS = FILE_FORMATS.filter((f) => !f.disabled)

const GROUP_ORDER: Array<'mesh' | 'cad' | 'animation' | 'point' | 'volume' | 'gcode' | 'other'> = [
  'mesh', 'cad', 'animation', 'point', 'volume', 'gcode', 'other',
]

const GROUP_LABELS: Record<string, string> = {
  mesh: 'Mesh',
  cad: 'CAD',
  animation: 'Animation',
  point: 'Point Cloud',
  volume: 'Volume',
  gcode: 'GCode',
  other: 'Other',
}

ipcMain.handle('dialog:openFile', async () => {
  if (!mainWindow) return { success: false, error: 'No window' }
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open 3D Model',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'All Supported Formats', extensions: ALL_EXTENSIONS.map((e) => e.slice(1)) },
      ...GROUP_ORDER.map((group) => ({
        name: GROUP_LABELS[group],
        extensions: ENABLED_FORMATS
          .filter((f) => f.group === group)
          .flatMap((f) => f.extensions.map((e) => e.slice(1))),
      })),
      { name: 'All Files', extensions: ['*'] },
    ],
  })
  if (result.canceled) return { success: true, filePaths: [] }
  return { success: true, filePaths: result.filePaths }
})

ipcMain.handle('dialog:openEnvironmentMap', async () => {
  if (!mainWindow) return { success: false, error: 'No window' }
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Load Environment Map',
    properties: ['openFile'],
    filters: [
      { name: 'HDR/EXR Images', extensions: ['hdr', 'exr'] },
    ],
  })
  if (result.canceled) return { success: true, filePath: null }
  return { success: true, filePath: result.filePaths[0] }
})

ipcMain.handle('window:toggleFullscreen', () => {
  if (!mainWindow) return false
  const willBeFullscreen = !mainWindow.isFullScreen()
  mainWindow.setFullScreen(willBeFullscreen)
  return willBeFullscreen
})

ipcMain.handle('electron:getAppVersion', () => app.getVersion())
ipcMain.handle('electron:openExternal', (_event, url: string) => shell.openExternal(url))

// File system IPC handlers
const SUPPORTED_EXTENSIONS = new Set(ALL_EXTENSIONS)

ipcMain.handle('fs:readDirectory', async (_event, dirPath: string) => {
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
    const files: { name: string; path: string; mtimeMs: number }[] = []
    for (const entry of entries) {
      if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase()
        if (SUPPORTED_EXTENSIONS.has(ext)) {
          const fullPath = join(dirPath, entry.name)
          const stat = await fs.promises.stat(fullPath)
          files.push({ name: entry.name, path: fullPath, mtimeMs: stat.mtimeMs })
        }
      }
    }
    return { success: true, files }
  } catch (e) {
    const err = e as Error
    return { success: false, error: err.message }
  }
})

ipcMain.handle('fs:readFile', async (_event, filePath: string) => {
  try {
    const buffer = await fs.promises.readFile(filePath)
    // Return a clean ArrayBuffer (no byteOffset/larger backing buffer)
    return {
      success: true,
      data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
    }
  } catch (e) {
    const err = e as Error
    return { success: false, error: err.message }
  }
})

ipcMain.handle('fs:readFileAsBase64', async (_event, filePath: string) => {
  try {
    const buffer = await fs.promises.readFile(filePath)
    return { success: true, data: buffer.toString('base64') }
  } catch (e) {
    const err = e as Error
    return { success: false, error: err.message }
  }
})

// macOS: user double-clicks a file or drags it onto the dock icon
app.on('open-file', (_event, filePath) => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
    mainWindow.webContents.send('open-external-file', filePath)
  }
})

// Store file path passed on startup for later delivery once window is ready
let pendingFilePath: string | null = null

app.whenReady().then(() => {
  console.log('[Main] app ready')
  Menu.setApplicationMenu(null)
  setupProtocol()
  createWindow()

  // Check for file path from command line (Windows: double-click in Explorer)
  const cliPath = extractFilePath(process.argv)
  if (cliPath) {
    pendingFilePath = cliPath
  }
})

// Deliver pending file path once the window is ready to receive IPC
ipcMain.handle('get-pending-file-path', () => {
  const path = pendingFilePath
  pendingFilePath = null
  return path
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})