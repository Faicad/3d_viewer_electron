import { create } from 'zustand'
import * as THREE from 'three'
import { HEATBED_DEFAULT_FORMATS } from '@/engine/heatbed'
import type { FormatId } from '@/config/file-formats'
import { isCadSkillGlb } from '@/config/file-formats'

const CUSTOM_ENV_KEY = 'faicad-custom-env'

export interface CustomEnvEntry {
  id: string
  path: string
  name: string
}

interface PersistedEnv {
  selectedEnv: string
  customEnvs: CustomEnvEntry[]
  nextCustomId: number
}

function loadPersistedEnv(): PersistedEnv {
  try {
    const raw = localStorage.getItem(CUSTOM_ENV_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      // Migrate old single-custom format
      if (parsed.customEnvPath && !parsed.customEnvs) {
        return {
          selectedEnv: parsed.selectedEnv === '__custom__' ? 'custom_0' : (parsed.selectedEnv || 'studio'),
          customEnvs: [{ id: 'custom_0', path: parsed.customEnvPath, name: parsed.customEnvName || '' }],
          nextCustomId: 1,
        }
      }
      return {
        selectedEnv: parsed.selectedEnv || 'studio',
        customEnvs: Array.isArray(parsed.customEnvs) ? parsed.customEnvs : [],
        nextCustomId: typeof parsed.nextCustomId === 'number' ? parsed.nextCustomId : 0,
      }
    }
  } catch { /* ignore */ }
  return { selectedEnv: 'studio', customEnvs: [], nextCustomId: 0 }
}

function savePersistedEnv(env: PersistedEnv): void {
  try {
    localStorage.setItem(CUSTOM_ENV_KEY, JSON.stringify(env))
  } catch { /* ignore */ }
}

const persisted = loadPersistedEnv()

interface EngineStore {
  camera: THREE.PerspectiveCamera | null
  scene: THREE.Scene | null
  gl: THREE.WebGLRenderer | null

  // Accumulated world transform of the model group (set by TransformControls)
  modelTransform: THREE.Matrix4 | null
  setModelTransform: (t: THREE.Matrix4 | null) => void

  // Reference to the loaded model group (for stats computation outside Canvas)
  modelGroup: THREE.Group | null
  setModelGroup: (g: THREE.Group | null) => void

  // ---------------------------------------------------------------------------
  // Environment / IBL
  // ---------------------------------------------------------------------------
  envIntensity: number
  setEnvIntensity: (v: number) => void
  envRotation: number
  setEnvRotation: (v: number) => void
  selectedEnv: string
  setSelectedEnv: (v: string) => void
  customEnvs: CustomEnvEntry[]
  addCustomEnv: (path: string, name: string) => void
  removeCustomEnv: (id: string) => void
  pendingCustomLoad: { id: string; path: string; name: string } | null
  clearPendingCustomLoad: () => void
  nextCustomId: number
  envBackground: string
  setEnvBackground: (v: string) => void
  // ---------------------------------------------------------------------------
  // Shadow floor
  // ---------------------------------------------------------------------------
  shadowFloorEnabled: boolean
  setShadowFloorEnabled: (v: boolean) => void
  shadowOpacity: number
  setShadowOpacity: (v: number) => void
  modelBbox: [number, number, number, number, number, number] | null
  setModelBbox: (b: [number, number, number, number, number, number] | null) => void

  // ---------------------------------------------------------------------------
  // Heatbed
  // ---------------------------------------------------------------------------
  showHeatbed: boolean
  /** True when user/test called setShowHeatbed — initShowHeatbed skips when set */
  _heatbedExplicitlySet: boolean
  setShowHeatbed: (v: boolean) => void
  /** Initialize showHeatbed default based on file format (and buffer for STEP→GLB detection).
   *  Respects explicit user/test toggles — does NOT override if _heatbedExplicitlySet is true. */
  initShowHeatbed: (format: FormatId | null, buffer?: ArrayBuffer | null) => void
  bedSize: number
  setBedSize: (v: number) => void
  /** rawToMM factor matching current model's sourceUnit (for grid step calc) */
  bedRawToMM: number
  setBedRawToMM: (v: number) => void

  // Camera auto-fit animation state (primarily for E2E tests)
  __animActive: boolean
  set__animActive: (v: boolean) => void

  highlightVersion: number
  bumpHighlightVersion: () => void

  // ---------------------------------------------------------------------------
  // Post-processing
  // ---------------------------------------------------------------------------
  smaaEnabled: boolean
  setSmaaEnabled: (v: boolean) => void
  shadowIntensity: number
  setShadowIntensity: (v: number) => void
  shadowSoftness: number
  setShadowSoftness: (v: number) => void

  // ---------------------------------------------------------------------------
  // Texture mapping
  // ---------------------------------------------------------------------------
  anisotropy: number
  setAnisotropy: (v: number) => void

  // ---------------------------------------------------------------------------
  // Engine objects
  // ---------------------------------------------------------------------------
  setEngineObjects: (info: { camera: THREE.Camera; scene: THREE.Scene; gl: THREE.WebGLRenderer }) => void
  clearEngineObjects: () => void
}

export const useEngineStore = create<EngineStore>((set, get) => ({
  camera: null,
  scene: null,
  gl: null,
  modelTransform: null,
  modelGroup: null,

  setModelTransform: (t) => set({ modelTransform: t }),
  setModelGroup: (g) => set({ modelGroup: g }),

  // Environment defaults
  envIntensity: 1.0,
  setEnvIntensity: (v) => set({ envIntensity: v }),
  envRotation: 0,
  setEnvRotation: (v) => set({ envRotation: v }),
  selectedEnv: persisted.selectedEnv,
  setSelectedEnv: (v) => {
    const s = get()
    savePersistedEnv({ selectedEnv: v, customEnvs: s.customEnvs, nextCustomId: s.nextCustomId })
    set({ selectedEnv: v })
  },
  customEnvs: persisted.customEnvs,
  addCustomEnv: (path, name) => {
    const s = get()
    const id = `custom_${s.nextCustomId}`
    const entry: CustomEnvEntry = { id, path, name }
    const customEnvs = [...s.customEnvs, entry]
    const nextCustomId = s.nextCustomId + 1
    savePersistedEnv({ selectedEnv: id, customEnvs, nextCustomId })
    set({ customEnvs, selectedEnv: id, pendingCustomLoad: { id, path, name }, nextCustomId })
  },
  removeCustomEnv: (id) => {
    const s = get()
    const customEnvs = s.customEnvs.filter((e) => e.id !== id)
    const selectedEnv = s.selectedEnv === id
      ? (customEnvs.length > 0 ? customEnvs[customEnvs.length - 1].id : 'studio')
      : s.selectedEnv
    savePersistedEnv({ selectedEnv, customEnvs, nextCustomId: s.nextCustomId })
    set({ customEnvs, selectedEnv })
  },
  pendingCustomLoad: null,
  clearPendingCustomLoad: () => set({ pendingCustomLoad: null }),
  nextCustomId: persisted.nextCustomId,
  envBackground: 'environment',
  setEnvBackground: (v) => set({ envBackground: v }),
  // Shadow floor defaults
  shadowFloorEnabled: true,
  setShadowFloorEnabled: (v) => set({ shadowFloorEnabled: v }),
  shadowOpacity: 0.5,
  setShadowOpacity: (v) => set({ shadowOpacity: v }),
  modelBbox: null,
  setModelBbox: (b) => set({ modelBbox: b }),

  // Heatbed — set to false initially; initShowHeatbed sets the per-format default
  showHeatbed: false,
  _heatbedExplicitlySet: false,
  setShowHeatbed: (v) => set({ showHeatbed: v, _heatbedExplicitlySet: true }),
  initShowHeatbed: (format, buffer) => {
    // Respect explicit user/test toggles — don't override
    if (get()._heatbedExplicitlySet) return
    // Only STL / 3MF / AMF / STEP default to true.
    // STEP→GLB: buffer format is 'glb' but the file was originally STEP —
    // detect via STEP_T extension in the GLB binary.
    const defaultsToTrue = format
      ? (HEATBED_DEFAULT_FORMATS.has(format) ||
         (format === 'glb' && buffer != null && isCadSkillGlb(buffer)))
      : false
    set({ showHeatbed: defaultsToTrue })
  },
  bedSize: 300,
  setBedSize: (v) => set({ bedSize: v }),
  bedRawToMM: 1,
  setBedRawToMM: (v) => set({ bedRawToMM: v }),

  __animActive: false,
  set__animActive: (v) => set({ __animActive: v }),

  highlightVersion: 0,
  bumpHighlightVersion: () => set((s) => ({ highlightVersion: s.highlightVersion + 1 })),

  // Post-processing defaults
  smaaEnabled: true,
  setSmaaEnabled: (v) => set({ smaaEnabled: v }),
  shadowIntensity: 80,
  setShadowIntensity: (v) => set({ shadowIntensity: v }),
  shadowSoftness: 80,
  setShadowSoftness: (v) => set({ shadowSoftness: v }),

  // Texture mapping defaults
  anisotropy: 16,
  setAnisotropy: (v) => set({ anisotropy: v }),
  setEngineObjects: ({ camera, scene, gl }) =>
    set({ camera: camera as THREE.PerspectiveCamera, scene, gl }),
  clearEngineObjects: () => set({ camera: null, scene: null, gl: null, modelTransform: null, modelGroup: null }),
}))