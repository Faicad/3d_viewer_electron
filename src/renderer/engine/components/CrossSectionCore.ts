import * as THREE from 'three'

export interface MeshData {
  geometry: THREE.BufferGeometry
  matrixWorld: THREE.Matrix4
  material: THREE.Material | THREE.Material[] | null
  mesh: THREE.Mesh
}

export interface CrossSectionObjects {
  stencilGroups: THREE.Group[]
  capPlanes: THREE.Mesh[]
  clipPlaneVisuals: THREE.Mesh[]
  planes: THREE.Plane[]
  meshData: MeshData[]
  bbox: THREE.Box3
}

export const PLANE_COLORS: readonly [number, number, number] = [
  0xff3333,
  0x33ff55,
  0x3388ff,
]

const PLANE_NORMALS: readonly [THREE.Vector3, THREE.Vector3, THREE.Vector3] = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, 0, 1),
]

const CLIP_EXTEND = 0.005

const INTERNAL_TAG = '_crossSectionInternal'
const CS_TYPE = '_csType'

export function cameraDirs(
  camPos: THREE.Vector3,
  bboxCenter: THREE.Vector3,
): [number, number, number] {
  const d = (axis: 'x' | 'y' | 'z') =>
    camPos[axis] < bboxCenter[axis] ? 1 : -1
  return [d('x'), d('y'), d('z')]
}

export function buildPlanes(
  bbox: THREE.Box3,
  dirs: [number, number, number],
  positions: [number, number, number],
): THREE.Plane[] {
  const planes: THREE.Plane[] = []
  for (let i = 0; i < 3; i++) {
    const axis = ['x', 'y', 'z'][i] as 'x' | 'y' | 'z'
    const t = Math.max(0, Math.min(1, positions[i] / 100))
    const range = bbox.max[axis] - bbox.min[axis]
    const ext = range * CLIP_EXTEND
    const worldPos = (bbox.min[axis] - ext) + t * (range + 2 * ext)
    const normal = PLANE_NORMALS[i].clone().multiplyScalar(dirs[i])
    planes.push(new THREE.Plane(normal, -(dirs[i] * worldPos)))
  }
  return planes
}

export function createStencilGroup(
  meshData: MeshData[],
  allPlanes: THREE.Plane[],
  renderOrder: number,
): THREE.Group {
  const group = new THREE.Group()

  for (const data of meshData) {
    const baseMat = new THREE.MeshBasicMaterial()
    baseMat.depthWrite = false
    baseMat.depthTest = false
    baseMat.colorWrite = false
    baseMat.stencilWrite = true
    baseMat.stencilFunc = THREE.AlwaysStencilFunc

    const matBack = baseMat.clone()
    matBack.side = THREE.BackSide
    matBack.clippingPlanes = allPlanes
    matBack.stencilFail = THREE.IncrementWrapStencilOp
    matBack.stencilZFail = THREE.IncrementWrapStencilOp
    matBack.stencilZPass = THREE.IncrementWrapStencilOp
    const meshBack = new THREE.Mesh(data.geometry, matBack)
    meshBack.applyMatrix4(data.matrixWorld)
    meshBack.matrixAutoUpdate = false
    meshBack.renderOrder = renderOrder
    meshBack.frustumCulled = false
    meshBack.userData[INTERNAL_TAG] = true
    meshBack.userData[CS_TYPE] = 'stencil'
    group.add(meshBack)

    const matFront = baseMat.clone()
    matFront.side = THREE.FrontSide
    matFront.clippingPlanes = allPlanes
    matFront.stencilFail = THREE.DecrementWrapStencilOp
    matFront.stencilZFail = THREE.DecrementWrapStencilOp
    matFront.stencilZPass = THREE.DecrementWrapStencilOp
    const meshFront = new THREE.Mesh(data.geometry, matFront)
    meshFront.applyMatrix4(data.matrixWorld)
    meshFront.matrixAutoUpdate = false
    meshFront.renderOrder = renderOrder
    meshFront.frustumCulled = false
    meshFront.userData[INTERNAL_TAG] = true
    meshFront.userData[CS_TYPE] = 'stencil'
    group.add(meshFront)
  }

  return group
}

export function createCapMesh(
  plane: THREE.Plane,
  otherPlanes: THREE.Plane[],
  color: THREE.Color,
  bboxSize: THREE.Vector3,
  renderOrder: number,
): THREE.Mesh {
  const size = Math.max(Math.max(bboxSize.x, bboxSize.y, bboxSize.z) * 3, 5)
  const geo = new THREE.PlaneGeometry(size, size)

  const mat = new THREE.MeshBasicMaterial({
    color,
    side: THREE.DoubleSide,
    clippingPlanes: otherPlanes.length > 0 ? otherPlanes : null,
    stencilWrite: true,
    stencilRef: 0,
    stencilFunc: THREE.NotEqualStencilFunc,
    stencilFail: THREE.ReplaceStencilOp,
    stencilZFail: THREE.ReplaceStencilOp,
    stencilZPass: THREE.ReplaceStencilOp,
  })

  const mesh = new THREE.Mesh(geo, mat)
  mesh.renderOrder = renderOrder
  mesh.frustumCulled = false
  mesh.userData[INTERNAL_TAG] = true
  mesh.userData[CS_TYPE] = 'cap'

  plane.coplanarPoint(mesh.position)
  mesh.lookAt(
    mesh.position.x - plane.normal.x,
    mesh.position.y - plane.normal.y,
    mesh.position.z - plane.normal.z,
  )

  mesh.onAfterRender = (r) => r.clearStencil()
  return mesh
}

export function createClipPlaneVisual(
  plane: THREE.Plane,
  otherPlanes: THREE.Plane[],
  color: THREE.Color,
  bboxSize: THREE.Vector3,
): THREE.Mesh {
  const size = Math.max(Math.max(bboxSize.x, bboxSize.y, bboxSize.z) * 3, 5)
  const geo = new THREE.PlaneGeometry(size, size)

  const mat = new THREE.MeshBasicMaterial({
    color,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.1,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
    clippingPlanes: otherPlanes.length > 0 ? otherPlanes : null,
  })

  const mesh = new THREE.Mesh(geo, mat)
  mesh.renderOrder = 999
  mesh.userData[INTERNAL_TAG] = true
  mesh.userData[CS_TYPE] = 'visual'

  plane.coplanarPoint(mesh.position)
  mesh.lookAt(
    mesh.position.x - plane.normal.x,
    mesh.position.y - plane.normal.y,
    mesh.position.z - plane.normal.z,
  )

  return mesh
}

function shouldSkipSceneObject(obj: THREE.Object3D): boolean {
  if (!obj.visible) return true
  if (obj.userData[INTERNAL_TAG]) return true
  if (!(obj instanceof THREE.Mesh)) return true
  if (obj.name === 'shadowFloor') return true
  if (obj.parent?.name === 'shadowFloor') return true
  if (obj.material instanceof THREE.ShadowMaterial) return true
  if (obj.name === 'heatbed-plane' || obj.name === 'heatbed-grid') return true
  if (obj.renderOrder === 1 && !obj.visible) return true
  if (obj.renderOrder >= 2 && obj.renderOrder <= 5) return true
  if (obj.renderOrder === 6) return true
  if (obj.renderOrder === 999) return true
  return false
}

export function computeVisibleBBox(scene: THREE.Scene): THREE.Box3 | null {
  const box = new THREE.Box3()

  scene.traverse((obj) => {
    if (shouldSkipSceneObject(obj)) return

    const geo = obj.geometry
    if (!geo) return

    if (!geo.boundingBox) geo.computeBoundingBox()

    obj.updateWorldMatrix(true, false)
    const localBox = geo.boundingBox!.clone()
    localBox.applyMatrix4(obj.matrixWorld)
    box.union(localBox)
  })

  return box.isEmpty() ? null : box
}

export function collectModelMeshes(scene: THREE.Scene): MeshData[] {
  const result: MeshData[] = []

  scene.traverse((obj) => {
    if (shouldSkipSceneObject(obj)) return

    obj.updateWorldMatrix(true, false)
    result.push({
      geometry: obj.geometry,
      matrixWorld: obj.matrixWorld.clone(),
      material: obj.material,
      mesh: obj,
    })
  })

  return result
}

export function applyModelClippingPlanes(
  meshData: MeshData[],
  planes: THREE.Plane[],
): void {
  for (const data of meshData) {
    const mats = Array.isArray(data.material) ? data.material : [data.material]
    for (const mat of mats) {
      if (!mat) continue
      mat.clippingPlanes = planes
      mat.clipShadows = true
      mat.needsUpdate = true
    }
  }
}

export function cleanupCrossSectionObjects(
  objs: CrossSectionObjects | null,
  _scene: THREE.Scene,
): void {
  if (!objs) return

  for (const group of objs.stencilGroups) {
    _scene.remove(group)
    group.traverse(c => { if (c instanceof THREE.Mesh) c.material.dispose() })
  }
  for (const cap of objs.capPlanes) {
    _scene.remove(cap)
    cap.geometry.dispose(); (cap.material as THREE.Material).dispose()
  }
  for (const vis of objs.clipPlaneVisuals) {
    if (!vis) continue
    _scene.remove(vis)
    vis.geometry.dispose(); (vis.material as THREE.Material).dispose()
  }

  for (const data of objs.meshData) {
    const mats = Array.isArray(data.material) ? data.material : [data.material]
    for (const mat of mats) {
      if (!mat) continue
      mat.clippingPlanes = null
      mat.clipShadows = false
      mat.needsUpdate = true
    }
  }
}

export function syncPlanes(
  objs: CrossSectionObjects,
  dirs: [number, number, number],
  positions: [number, number, number],
): void {
  const newPlanes = buildPlanes(objs.bbox, dirs, positions)

  for (let i = 0; i < 3; i++) {
    objs.planes[i].copy(newPlanes[i])
  }

  for (let i = 0; i < 3; i++) {
    const plane = objs.planes[i]
    const cap = objs.capPlanes[i]
    const pos = plane.coplanarPoint(new THREE.Vector3())
    cap.position.copy(pos)
    cap.lookAt(
      cap.position.x - plane.normal.x,
      cap.position.y - plane.normal.y,
      cap.position.z - plane.normal.z,
    )
    ;(cap.material as THREE.MeshBasicMaterial).needsUpdate = true

    const vis = objs.clipPlaneVisuals[i]
    if (vis) {
      vis.position.copy(pos)
      vis.lookAt(
        vis.position.x - plane.normal.x,
        vis.position.y - plane.normal.y,
        vis.position.z - plane.normal.z,
      )
      ;(vis.material as THREE.Material).needsUpdate = true
    }
  }

  for (const group of objs.stencilGroups) {
    for (const child of group.children) {
      if (child instanceof THREE.Mesh) {
        child.material.needsUpdate = true
      }
    }
  }

  for (const data of objs.meshData) {
    const mats = Array.isArray(data.material) ? data.material : [data.material]
    for (const mat of mats) {
      if (!mat) continue
      mat.needsUpdate = true
    }
  }
}

export function findObjectColor(meshData: MeshData[]): THREE.Color {
  for (const data of meshData) {
    const mats = Array.isArray(data.material) ? data.material : [data.material]
    for (const mat of mats) {
      if (mat && 'color' in mat) {
        return (mat as THREE.MeshStandardMaterial).color.clone()
      }
    }
  }
  return new THREE.Color('#cccccc')
}
