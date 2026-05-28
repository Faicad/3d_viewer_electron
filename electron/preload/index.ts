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
  openEnvironmentMapDialog: () => ipcRenderer.invoke('dialog:openEnvironmentMap'),
  toggleFullscreen: () => ipcRenderer.invoke('window:toggleFullscreen'),
  onFullscreenChanged: (callback: (isFullscreen: boolean) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, isFullscreen: boolean) => callback(isFullscreen)
    ipcRenderer.on('fullscreen-changed', listener)
    return () => ipcRenderer.removeListener('fullscreen-changed', listener)
  },
  getPendingFilePath: () => ipcRenderer.invoke('get-pending-file-path'),
  onOpenExternalFile: (callback: (filePath: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, filePath: string) => callback(filePath)
    ipcRenderer.on('open-external-file', listener)
    return () => ipcRenderer.removeListener('open-external-file', listener)
  },
})

// Expose build info to renderer
contextBridge.exposeInMainWorld('env', {
  DEV: import.meta.env.DEV,
  PROD: !import.meta.env.DEV,
  E2E: process.env.E2E === '1',
})