import { create } from 'zustand'
import * as THREE from 'three'

const CUSTOM_ENV_KEY = 'faicad-custom-env'

interface PersistedEnv {
  selectedEnv: string
  customEnvPath: string | null
  customEnvName: string | null
}

function loadPersistedEnv(): PersistedEnv {
  try {
    const raw = localStorage.getItem(CUSTOM_ENV_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        selectedEnv: parsed.selectedEnv || 'studio',
        customEnvPath: parsed.customEnvPath || null,
        customEnvName: parsed.customEnvName || null,
      }
    }
  } catch { /* ignore */ }
  return { selectedEnv: 'studio', customEnvPath: null, customEnvName: null }
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
  customEnvPath: string | null
  customEnvName: string | null
  setCustomEnv: (path: string | null, name: string | null) => void
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
    savePersistedEnv({
      selectedEnv: v,
      customEnvPath: s.customEnvPath,
      customEnvName: s.customEnvName,
    })
    set({ selectedEnv: v })
  },
  customEnvPath: persisted.customEnvPath,
  customEnvName: persisted.customEnvName,
  setCustomEnv: (path, name) => {
    const newSelectedEnv = path ? '__custom__' : 'studio'
    savePersistedEnv({
      selectedEnv: newSelectedEnv,
      customEnvPath: path,
      customEnvName: name,
    })
    set({
      customEnvPath: path,
      customEnvName: name,
      selectedEnv: newSelectedEnv,
    })
  },
  envBackground: 'environment',
  setEnvBackground: (v) => set({ envBackground: v }),
  // Shadow floor defaults
  shadowFloorEnabled: true,
  setShadowFloorEnabled: (v) => set({ shadowFloorEnabled: v }),
  shadowOpacity: 0.5,
  setShadowOpacity: (v) => set({ shadowOpacity: v }),
  modelBbox: null,
  setModelBbox: (b) => set({ modelBbox: b }),

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