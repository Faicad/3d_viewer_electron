import { create } from 'zustand'
import { useEngineStore } from './engine-store'
import { useModelStore } from './model-store'
import { useZebraStore } from './zebra-store'
import { useCrossSectionStore } from './cross-section-store'
import { useSurfaceAnalysisStore } from './surface-analysis-store'
import { toast } from 'sonner'

export type DraftColorZone =
  | 'inDraftPos'
  | 'inTolerancePos'
  | 'outOfDraftPos'
  | 'inDraftNeg'
  | 'inToleranceNeg'
  | 'outOfDraftNeg'

export type DraftColorMap = Record<DraftColorZone, [number, number, number]>

interface DraftAnalysisState {
  enabled: boolean
  pullDirection: [number, number, number]
  draftAnglePos: number
  draftAngleNeg: number
  draftTolPos: number
  draftTolNeg: number
  shading: number
  colors: DraftColorMap
  setEnabled: (v: boolean) => void
  setPullDirection: (v: [number, number, number]) => void
  setDraftAnglePos: (v: number) => void
  setDraftAngleNeg: (v: number) => void
  setDraftTolPos: (v: number) => void
  setDraftTolNeg: (v: number) => void
  setShading: (v: number) => void
  setColor: (zone: DraftColorZone, color: [number, number, number]) => void
  resetToDefaults: () => void
}

const DEFAULT_COLORS: DraftColorMap = {
  inDraftPos: [0, 0, 1],
  inTolerancePos: [0, 1, 1],
  outOfDraftPos: [1, 0, 0],
  inDraftNeg: [0, 1, 0],
  inToleranceNeg: [1, 1, 0],
  outOfDraftNeg: [1, 0, 0],
}

export const useDraftAnalysisStore = create<DraftAnalysisState>()((set) => ({
  enabled: false,
  pullDirection: [0, 0, 1],
  draftAnglePos: 1.0,
  draftAngleNeg: 1.0,
  draftTolPos: 0.05,
  draftTolNeg: 0.05,
  shading: 0.2,
  colors: { ...DEFAULT_COLORS },
  setEnabled: (v) => set({ enabled: v }),
  setPullDirection: (v) => set({ pullDirection: v }),
  setDraftAnglePos: (v) => set({ draftAnglePos: Math.max(0, Math.min(90, v)) }),
  setDraftAngleNeg: (v) => set({ draftAngleNeg: Math.max(0, Math.min(90, v)) }),
  setDraftTolPos: (v) => set({ draftTolPos: Math.max(0, Math.min(90, v)) }),
  setDraftTolNeg: (v) => set({ draftTolNeg: Math.max(0, Math.min(90, v)) }),
  setShading: (v) => set({ shading: Math.max(0, Math.min(1, v)) }),
  setColor: (zone, color) => set((s) => ({ colors: { ...s.colors, [zone]: color } })),
  resetToDefaults: () => set({
    pullDirection: [0, 0, 1],
    draftAnglePos: 1.0,
    draftAngleNeg: 1.0,
    draftTolPos: 0.05,
    draftTolNeg: 0.05,
    shading: 0.2,
    colors: { ...DEFAULT_COLORS },
  }),
}))

export function tryToggleDraftAnalysis(): boolean {
  const { studioMode } = useEngineStore.getState()
  const { loadedFiles } = useModelStore.getState()
  if (studioMode) {
    toast('请先进入 CAD 模式（Alt+P 大写）')
    return false
  }
  if (loadedFiles.length !== 1) {
    toast('拔模分析仅支持单文件')
    return false
  }
  const next = !useDraftAnalysisStore.getState().enabled
  if (next) {
    useZebraStore.getState().setEnabled(false)
    useCrossSectionStore.getState().setPanelOpen(false)
    useSurfaceAnalysisStore.getState().setEnabled(false)
  }
  useDraftAnalysisStore.getState().setEnabled(next)
  return true
}
