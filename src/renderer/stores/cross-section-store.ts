import { create } from 'zustand'

export interface PlaneState {
  /** 0–100, percentage along the bounding box. 0% = min edge, 100% = max edge. */
  position: number
}

export interface CrossSectionStore {
  planeX: PlaneState
  planeY: PlaneState
  planeZ: PlaneState

  setPlanePosition: (axis: 'x' | 'y' | 'z', position: number) => void

  showClipPlane: boolean
  setShowClipPlane: (v: boolean) => void

  useObjectColor: boolean
  setUseObjectColor: (v: boolean) => void

  /** When panel is open, cross-section is active. */
  panelOpen: boolean
  setPanelOpen: (v: boolean) => void
}

export const useCrossSectionStore = create<CrossSectionStore>()((set) => ({
  // Default: camera at [5, -5, 3] — X on +X side (100%), Y on -Y side (0%), Z on +Z side (100%)
  planeX: { position: 100 },
  planeY: { position: 0 },
  planeZ: { position: 100 },

  setPlanePosition: (axis, position) => set((s) => ({
    planeX: axis === 'x' ? { ...s.planeX, position } : s.planeX,
    planeY: axis === 'y' ? { ...s.planeY, position } : s.planeY,
    planeZ: axis === 'z' ? { ...s.planeZ, position } : s.planeZ,
  })),

  showClipPlane: true,
  setShowClipPlane: (v) => set({ showClipPlane: v }),

  useObjectColor: false,
  setUseObjectColor: (v) => set({ useObjectColor: v }),

  panelOpen: false,
  setPanelOpen: (v) => set({ panelOpen: v }),
}))
