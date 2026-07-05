import { create } from 'zustand'
import { useEngineStore } from './engine-store'
import { useModelStore } from './model-store'
import { useZebraStore } from './zebra-store'
import { useDraftAnalysisStore } from './draft-analysis-store'
import { useCrossSectionStore } from './cross-section-store'
import { toast } from 'sonner'

export type CurvesAnalysisMode = 'zebra' | 'rainbow' | 'isophote'

interface SurfaceAnalysisState {
  enabled: boolean
  mode: CurvesAnalysisMode
  analysisDirection: [number, number, number]
  fixedDirection: boolean
  stripesNumber: number
  stripesRatio: number
  color1: [number, number, number]
  color2: [number, number, number]
  shading: number
  rainbowAngle1: number
  rainbowAngle2: number
  isoAngles: number[]
  isoTolerance: number
  setEnabled: (v: boolean) => void
  setMode: (v: CurvesAnalysisMode) => void
  setAnalysisDirection: (v: [number, number, number]) => void
  setFixedDirection: (v: boolean) => void
  setStripesNumber: (v: number) => void
  setStripesRatio: (v: number) => void
  setColor1: (v: [number, number, number]) => void
  setColor2: (v: [number, number, number]) => void
  setShading: (v: number) => void
  setRainbowAngle1: (v: number) => void
  setRainbowAngle2: (v: number) => void
  setIsoAngles: (v: number[]) => void
  setIsoTolerance: (v: number) => void
  resetToDefaults: () => void
}

const DEFAULT_DIRECTION: [number, number, number] = [1, 0, 0]

export const useSurfaceAnalysisStore = create<SurfaceAnalysisState>()((set) => ({
  enabled: false,
  mode: 'zebra',
  analysisDirection: DEFAULT_DIRECTION,
  fixedDirection: false,
  stripesNumber: 12,
  stripesRatio: 0.5,
  color1: [1, 1, 1],
  color2: [0, 0, 0],
  shading: 0.2,
  rainbowAngle1: 0,
  rainbowAngle2: 180,
  isoAngles: [45, 90, 135],
  isoTolerance: 0.5,
  setEnabled: (v) => set({ enabled: v }),
  setMode: (v) => set({ mode: v }),
  setAnalysisDirection: (v) => set((s) => {
    if (s.analysisDirection[0] === v[0] && s.analysisDirection[1] === v[1] && s.analysisDirection[2] === v[2]) return {}
    return { analysisDirection: v }
  }),
  setFixedDirection: (v) => set({ fixedDirection: v }),
  setStripesNumber: (v) => set({ stripesNumber: Math.max(1, Math.min(50, v)) }),
  setStripesRatio: (v) => set({ stripesRatio: Math.max(0, Math.min(1, v)) }),
  setColor1: (v) => set({ color1: v }),
  setColor2: (v) => set({ color2: v }),
  setShading: (v) => set({ shading: Math.max(0, Math.min(1, v)) }),
  setRainbowAngle1: (v) => set({ rainbowAngle1: Math.max(0, Math.min(180, v)) }),
  setRainbowAngle2: (v) => set({ rainbowAngle2: Math.max(0, Math.min(180, v)) }),
  setIsoAngles: (v) => set({ isoAngles: v }),
  setIsoTolerance: (v) => set({ isoTolerance: Math.max(0, Math.min(10, v)) }),
  resetToDefaults: () => set({
    mode: 'zebra',
    analysisDirection: DEFAULT_DIRECTION,
    fixedDirection: false,
    stripesNumber: 12,
    stripesRatio: 0.5,
    color1: [1, 1, 1],
    color2: [0, 0, 0],
    shading: 0.2,
    rainbowAngle1: 0,
    rainbowAngle2: 180,
    isoAngles: [45, 90, 135],
    isoTolerance: 0.5,
  }),
}))

export function tryToggleSurfaceAnalysis(): boolean {
  const { studioMode } = useEngineStore.getState()
  const { loadedFiles } = useModelStore.getState()
  if (studioMode) {
    toast('请先进入 CAD 模式（Alt+P 大写）')
    return false
  }
  if (loadedFiles.length !== 1) {
    toast('曲面分析仅支持单文件')
    return false
  }
  const next = !useSurfaceAnalysisStore.getState().enabled
  if (next) {
    useZebraStore.getState().setEnabled(false)
    useDraftAnalysisStore.getState().setEnabled(false)
    useCrossSectionStore.getState().setPanelOpen(false)
  }
  useSurfaceAnalysisStore.getState().setEnabled(next)
  return true
}
