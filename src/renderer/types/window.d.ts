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
    __r3f_dev?: { camera: THREE.Camera; scene: THREE.Scene; gl: THREE.WebGLRenderer; selectorRuntime?: SelectorRuntime | null; controls?: import('three-stdlib').OrbitControls | null; triggerResetCamera?: () => void }
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
    /** 3D scene bridge for AI/demo code */
    __viewerAPI?: ViewerAPI
    viewerAPI?: ViewerAPI
    /** GSAP library for animations */
    __gsap?: unknown
    /** Export current scene meshes to GLB or STL, returns { base64, byteLength, format } */
    __exportModel: (format?: 'glb' | 'stl') => Promise<{ base64: string; byteLength: number; format: string }>
    /** Animate camera: move to position, zoom by factor, or rotate around target (GSAP proxy pattern) */
    __animateCamera: (opts: {
      to?: { x: number; y: number; z: number }
      factor?: number
      duration?: number
      ease?: string
      /** Shorthand rotation angle (used when `rotate` is a string like 'y'; ignored when `rotate` is an object) */
      angle?: number
      rotate?: 'x' | 'y' | 'z' | 'up' | { axis: 'x' | 'y' | 'z' | 'up'; angle: number }
    }) => Promise<void>
    /** Trigger entry animation (auto / zoom / slide) on demand. Overrides > URL params > defaults. */
    __triggerEntryAnimation: (opts?: {
      type?: 'auto' | 'zoom' | 'slide'
      duration?: number
      direction?: 'top' | 'bottom' | 'left' | 'right'
      zoomDist?: number
      zoomEndDist?: number
      slideDist?: number
      targetShiftY?: number
      ease?: string
      reverse?: boolean
    }) => Promise<void>
    /** Entry animation config from last loadModel command (consumed once by resolveEntryConfig). */
    __pendingEntryConfig?: Record<string, string>
    /** THREE.js exposed for animation math utilities */
    __THREE?: unknown
    /** Dev convenience: trigger GSAP rotate demo */
    __demoGSAPRotate?: () => void
    /** Dev convenience: trigger GSAP assemble demo */
    __demoGSAPAssemble?: () => void
    /** Dev convenience: trigger GSAP explode demo */
    __demoGSAPExplode?: (params?: { spread?: number; range?: number }) => void
    /** Movie recording: execute a viewer command, returns result or promise of result */
    __executeCommand: (command: string, params?: Record<string, unknown>) => any
    /** Movie recording: TTS sync timing data injected by lib-electron */
    __ttsTiming?: { groups: Array<{ totalDuration: number }>; ttsTotal: number }
    /** Movie recording: sync point timestamps collected during recording */
    __movieSyncPoints?: number[]
    /** Movie recording: performance.now() timestamp when model was ready */
    __tModelBrowser?: number
    /** Movie recording: maps file IDs to THREE.Group for material traversal */
    __modelGroupMap?: Map<string, import('three').Group>
    __engineStore: typeof import('@/stores/engine-store').useEngineStore
    __toolStore: typeof import('@/stores/tool-store').useToolStore
    __selectionStore: typeof import('@/stores/selection-store').useSelectionStore
    __uiStore: typeof import('@/stores/ui-store').useUIStore
    __fitCameraToHeatbed: (duration: number, margin: string) => void
    /** E2E test helper: check if a thumbnail exists in cache for a given file path + mtime */
    __getThumbnail: (filePath: string, mtimeMs: number) => Promise<boolean>

    /** Electron preload API */
    electronAPI: {
      getAppVersion: () => Promise<string>
      getPlatform: () => string
      openExternal: (url: string) => Promise<void>
      readDirectory: (dirPath: string) => Promise<{ success: boolean; files?: { name: string; path: string; mtimeMs: number }[]; error?: string }>
      readFile: (filePath: string) => Promise<{ success: boolean; data?: ArrayBuffer; error?: string }>
      readFileAsBase64: (filePath: string) => Promise<{ success: boolean; data?: string; error?: string }>
      getFilePath: (file: File) => string
      openFileDialog: () => Promise<{ success: boolean; filePaths?: string[]; error?: string }>
      openDirectoryDialog: () => Promise<{ success: boolean; filePath?: string | null; error?: string }>
      openEnvironmentMapDialog: () => Promise<{ success: boolean; filePath?: string | null; error?: string }>
      toggleFullscreen: () => Promise<boolean>
      onFullscreenChanged: (callback: (isFullscreen: boolean) => void) => () => void
      getPendingFilePath: () => Promise<string | null>
      saveFile: (data: string, defaultName: string) => Promise<{ success: boolean; filePath?: string; error?: string; canceled?: boolean }>
      showItemInFolder: (filePath: string) => Promise<void>
      onOpenExternalFile: (callback: (filePath: string) => void) => () => void
      onAIAction: (callback: (command: any) => void) => () => void
      postAIResult: (payload: { id: string; data?: unknown; error?: string }) => void
      getPipedFiles: () => Promise<{ name: string; path: string; mtimeMs: number }[] | null>
      isStdinMode: () => Promise<boolean>

      checkForUpdates: (manual: boolean) => Promise<void>
      quitAndInstall: () => Promise<void>
      onUpdateEvent: (callback: (event: string, payload: any) => void) => () => void
    }

    /** Build-time injected env */
    env: {
      DEV: boolean
      PROD: boolean
      E2E: boolean
      DATA_REGION?: string
      EDITION?: string
      AGENT?: string
      APP_VERSION?: string
      READABLE_VERSION?: string
    }
  }
}

export {}
