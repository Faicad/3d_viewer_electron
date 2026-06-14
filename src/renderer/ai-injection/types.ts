import type * as THREE from 'three'

// ---- ViewerAPI (exposed as window.__viewerAPI) ----

export interface ViewerAPI {
  // Scene queries (read-only, returns copies)
  getLoadedFiles(): LoadedFileInfo[]
  getParts(): PartInfo[]
  getSceneTree(): SceneTreeNodeInfo[]
  getCameraState(): CameraState
  getSelection(): string[]

  // Coordinate projection
  worldToScreen(x: number, y: number, z: number): { x: number; y: number } | null
  screenToWorld(screenX: number, screenY: number): ScreenRay | null

  // Safe operations
  zoomToPart(partId: string): void
  highlightPart(partId: string, color?: string): void
  clearHighlight(): void
  setCameraPosition(position: [number, number, number], target?: [number, number, number]): void
  zoomToFit(padding?: number): void

  // Animation: get live THREE references for GSAP direct manipulation
  getPartProxy(partId: string): PartProxy | null

  // Animation: set transform via pure data
  setPartTransform(partId: string, transform: PartTransform): void

  // Event subscriptions
  on(event: ViewerEvent, callback: () => void): () => void
}

// ---- Data types (pure data, no references) ----

export interface LoadedFileInfo {
  id: string
  fileName: string
  format: string
}

export interface PartInfo {
  partId: string
  name: string
  triangleCount: number
}

export interface SceneTreeNodeInfo {
  id: string
  name: string
  children?: SceneTreeNodeInfo[]
  visible: boolean
  expanded?: boolean
  meshIndex?: number
}

export interface CameraState {
  position: [number, number, number]
  target: [number, number, number]
  mode: string // 'perspective' | 'orthographic'
}

export interface ScreenRay {
  origin: [number, number, number]
  direction: [number, number, number]
}

// ---- Animation types ----

/** Live THREE object references. GSAP directly tweens these. */
export interface PartProxy {
  position: THREE.Vector3
  quaternion: THREE.Quaternion
  rotation: THREE.Euler
  scale: THREE.Vector3
}

/** Pure-data transform for setPartTransform (safe cross-boundary). */
export interface PartTransform {
  position?: [number, number, number]
  quaternion?: [number, number, number, number]
  rotation?: [number, number, number]
  scale?: [number, number, number]
}

export type ViewerEvent = 'cameraChange' | 'selectionChange' | 'animationTick'

// ---- Injection types ----

export type InjectMode = 'replace' | 'append' | 'clear'

export interface ExecuteCodeParams {
  html?: string
  css?: string
  js?: string
  mode?: InjectMode
}

export interface AIInjection {
  execute(html?: string, css?: string, js?: string, mode?: string): void
}
