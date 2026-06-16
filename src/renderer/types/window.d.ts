import type * as THREE from 'three'
import type { SelectorRuntime } from '@/lib/topology/types'
import type { useModelStore } from '@/stores/model-store'
import type { useAnimationStore } from '@/stores/animation-store'
import type { useMaterialStore } from '@/stores/material-store'
import type { useSvgWorkspaceStore, parseSvgViewBox as ParseSvgViewBox, parseSvgLayers as ParseSvgLayers } from '@/stores/svg-workspace-store'
import type { ViewerAPI } from '@/ai-injection/types'

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
    __stepMemCacheHas: (filePath: string, mtimeMs: number) => boolean
    /** Returns true if any mesh in the scene has per-triangle faceIds mapped. */
    __sceneHasFaceIds: () => boolean
    __errors: Array<{ message: string; stack: string; timestamp: number }>
    /** Pre-computed at init time. E2E tests read this instead of probing WebGL. */
    __isSoftwareGpu?: boolean
    /** GPU detection cache (see src/test/gpu-utils.ts). */
    __gpuInfo?: { detected: boolean; isSoftware: boolean; vendor?: string; renderer?: string; reason?: string }
    /** E2E export helper: exports all scene meshes as binary STL, returns base64. */
    __exportSceneToStlBase64: () => Promise<{ data: string; byteLength: number }>
    /** AI code injection — 3D scene bridge for AI-generated code */
    __viewerAPI?: ViewerAPI
    viewerAPI?: ViewerAPI
    /** GSAP library exposed for AI-injected code */
    __gsap?: unknown
    /** Animate camera to absolute position or zoom by factor (GSAP proxy pattern) */
    __animateCamera: (opts: { to?: { x: number; y: number; z: number }; factor?: number; duration?: number }) => Promise<void>
    /** THREE.js exposed for AI-injected code (math utilities: Vector3, Quaternion, etc.) */
    __THREE?: unknown
    /** Dev convenience: trigger GSAP rotate demo via executeCode */
    __demoGSAPRotate?: () => void
  }
}

export {}
