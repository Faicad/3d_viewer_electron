import { create } from 'zustand'
import * as THREE from 'three'

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
  envBackground: string
  setEnvBackground: (v: string) => void
  use4kEnvMaps: boolean
  setUse4kEnvMaps: (v: boolean) => void

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
  ssaoEnabled: boolean
  setSsaoEnabled: (v: boolean) => void
  smaaEnabled: boolean
  setSmaaEnabled: (v: boolean) => void
  aoIntensity: number
  setAoIntensity: (v: number) => void
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

export const useEngineStore = create<EngineStore>((set) => ({
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
  selectedEnv: 'empty_warehouse_01',
  setSelectedEnv: (v) => set({ selectedEnv: v }),
  envBackground: 'environment',
  setEnvBackground: (v) => set({ envBackground: v }),
  use4kEnvMaps: false,
  setUse4kEnvMaps: (v) => set({ use4kEnvMaps: v }),

  // Shadow floor defaults
  shadowFloorEnabled: true,
  setShadowFloorEnabled: (v) => set({ shadowFloorEnabled: v }),
  shadowOpacity: 0.5,
  setShadowOpacity: (v) => set({ shadowOpacity: v }),
  modelBbox: null,
  setModelBbox: (b) => set({ modelBbox: b }),

  // Post-processing defaults
  ssaoEnabled: false,
  setSsaoEnabled: (v) => set({ ssaoEnabled: v }),
  smaaEnabled: true,
  setSmaaEnabled: (v) => set({ smaaEnabled: v }),
  aoIntensity: 5,
  setAoIntensity: (v) => set({ aoIntensity: v }),
  shadowIntensity: 50,
  setShadowIntensity: (v) => set({ shadowIntensity: v }),
  shadowSoftness: 20,
  setShadowSoftness: (v) => set({ shadowSoftness: v }),

  // Texture mapping defaults
  anisotropy: 16,
  setAnisotropy: (v) => set({ anisotropy: v }),
  setEngineObjects: ({ camera, scene, gl }) =>
    set({ camera: camera as THREE.PerspectiveCamera, scene, gl }),
  clearEngineObjects: () => set({ camera: null, scene: null, gl: null, modelTransform: null, modelGroup: null }),
}))