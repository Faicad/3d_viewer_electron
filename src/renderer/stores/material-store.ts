import { create } from 'zustand'
import type { MaterialAppearance } from '@/engine/material/types'

export function makeOverrideKey(fileId: string, partId: string): string {
  return `${fileId}:${partId}`
}

export function parseOverrideKey(key: string): { fileId: string; partId: string } {
  const idx = key.indexOf(':')
  return { fileId: key.slice(0, idx), partId: key.slice(idx + 1) }
}

interface MaterialStore {
  // ---- 材质覆盖数据 ----
  materialOverrides: Record<string, MaterialAppearance>

  // ---- 编辑上下文 ----
  editingOverrideKeys: string[]

  // ---- 全局开关 ----
  overrideMaterial: boolean

  // ---- 预设引用追踪 ----
  overridePresetRefs: Record<string, string | null>

  // ---- 材质剪贴板 ----
  materialClipboard: MaterialAppearance | null

  // ---- 浮窗状态 ----
  materialEditorVisible: boolean
  materialEditorPosition: { x: number; y: number }

  // ---- Actions ----
  setMaterialOverride: (fileId: string, partId: string, appearance: MaterialAppearance) => void
  setMaterialOverrideBatch: (keys: string[], appearance: MaterialAppearance) => void
  removeMaterialOverride: (fileId: string, partId: string) => void
  clearAllOverrides: () => void

  setEditingOverrideKeys: (keys: string[]) => void
  setOverrideMaterial: (enabled: boolean) => void

  copyMaterialToClipboard: (appearance: MaterialAppearance) => void
  pasteMaterialFromClipboard: (fileId: string, partId: string) => void
  clearClipboard: () => void

  openMaterialEditor: (keys: string[]) => void
  closeMaterialEditor: () => void
  setMaterialEditorPosition: (pos: { x: number; y: number }) => void

  getEffectiveAppearance: (fileId: string, partId: string) => MaterialAppearance | null
}

export const useMaterialStore = create<MaterialStore>((set, get) => ({
  materialOverrides: {},

  editingOverrideKeys: [],

  overrideMaterial: true,

  overridePresetRefs: {},

  materialClipboard: null,

  materialEditorVisible: false,
  materialEditorPosition: { x: 100, y: 100 },

  // ---- Actions ----
  setMaterialOverride: (fileId, partId, appearance) => {
    const key = makeOverrideKey(fileId, partId)
    set((s) => ({
      materialOverrides: { ...s.materialOverrides, [key]: appearance },
    }))
  },

  setMaterialOverrideBatch: (keys, appearance) => {
    set((s) => {
      const next = { ...s.materialOverrides }
      for (const k of keys) next[k] = appearance
      return { materialOverrides: next }
    })
  },

  removeMaterialOverride: (fileId, partId) => {
    const key = makeOverrideKey(fileId, partId)
    set((s) => {
      const next = { ...s.materialOverrides }
      delete next[key]
      const nextRefs = { ...s.overridePresetRefs }
      delete nextRefs[key]
      return { materialOverrides: next, overridePresetRefs: nextRefs }
    })
  },

  clearAllOverrides: () =>
    set({ materialOverrides: {}, overridePresetRefs: {} }),

  setEditingOverrideKeys: (keys) => set({ editingOverrideKeys: keys }),

  setOverrideMaterial: (enabled) => set({ overrideMaterial: enabled }),

  copyMaterialToClipboard: (appearance) => set({ materialClipboard: appearance }),

  pasteMaterialFromClipboard: (fileId, partId) => {
    const { materialClipboard } = get()
    if (!materialClipboard) return
    const key = makeOverrideKey(fileId, partId)
    set((s) => ({
      materialOverrides: { ...s.materialOverrides, [key]: materialClipboard },
      overridePresetRefs: { ...s.overridePresetRefs, [key]: null },
    }))
  },

  clearClipboard: () => set({ materialClipboard: null }),

  openMaterialEditor: (keys) =>
    set({ materialEditorVisible: true, editingOverrideKeys: keys }),

  closeMaterialEditor: () => set({ materialEditorVisible: false }),

  setMaterialEditorPosition: (pos) => set({ materialEditorPosition: pos }),

  getEffectiveAppearance: (fileId, partId) => {
    const key = makeOverrideKey(fileId, partId)
    return get().materialOverrides[key] ?? null
  },
}))
