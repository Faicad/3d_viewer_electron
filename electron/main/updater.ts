import electronUpdater from 'electron-updater'
const autoUpdater = electronUpdater.autoUpdater
import { BrowserWindow } from 'electron'

let mainWindow: BrowserWindow | null = null

export function initUpdater(edition: string | undefined, getWindow: () => BrowserWindow | null): void {
  mainWindow = getWindow()

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  if (edition === 'cn') {
    autoUpdater.channel = 'cn'
  }

  autoUpdater.on('checking-for-update', () => {
    mainWindow?.webContents.send('update:checking')
  })

  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('update:available', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes,
      releaseName: info.releaseName,
    })
  })

  autoUpdater.on('update-not-available', (info) => {
    mainWindow?.webContents.send('update:not-available', { version: info.version })
  })

  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('update:download-progress', {
      bytesPerSecond: progress.bytesPerSecond,
      percent: progress.percent,
      total: progress.total,
      transferred: progress.transferred,
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('update:downloaded', { version: info.version })
  })

  autoUpdater.on('error', (error) => {
    mainWindow?.webContents.send('update:error', { message: error.message })
  })
}

function isDev(): boolean {
  return import.meta.env.DEV && process.env.NODE_ENV !== 'production'
}

export function checkForUpdates(manual: boolean): void {
  if (isDev()) {
    if (manual) {
      mainWindow?.webContents.send('update:error', {
        message: 'Auto-update is not available in development mode.',
      })
    }
    return
  }
  autoUpdater.checkForUpdates()
}

export function downloadUpdate(): void {
  if (isDev()) {
    mainWindow?.webContents.send('update:error', {
      message: 'Auto-update is not available in development mode.',
    })
    return
  }
  autoUpdater.autoDownload = true
  autoUpdater.downloadUpdate()
}

export function quitAndInstall(): void {
  autoUpdater.quitAndInstall()
}

export function setAutoDownload(enabled: boolean): void {
  autoUpdater.autoDownload = enabled
}
