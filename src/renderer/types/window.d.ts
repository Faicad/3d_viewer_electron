import type * as THREE from 'three'
import type { SelectorRuntime } from '@/lib/topology/types'
import type { useModelStore } from '@/stores/model-store'

declare global {
  interface Window {
    __r3f_indicator?: { camera: THREE.Camera; scene: THREE.Scene; gl: THREE.WebGLRenderer }
    __r3f_viewcube?: { camera: THREE.Camera; scene: THREE.Scene; gl: THREE.WebGLRenderer; hoveredFace?: string | null }
    __r3f_dev?: { camera: THREE.Camera; scene: THREE.Scene; gl: THREE.WebGLRenderer; selectorRuntime?: SelectorRuntime | null }
    __modelStore: typeof useModelStore
    __clearStepCache: () => Promise<void>
  }
}

export {}
