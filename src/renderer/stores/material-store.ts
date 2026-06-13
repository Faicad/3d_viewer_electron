import { create } from 'zustand'
import * as THREE from 'three'
import type { MaterialAppearance } from '@/engine/material/types'
import { clearThumbnailCache } from '@/lib/thumbnail-cache/thumbnailCache'
import { materialToAppearance } from '@/engine/components/cloneMaterial'
import { TEXTURE_PROPS } from '@/engine/material/property-map'
import { getSharedTextureCache } from '@/engine/material/MaterialFactory'
import { getMapColorSpace } from '@/engine/material/TextureCache'

export function makeOverrideKey(fileId: string, partId: string): string {
  return `${fileId}:${partId}`
}

export function parseOverrideKey(key: string): { fileId: string; partId: string } {
  const idx = key.indexOf(':')
  return { fileId: key.slice(0, idx), partId: key.slice(idx + 1) }
}

// ---- 材质外观按需生成 ----
interface MeshLookupEntry {
  mesh: THREE.Mesh
  originalMaterial: THREE.Material | THREE.Material[] | null | undefined
  name: string
}
type MeshLookupFn = (partId: string) => MeshLookupEntry | undefined

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

  // ---- 按需生成材质外观 ----
  meshLookups: Record<string, MeshLookupFn>
  inflightAppearances: Set<string>

  // ---- 默认材质 ----
  defaultMaterial: MaterialAppearance | null

  // ---- A/B 对比 ----
  viewingOriginal: boolean

  // ---- 纹理预览弹窗 ----
  texturePreviewSlot: string | null
  texturePreviewLabel: string | null

  // ---- Actions ----
  openTexturePreview: (slot: string, label: string) => void
  closeTexturePreview: () => void
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

  registerMeshLookup: (fileId: string, fn: MeshLookupFn) => void
  unregisterMeshLookup: (fileId: string) => void
  ensureAppearance: (fileId: string, partId: string) => MaterialAppearance | undefined

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

  meshLookups: {},
  inflightAppearances: new Set(),

  viewingOriginal: false,

  texturePreviewSlot: null,
  texturePreviewLabel: null,

  // ---- Actions ----
  openTexturePreview: (slot, label) => set({ texturePreviewSlot: slot, texturePreviewLabel: label }),
  closeTexturePreview: () => set({ texturePreviewSlot: null, texturePreviewLabel: null }),

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

  openMaterialEditor: (keys, title) => {
    // Trigger lazy material appearance generation before the editor renders,
    // so the first render already has the correct alphaMode/texture data.
    const primaryKey = keys[0]
    if (primaryKey) {
      const idx = primaryKey.indexOf(':')
      if (idx > 0) {
        get().ensureAppearance(primaryKey.slice(0, idx), primaryKey.slice(idx + 1))
      }
    }
    set({ materialEditorVisible: true, editingOverrideKeys: keys, materialEditorTitle: title, isEditingDefault: false })
  },

  openDefaultMaterialEditor: () =>
    set({ materialEditorVisible: true, editingOverrideKeys: [], materialEditorTitle: '', isEditingDefault: true }),

  closeMaterialEditor: () => set({ materialEditorVisible: false, isEditingDefault: false }),

  setDefaultMaterial: (appearance) => {
    set({ defaultMaterial: appearance })
    // Invalidate cached thumbnails so they reflect the new default material.
    // Fire-and-forget — failures are logged but don't block the UI.
    clearThumbnailCache().catch(() => {})
  },

  setMaterialEditorPosition: (pos) => set({ materialEditorPosition: pos }),

  registerMeshLookup: (fileId, fn) => {
    set((s) => ({
      meshLookups: { ...s.meshLookups, [fileId]: fn },
    }))
  },

  unregisterMeshLookup: (fileId) => {
    set((s) => {
      const next = { ...s.meshLookups }
      delete next[fileId]
      return { meshLookups: next }
    })
  },

  ensureAppearance: (fileId, partId) => {
    const state = get()
    const primaryKey = partId.startsWith(fileId + ':') ? partId : `${fileId}:${partId}`

    // 1. 已缓存 → 直接返回
    if (state.materialOriginals[primaryKey]) {
      return state.materialOriginals[primaryKey]
    }

    // 2. 正在生成中 → 避免并发重复生成
    if (state.inflightAppearances.has(primaryKey)) {
      return undefined
    }

    // 3. 查找 mesh
    const lookup = state.meshLookups[fileId]
    if (!lookup) return undefined

    const entry = lookup(primaryKey)
    if (!entry?.originalMaterial) return undefined

    // 4. 标记 inflight
    const nextInflight = new Set(state.inflightAppearances)
    nextInflight.add(primaryKey)
    set({ inflightAppearances: nextInflight })

    const cleanupInflight = () => {
      set((s) => {
        const cleaned = new Set(s.inflightAppearances)
        cleaned.delete(primaryKey)
        return { inflightAppearances: cleaned }
      })
    }

    try {
      const thumbCache = new WeakMap<object, string>()
      const { appearance: app, textures } = materialToAppearance(
        entry.originalMaterial,
        entry.name,
        thumbCache,
      )
      if (!app) {
        cleanupInflight()
        return undefined
      }

      // 5. 增量写入 store
      const originalsPatch: Record<string, MaterialAppearance> = { [primaryKey]: app }
      const thumbsPatch: Record<string, Record<string, string>> = {}
      const slotThumbs: Record<string, string> = {}
      for (const [slot, info] of Object.entries(textures)) {
        if (info.thumbnail) slotThumbs[slot] = info.thumbnail
      }
      if (Object.keys(slotThumbs).length > 0) {
        thumbsPatch[primaryKey] = slotThumbs
      }

      set((s) => ({
        materialOriginals: { ...s.materialOriginals, ...originalsPatch },
        textureThumbnails: { ...s.textureThumbnails, ...thumbsPatch },
        inflightAppearances: (() => {
          const cleaned = new Set(s.inflightAppearances)
          cleaned.delete(primaryKey)
          return cleaned
        })(),
      }))

      // 6. 预加载纹理到共享 TextureCache
      const textureCache = getSharedTextureCache()
      for (const key of TEXTURE_PROPS) {
        const url = (app as Record<string, unknown>)[key]
        if (typeof url === 'string' && url.length > 0) {
          const cs = getMapColorSpace(key)
          textureCache.load(url, cs === 'sRGB' ? 'sRGB' : 'linear').catch((err) => {
            console.warn('[ensureAppearance] texture pre-cache failed for', key, err)
          })
        }
      }

      return app
    } catch (e) {
      cleanupInflight()
      console.warn('[ensureAppearance] failed for', primaryKey, e)
      return undefined
    }
  },

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
        // partId may already be scoped (e.g. "fileId:o1" from multi-file
        // ModelGroup) or unscoped (e.g. "o1" from single-file or tests).
        // Only add the prefix when not already present.
        next[partId.startsWith(prefix) ? partId : `${prefix}${partId}`] = app
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
        // partId may already be scoped — only add prefix when not present
        next[partId.startsWith(prefix) ? partId : `${prefix}${partId}`] = slotThumbs
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
