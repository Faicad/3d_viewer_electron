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

  setEngineObjects: ({ camera, scene, gl }) =>
    set({ camera: camera as THREE.PerspectiveCamera, scene, gl }),
  clearEngineObjects: () => set({ camera: null, scene: null, gl: null, modelTransform: null, modelGroup: null }),
}))