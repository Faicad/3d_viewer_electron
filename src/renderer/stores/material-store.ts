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
  materialEditorTitle: string
  isEditingDefault: boolean

  // ---- 原始材质外观（从模型文件中提取） ----
  materialOriginals: Record<string, MaterialAppearance>

  // ---- 纹理缩略图（per-part, per-slot 20×20 thumbnails） ----
  textureThumbnails: Record<string, Record<string, string>>

  // ---- 默认材质 ----
  defaultMaterial: MaterialAppearance | null

  // ---- A/B 对比 ----
  viewingOriginal: boolean

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

  openMaterialEditor: (keys: string[], title: string) => void
  openDefaultMaterialEditor: () => void
  closeMaterialEditor: () => void
  setMaterialEditorPosition: (pos: { x: number; y: number }) => void
  setDefaultMaterial: (appearance: MaterialAppearance | null) => void

  setMaterialOriginalsForFile: (fileId: string, originals: Record<string, MaterialAppearance>) => void
  clearMaterialOriginalsForFile: (fileId: string) => void
  setTextureThumbnailsForFile: (fileId: string, thumbs: Record<string, Record<string, string>>) => void
  clearTextureThumbnailsForFile: (fileId: string) => void

  toggleViewingOriginal: () => void
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
  materialEditorTitle: '',
  isEditingDefault: false,

  defaultMaterial: null,

  materialOriginals: {},

  textureThumbnails: {},

  viewingOriginal: false,

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

  openMaterialEditor: (keys, title) =>
    set({ materialEditorVisible: true, editingOverrideKeys: keys, materialEditorTitle: title, isEditingDefault: false }),

  openDefaultMaterialEditor: () =>
    set({ materialEditorVisible: true, editingOverrideKeys: [], materialEditorTitle: '', isEditingDefault: true }),

  closeMaterialEditor: () => set({ materialEditorVisible: false, isEditingDefault: false }),

  setDefaultMaterial: (appearance) => set({ defaultMaterial: appearance }),

  setMaterialEditorPosition: (pos) => set({ materialEditorPosition: pos }),

  setMaterialOriginalsForFile: (fileId, originals) => {
    set((s) => {
      const prefix = `${fileId}:`
      const next: Record<string, MaterialAppearance> = {}
      for (const key of Object.keys(s.materialOriginals)) {
        if (!key.startsWith(prefix)) {
          next[key] = s.materialOriginals[key]
        }
      }
      for (const [partId, app] of Object.entries(originals)) {
        next[`${fileId}:${partId}`] = app
      }
      return { materialOriginals: next }
    })
  },

  clearMaterialOriginalsForFile: (fileId) => {
    set((s) => {
      const prefix = `${fileId}:`
      const next: Record<string, MaterialAppearance> = {}
      for (const key of Object.keys(s.materialOriginals)) {
        if (!key.startsWith(prefix)) {
          next[key] = s.materialOriginals[key]
        }
      }
      return { materialOriginals: next }
    })
  },

  setTextureThumbnailsForFile: (fileId, thumbs) => {
    set((s) => {
      const prefix = `${fileId}:`
      const next: Record<string, Record<string, string>> = {}
      for (const key of Object.keys(s.textureThumbnails)) {
        if (!key.startsWith(prefix)) next[key] = s.textureThumbnails[key]
      }
      for (const [partId, slotThumbs] of Object.entries(thumbs)) {
        next[`${fileId}:${partId}`] = slotThumbs
      }
      return { textureThumbnails: next }
    })
  },

  clearTextureThumbnailsForFile: (fileId) => {
    set((s) => {
      const prefix = `${fileId}:`
      const next: Record<string, Record<string, string>> = {}
      for (const key of Object.keys(s.textureThumbnails)) {
        if (!key.startsWith(prefix)) next[key] = s.textureThumbnails[key]
      }
      return { textureThumbnails: next }
    })
  },

  toggleViewingOriginal: () => set((s) => ({ viewingOriginal: !s.viewingOriginal })),

  getEffectiveAppearance: (fileId, partId) => {
    const key = makeOverrideKey(fileId, partId)
    return get().materialOverrides[key] ?? null
  },
}))
