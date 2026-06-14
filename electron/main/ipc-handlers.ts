import { ipcMain } from 'electron'
import { resolveRequest } from './server'

export function registerAIHandlers(): void {
  ipcMain.on('ai:commandResult', (_event, payload: { id: string; data?: unknown; error?: string }) => {
    resolveRequest(payload.id, payload.data, payload.error)
  })
}
