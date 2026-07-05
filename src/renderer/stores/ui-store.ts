import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { SupportedLanguage } from '@/i18n'
import { setTelemetryEnabled as setTelemetryModuleEnabled } from '@/telemetry'
import type { DisplayMode } from '@/engine/components/DisplayModeDropdown'

const isLocalStorageAvailable = typeof localStorage !== 'undefined'
const safeLocalStorage = {
  getItem: (key: string): string | null => {
    return isLocalStorageAvailable ? localStorage.getItem(key) : null
  },
  setItem: (key: string, value: string): void => {
    if (isLocalStorageAvailable) localStorage.setItem(key, value)
  },
  removeItem: (key: string): void => {
    if (isLocalStorageAvailable) localStorage.removeItem(key)
  },
}

export type CameraMode = 'perspective' | 'orthographic'

interface UIStore {
  leftPanelOpen: boolean
  rightPanelOpen: boolean
  modelInfoOpen: boolean
  historyPanelOpen: boolean
  environmentPanelOpen: boolean
  mobileDrawerOpen: boolean
  mobileChatOpen: boolean
  language: SupportedLanguage | 'system'
  theme: 'light' | 'dark' | 'system'
  cameraMode: CameraMode
  enablePreview: boolean
  telemetryEnabled: boolean
  isFullscreen: boolean
  headerVisible: boolean
  bottomVisible: boolean
  displayMode: DisplayMode

  setFullscreen: (v: boolean) => void
  setDisplayMode: (v: DisplayMode) => void
  setHeaderVisible: (v: boolean) => void
  setBottomVisible: (v: boolean) => void
  toggleLeftPanel: () => void
  toggleRightPanel: () => void
  toggleModelInfo: () => void
  toggleHistoryPanel: () => void
  toggleEnvironmentPanel: () => void
  envPanelPosition: { x: number; y: number }
  setEnvPanelPosition: (pos: { x: number; y: number }) => void
  modelInfoPanelPosition: { x: number; y: number }
  setModelInfoPanelPosition: (pos: { x: number; y: number }) => void
  setMobileDrawerOpen: (open: boolean) => void
  setMobileChatOpen: (open: boolean) => void
  setLanguage: (lang: SupportedLanguage | 'system') => void
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  setCameraMode: (mode: CameraMode) => void
  setEnablePreview: (v: boolean) => void
  setTelemetryEnabled: (v: boolean) => void
}

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      leftPanelOpen: true,
      rightPanelOpen: true,
      modelInfoOpen: false,
      historyPanelOpen: false,
      environmentPanelOpen: false,
      mobileDrawerOpen: false,
      mobileChatOpen: false,
      language: (safeLocalStorage.getItem('lang') as SupportedLanguage | 'system') || 'zh',
      theme: 'system',
      cameraMode: 'perspective',
      enablePreview: true,
      telemetryEnabled: true,
      isFullscreen: false,
      headerVisible: true,
      bottomVisible: true,
      displayMode: 'solid',

      setFullscreen: (v) => set({ isFullscreen: v }),
      setHeaderVisible: (v) => set({ headerVisible: v }),
      setBottomVisible: (v) => set({ bottomVisible: v }),
      setDisplayMode: (v) => set({ displayMode: v }),
      toggleLeftPanel: () => set((s) => ({ leftPanelOpen: !s.leftPanelOpen })),
      toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
      toggleModelInfo: () => set((s) => ({ modelInfoOpen: !s.modelInfoOpen })),
      toggleHistoryPanel: () => set((s) => ({ historyPanelOpen: !s.historyPanelOpen })),
      toggleEnvironmentPanel: () => set((s) => ({ environmentPanelOpen: !s.environmentPanelOpen })),
      envPanelPosition: { x: typeof window !== 'undefined' ? Math.max(100, window.innerWidth - 300) : 900, y: 80 },
      setEnvPanelPosition: (pos) => set({ envPanelPosition: pos }),
      modelInfoPanelPosition: { x: typeof window !== 'undefined' ? Math.max(100, window.innerWidth - 340) : 860, y: 80 },
      setModelInfoPanelPosition: (pos) => set({ modelInfoPanelPosition: pos }),
      setMobileDrawerOpen: (open) => set({ mobileDrawerOpen: open }),
      setMobileChatOpen: (open) => set({ mobileChatOpen: open }),
      setLanguage: (language) => {
        safeLocalStorage.setItem('lang', language)
        set({ language })
      },
      setTheme: (theme) => set({ theme }),
      setCameraMode: (cameraMode) => set({ cameraMode }),
      setEnablePreview: (enablePreview) => set({ enablePreview }),
      setTelemetryEnabled: (telemetryEnabled) => {
        setTelemetryModuleEnabled(telemetryEnabled)
        set({ telemetryEnabled })
      },
    }),
    {
      name: 'faicad-ui',
      partialize: (s) => ({ language: s.language, theme: s.theme, enablePreview: s.enablePreview, telemetryEnabled: s.telemetryEnabled }),
      storage: createJSONStorage(() => safeLocalStorage),
    }
  )
)
