import { create } from 'zustand'
import { useEngineStore } from './engine-store'
import { useModelStore } from './model-store'
import { useDraftAnalysisStore } from './draft-analysis-store'
import { useSurfaceAnalysisStore } from './surface-analysis-store'
import { toast } from 'sonner'

export type ZebraColorScheme = 'blackwhite' | 'colorful' | 'grayscale'
export type ZebraMappingMode = 'reflection' | 'normal'

interface ZebraState {
  enabled: boolean
  stripeCount: number
  stripeOpacity: number
  stripeDirection: number
  colorScheme: ZebraColorScheme
  mappingMode: ZebraMappingMode
  setEnabled: (v: boolean) => void
  setStripeCount: (v: number) => void
  setStripeOpacity: (v: number) => void
  setStripeDirection: (v: number) => void
  setColorScheme: (v: ZebraColorScheme) => void
  setMappingMode: (v: ZebraMappingMode) => void
  resetToDefaults: () => void
}

export const useZebraStore = create<ZebraState>()((set) => ({
  enabled: false,
  stripeCount: 15,
  stripeOpacity: 1.0,
  stripeDirection: 0,
  colorScheme: 'blackwhite',
  mappingMode: 'normal',
  setEnabled: (v) => set({ enabled: v }),
  setStripeCount: (v) => set({ stripeCount: Math.max(2, Math.min(50, v)) }),
  setStripeOpacity: (v) => set({ stripeOpacity: Math.max(0, Math.min(1, v)) }),
  setStripeDirection: (v) => set({ stripeDirection: v }),
  setColorScheme: (v) => set({ colorScheme: v }),
  setMappingMode: (v) => set({ mappingMode: v }),
  resetToDefaults: () => set({
    stripeCount: 15,
    stripeOpacity: 1.0,
    stripeDirection: 0,
    colorScheme: 'blackwhite',
    mappingMode: 'normal',
  }),
}))

export function tryToggleZebra(): boolean {
  const { studioMode } = useEngineStore.getState()
  const { loadedFiles } = useModelStore.getState()
  if (studioMode) {
    useEngineStore.getState().setStudioMode(false)
  }
  if (loadedFiles.length !== 1) {
    toast('斑马纹功能仅支持单文件')
    return false
  }
  const next = !useZebraStore.getState().enabled
  if (next) {
    useDraftAnalysisStore.getState().setEnabled(false)
    useSurfaceAnalysisStore.getState().setEnabled(false)
  }
  useZebraStore.getState().setEnabled(next)
  return true
}
