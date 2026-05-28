import { create } from 'zustand'
import type { GlbExtensionData } from '@/engine/gltfExtensions'

interface GlbExtensionStore {
  panelVisible: boolean
  panelPosition: { x: number; y: number }
  activeFileId: string | null
  dataByFileId: Record<string, GlbExtensionData>

  openPanel: (fileId: string) => void
  closePanel: () => void
  setPanelPosition: (pos: { x: number; y: number }) => void
  setData: (fileId: string, data: GlbExtensionData) => void
  clearData: (fileId: string) => void
}

export const useGlbExtensionStore = create<GlbExtensionStore>((set, get) => ({
  panelVisible: false,
  panelPosition: { x: 150, y: 150 },
  activeFileId: null,
  dataByFileId: {},

  openPanel: (fileId) => {
    const data = get().dataByFileId[fileId]
    if (!data) return
    set({ panelVisible: true, activeFileId: fileId })
  },
  closePanel: () => set({ panelVisible: false, activeFileId: null }),
  setPanelPosition: (pos) => set({ panelPosition: pos }),
  setData: (fileId, data) =>
    set((s) => ({
      dataByFileId: { ...s.dataByFileId, [fileId]: data },
    })),
  clearData: (fileId) =>
    set((s) => {
      const next = { ...s.dataByFileId }
      delete next[fileId]
      if (s.activeFileId === fileId) {
        return { dataByFileId: next, panelVisible: false, activeFileId: null }
      }
      return { dataByFileId: next }
    }),
}))
