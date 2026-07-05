import { create } from 'zustand'
import { useEngineStore } from './engine-store'
import { useModelStore } from './model-store'
import { useUIStore } from './ui-store'
import { useZebraStore } from './zebra-store'
import { useDraftAnalysisStore } from './draft-analysis-store'
import { useSurfaceAnalysisStore } from './surface-analysis-store'
import { toast } from 'sonner'

interface CrossSectionState {
  panelOpen: boolean
  planeX: { position: number }
  planeY: { position: number }
  planeZ: { position: number }
  showClipPlane: boolean
  useObjectColor: boolean
  setPanelOpen: (v: boolean) => void
  setPlanePosition: (axis: 'x' | 'y' | 'z', value: number) => void
  setShowClipPlane: (v: boolean) => void
  setUseObjectColor: (v: boolean) => void
  resetToDefaults: () => void
}

export const useCrossSectionStore = create<CrossSectionState>()((set) => ({
  panelOpen: false,
  planeX: { position: 100 },
  planeY: { position: 0 },
  planeZ: { position: 100 },
  showClipPlane: false,
  useObjectColor: false,
  setPanelOpen: (v) => set({ panelOpen: v }),
  resetToDefaults: () => set({
    planeX: { position: 100 },
    planeY: { position: 0 },
    planeZ: { position: 100 },
    showClipPlane: false,
    useObjectColor: false,
  }),
  setPlanePosition: (axis, value) => {
    const key = `plane${axis.toUpperCase() as 'X' | 'Y' | 'Z'}`
    set((_s) => ({ [key]: { position: value } }))
  },
  setShowClipPlane: (v) => set({ showClipPlane: v }),
  setUseObjectColor: (v) => set({ useObjectColor: v }),
}))

export function tryToggleCrossSection(): boolean {
  const { studioMode } = useEngineStore.getState()
  const { loadedFiles } = useModelStore.getState()
  if (studioMode) {
    toast('请先进入 CAD 模式（Alt+P 大写）')
    return false
  }
  if (loadedFiles.length !== 1) {
    toast('剖面功能仅支持单文件')
    return false
  }
  if (useUIStore.getState().displayMode !== 'solid') {
    toast('剖面功能仅支持 solid 显示模式')
    return false
  }
  const next = !useCrossSectionStore.getState().panelOpen
  if (next) {
    useZebraStore.getState().setEnabled(false)
    useDraftAnalysisStore.getState().setEnabled(false)
    useSurfaceAnalysisStore.getState().setEnabled(false)
  }
  useCrossSectionStore.getState().setPanelOpen(next)
  return true
}
