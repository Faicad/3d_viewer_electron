import type * as THREE from 'three'
import type { SelectorRuntime } from '@/lib/topology/types'
import type { useModelStore } from '@/stores/model-store'
import type { useAnimationStore } from '@/stores/animation-store'
import type { useMaterialStore } from '@/stores/material-store'
import type { useSvgWorkspaceStore, parseSvgViewBox as ParseSvgViewBox, parseSvgLayers as ParseSvgLayers } from '@/stores/svg-workspace-store'

declare global {
  interface Window {
    __r3f_indicator?: { camera: THREE.Camera; scene: THREE.Scene; gl: THREE.WebGLRenderer }
    __r3f_viewcube?: { camera: THREE.Camera; scene: THREE.Scene; gl: THREE.WebGLRenderer; hoveredFace?: string | null }
    __r3f_dev?: { camera: THREE.Camera; scene: THREE.Scene; gl: THREE.WebGLRenderer; selectorRuntime?: SelectorRuntime | null }
    __modelStore: typeof useModelStore
    __animationStore: typeof useAnimationStore
    __materialStore: typeof useMaterialStore
    __svgWorkspaceStore: typeof useSvgWorkspaceStore
    __svgFixtures: Record<string, string>
    __svgHelpers: { parseSvgViewBox: typeof ParseSvgViewBox; parseSvgLayers: typeof ParseSvgLayers }
    __clearStepCache: () => Promise<void>
    __errors: Array<{ message: string; stack: string; timestamp: number }>
  }
}

export {}
