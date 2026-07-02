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