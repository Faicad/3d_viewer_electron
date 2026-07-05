import { contextBridge, ipcRenderer, webUtils } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: () => ipcRenderer.invoke('electron:getAppVersion'),
  getPlatform: () => process.platform,
  openExternal: (url: string) => ipcRenderer.invoke('electron:openExternal', url),
  readDirectory: (dirPath: string) => ipcRenderer.invoke('fs:readDirectory', dirPath),
  readFile: (filePath: string) => ipcRenderer.invoke('fs:readFile', filePath),
  readFileAsBase64: (filePath: string) => ipcRenderer.invoke('fs:readFileAsBase64', filePath),
  getFilePath: (file: File) => webUtils.getPathForFile(file),
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
  openDirectoryDialog: () => ipcRenderer.invoke('dialog:openDirectory'),
  openEnvironmentMapDialog: () => ipcRenderer.invoke('dialog:openEnvironmentMap'),
  toggleFullscreen: () => ipcRenderer.invoke('window:toggleFullscreen'),
  onFullscreenChanged: (callback: (isFullscreen: boolean) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, isFullscreen: boolean) => callback(isFullscreen)
    ipcRenderer.on('fullscreen-changed', listener)
    return () => ipcRenderer.removeListener('fullscreen-changed', listener)
  },
  getPendingFilePath: () => ipcRenderer.invoke('get-pending-file-path'),
  saveFile: (data: string, defaultName: string) => ipcRenderer.invoke('dialog:saveFile', { data, defaultName }),
  showItemInFolder: (filePath: string) => ipcRenderer.invoke('shell:showItemInFolder', filePath),
  onOpenExternalFile: (callback: (filePath: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, filePath: string) => callback(filePath)
    ipcRenderer.on('open-external-file', listener)
    return () => ipcRenderer.removeListener('open-external-file', listener)
  },
  onAIAction: (callback: (command: any) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, command: any) => callback(command)
    ipcRenderer.on('ai:command', listener)
    return () => ipcRenderer.removeListener('ai:command', listener)
  },
  postAIResult: (payload: { id: string; data?: unknown; error?: string }) => {
    ipcRenderer.send('ai:commandResult', payload)
  },
  getPipedFiles: () => ipcRenderer.invoke('fs:getPipedFiles'),
  isStdinMode: () => ipcRenderer.invoke('fs:isStdinMode'),

  checkForUpdates: (manual: boolean) => ipcRenderer.invoke('update:check', manual),
  quitAndInstall: () => ipcRenderer.invoke('update:quit-and-install'),
  onUpdateEvent: (callback: (event: string, payload: any) => void) => {
    const channels = [
      'update:checking',
      'update:available',
      'update:not-available',
      'update:download-progress',
      'update:downloaded',
      'update:error',
    ]
    const listeners = channels.map((channel) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: any) => callback(channel, payload)
      ipcRenderer.on(channel, listener)
      return { channel, listener }
    })
    return () => {
      for (const { channel, listener } of listeners) {
        ipcRenderer.removeListener(channel, listener)
      }
    }
  },
})

// Expose build info to renderer
contextBridge.exposeInMainWorld('env', {
  DEV: import.meta.env.DEV,
  PROD: !import.meta.env.DEV,
  E2E: process.env.E2E === '1',

  // Telemetry
  DATA_REGION: process.env.EDITION === 'cn' ? 'cn' : (process.env.DATA_REGION || 'us'),
  EDITION: process.env.EDITION || undefined,

  // Version info
  APP_VERSION: process.env.VITE_GIT_COMMIT || 'unknown',
  READABLE_VERSION: '',
})