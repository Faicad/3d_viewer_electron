import { create } from 'zustand'

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

interface UpdateState {
  status: UpdateStatus
  version: string | null
  releaseNotes: string | null
  downloadProgress: number
  bytesPerSecond: number
  errorMessage: string | null
  manualCheck: boolean
}

interface UpdateActions {
  checkForUpdates: (manual: boolean) => void
  quitAndInstall: () => void
  reset: () => void
}

const initialState: UpdateState = {
  status: 'idle',
  version: null,
  releaseNotes: null,
  downloadProgress: 0,
  bytesPerSecond: 0,
  errorMessage: null,
  manualCheck: false,
}

export const useUpdateStore = create<UpdateState & UpdateActions>()((set) => ({
  ...initialState,

  checkForUpdates: (manual) => {
    window.electronAPI.checkForUpdates(manual)
    set({ status: 'checking', manualCheck: manual })
  },

  quitAndInstall: () => {
    window.electronAPI.quitAndInstall()
  },

  reset: () => set(initialState),
}))

export function bindUpdateEvents(): () => void {
  return window.electronAPI.onUpdateEvent((event, payload) => {
    switch (event) {
      case 'update:checking':
        useUpdateStore.setState({ status: 'checking' })
        break

      case 'update:available':
        useUpdateStore.setState({
          status: 'available',
          version: payload.version,
          releaseNotes: payload.releaseNotes ?? null,
        })
        break

      case 'update:not-available':
        useUpdateStore.setState({
          status: 'not-available',
          version: payload.version,
        })
        break

      case 'update:download-progress':
        useUpdateStore.setState({
          status: 'downloading',
          downloadProgress: payload.percent,
          bytesPerSecond: payload.bytesPerSecond,
        })
        break

      case 'update:downloaded':
        useUpdateStore.setState({
          status: 'downloaded',
          version: payload.version,
        })
        break

      case 'update:error':
        useUpdateStore.setState({
          status: 'error',
          errorMessage: payload.message,
        })
        break
    }
  })
}
