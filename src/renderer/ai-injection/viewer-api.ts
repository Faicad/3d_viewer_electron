import * as THREE from 'three'
import { useModelStore } from '@/stores/model-store'
import { useEngineStore } from '@/stores/engine-store'
import { useSelectionStore } from '@/stores/selection-store'
import { useUIStore } from '@/stores/ui-store'
import type { ViewerAPI, PartProxy, CameraState, LoadedFileInfo, PartInfo, SceneTreeNodeInfo, ScreenRay, PartTransform } from './types'

// ---- internal helpers ----

function findMeshInScene(partId: string): THREE.Object3D | null {
  // Fast path: search current modelGroup (single-file or last-synced file)
  const mg = useEngineStore.getState().modelGroup
  if (mg) {
    if (partId === '__model__') return mg
    let found: THREE.Object3D | null = null
    mg.traverse((child) => {
      if (found) return
      if (child instanceof THREE.Mesh && (child as THREE.Mesh).userData?.partId === partId) {
        found = child
      }
    })
    if (found) return found
  }

  // Fallback: search all file groups in __modelGroupMap for multi-file scenes
  const modelGroupMap = (window as any).__modelGroupMap as Map<string, THREE.Group> | undefined
  if (modelGroupMap) {
    for (const group of modelGroupMap.values()) {
      if (partId === '__model__') return group
      let found: THREE.Object3D | null = null
      group.traverse((child) => {
        if (found) return
        if (child instanceof THREE.Mesh && (child as THREE.Mesh).userData?.partId === partId) {
          found = child
        }
      })
      if (found) return found
    }
  }

  return null
}

function getCamera(): THREE.Camera | null {
  return window.__r3f_dev?.camera ?? null
}

function getControls(): import('three-stdlib').OrbitControls | null {
  return window.__r3f_dev?.controls ?? null
}

// ---- ViewerAPI implementation ----

function getLoadedFiles(): LoadedFileInfo[] {
  return useModelStore.getState().loadedFiles.map((f) => ({
    id: f.id,
    fileName: f.fileName,
    format: f.format,
  }))
}

function getParts(): PartInfo[] {
  return useModelStore.getState().glbPartInfos.map((p) => ({
    partId: p.partId,
    name: p.name,
    triangleCount: p.triangleCount,
  }))
}

function getSceneTree(): SceneTreeNodeInfo[] {
  return useModelStore.getState().sceneTree
}

function getCameraState(): CameraState {
  const cam = getCamera()
  const controls = getControls()
  if (!cam) {
    return { position: [0, 0, 5], target: [0, 0, 0], mode: 'perspective' }
  }
  const target = controls?.target ?? new THREE.Vector3(0, 0, 0)
  const mode = useUIStore.getState().cameraMode
  return {
    position: [cam.position.x, cam.position.y, cam.position.z],
    target: [target.x, target.y, target.z],
    mode,
  }
}

function getSelection(): string[] {
  return useSelectionStore.getState().selectedReferenceIds
}

function worldToScreen(x: number, y: number, z: number): { x: number; y: number } | null {
  const cam = getCamera()
  if (!cam) return null
  const gl = useEngineStore.getState().gl
  if (!gl) return null
  const vec = new THREE.Vector3(x, y, z)
  vec.project(cam)
  if (vec.z > 1) return null // behind camera
  const screenX = (vec.x * 0.5 + 0.5) * gl.domElement.width
  const screenY = (-vec.y * 0.5 + 0.5) * gl.domElement.height
  return { x: screenX, y: screenY }
}

function screenToWorld(screenX: number, screenY: number): ScreenRay | null {
  const cam = getCamera()
  if (!cam) return null
  const gl = useEngineStore.getState().gl
  if (!gl) return null
  const rect = gl.domElement.getBoundingClientRect()
  const ndc = new THREE.Vector2(
    ((screenX - rect.left) / rect.width) * 2 - 1,
    -((screenY - rect.top) / rect.height) * 2 + 1,
  )
  const raycaster = new THREE.Raycaster()
  raycaster.setFromCamera(ndc, cam)
  return {
    origin: [raycaster.ray.origin.x, raycaster.ray.origin.y, raycaster.ray.origin.z],
    direction: [raycaster.ray.direction.x, raycaster.ray.direction.y, raycaster.ray.direction.z],
  }
}

function zoomToPart(partId: string): void {
  const mesh = findMeshInScene(partId)
  if (!mesh) return
  const cam = getCamera()
  const controls = getControls()
  if (!cam || !controls) return

  const box = new THREE.Box3().setFromObject(mesh)
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z)
  const dist = maxDim * 2

  controls.target.copy(center)
  if (cam instanceof THREE.PerspectiveCamera) {
    const fitDist = maxDim / (2 * Math.tan((cam.fov * Math.PI) / 360))
    const finalDist = Math.max(fitDist, dist)
    const dir = new THREE.Vector3().copy(cam.position).sub(center).normalize()
    if (dir.length() < 0.01) dir.set(0, -1, 0.3)
    cam.position.copy(center).addScaledVector(dir, finalDist)
  }
  cam.lookAt(center)
  controls.update()
}

function highlightPart(partId: string, _color?: string): void {
  // Re-use the existing selection highlight system
  useSelectionStore.getState().setSelection([partId])
}

function clearHighlight(): void {
  useSelectionStore.getState().clearSelection()
}

function setCameraPosition(position: [number, number, number], target?: [number, number, number]): void {
  const cam = getCamera()
  const controls = getControls()
  if (!cam) return
  cam.position.set(position[0], position[1], position[2])
  if (target && controls) {
    controls.target.set(target[0], target[1], target[2])
    cam.lookAt(target[0], target[1], target[2])
  }
  controls?.update()
}

function zoomToFit(padding?: number): void {
  const cam = getCamera()
  const controls = getControls()
  if (!cam) return

  const box = new THREE.Box3()
  let hasGeom = false
  const scene = window.__r3f_dev?.scene
  if (scene) {
    scene.traverse((obj: THREE.Object3D) => {
      if (obj instanceof THREE.Mesh && obj.visible && obj.geometry) {
        const geo = obj.geometry
        if (geo.boundingBox === null) geo.computeBoundingBox()
        if (geo.boundingBox) {
          const worldBox = geo.boundingBox.clone()
          worldBox.applyMatrix4(obj.matrixWorld)
          box.union(worldBox)
          hasGeom = true
        }
      }
    })
  }
  if (!hasGeom) return

  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z)
  const p = padding ?? 1.5
  const dist = maxDim * p

  if (cam instanceof THREE.PerspectiveCamera) {
    const fitDist = maxDim / (2 * Math.tan((cam.fov * Math.PI) / 360))
    const finalDist = Math.max(fitDist, dist)
    cam.position.set(center.x - finalDist * 0.3, center.y - finalDist * 0.6, center.z + finalDist * 0.7)
  } else {
    cam.position.set(center.x, center.y - dist * 0.5, center.z + dist)
  }
  if (controls) {
    controls.target.copy(center)
    controls.update()
  }
  cam.lookAt(center)
}

// ---- Animation ----

function getPartProxy(partId: string): PartProxy | null {
  const obj = findMeshInScene(partId)
  if (!obj) return null
  return {
    position: obj.position,
    quaternion: obj.quaternion,
    rotation: obj.rotation,
    scale: obj.scale,
  }
}

function setPartTransform(partId: string, transform: PartTransform): void {
  const obj = findMeshInScene(partId)
  if (!obj) return
  if (transform.position) {
    obj.position.set(transform.position[0], transform.position[1], transform.position[2])
  }
  if (transform.quaternion) {
    obj.quaternion.set(transform.quaternion[0], transform.quaternion[1], transform.quaternion[2], transform.quaternion[3])
  }
  if (transform.rotation) {
    obj.rotation.set(transform.rotation[0], transform.rotation[1], transform.rotation[2])
  }
  if (transform.scale) {
    obj.scale.set(transform.scale[0], transform.scale[1], transform.scale[2])
  }
}

// ---- Build and register ----

export function createViewerAPI(): ViewerAPI {
  return {
    getLoadedFiles,
    getParts,
    getSceneTree,
    getCameraState,
    getSelection,
    worldToScreen,
    screenToWorld,
    zoomToPart,
    highlightPart,
    clearHighlight,
    setCameraPosition,
    zoomToFit,
    getPartProxy,
    setPartTransform,
    on: () => { console.warn('[viewer-api] on() is deprecated, events not supported'); return () => {} },
  }
}
