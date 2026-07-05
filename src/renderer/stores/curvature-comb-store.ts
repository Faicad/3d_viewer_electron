import { create } from 'zustand'
import { toast } from 'sonner'

export interface CurvatureCombState {
  enabled: boolean
  scale: number
  color: [number, number, number]
  width: number
  autoScale: boolean
  setEnabled: (v: boolean) => void
  setScale: (v: number) => void
  setColor: (v: [number, number, number]) => void
  setWidth: (v: number) => void
  setAutoScale: (v: boolean) => void
  resetToDefaults: () => void
}

export const useCurvatureCombStore = create<CurvatureCombState>()((set) => ({
  enabled: false,
  scale: 1,
  color: [0, 0.7, 0],
  width: 1.5,
  autoScale: true,
  setEnabled: (v) => set({ enabled: v }),
  setScale: (v) => set({ scale: Math.max(0.01, Math.min(100, v)) }),
  setColor: (v) => set({ color: v }),
  setWidth: (v) => set({ width: Math.max(0.5, Math.min(5, v)) }),
  setAutoScale: (v) => set({ autoScale: v }),
  resetToDefaults: () => set({
    enabled: false,
    scale: 1,
    color: [0, 0.7, 0],
    width: 1.5,
    autoScale: true,
  }),
}))

export function tryToggleCurvatureComb(): boolean {
  const next = !useCurvatureCombStore.getState().enabled
  useCurvatureCombStore.getState().setEnabled(next)
  if (next) {
    toast.info('曲率梳已开启（Alt+C 切换）')
  } else {
    toast.info('曲率梳已关闭')
  }
  return true
}
