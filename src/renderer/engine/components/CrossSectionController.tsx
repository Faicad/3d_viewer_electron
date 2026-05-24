import { useEffect, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useCrossSectionStore } from '@/stores/cross-section-store'

const PLANE_COLORS: Record<string, string> = {
  x: '#ff4444',
  y: '#44ff44',
  z: '#4488ff',
}

interface ActivePlane {
  axis: string
  plane: THREE.Plane
  position: number
  dir: number
}

interface MeshData {
  geometry: THREE.BufferGeometry
  matrixWorld: THREE.Matrix4
}

function isShadowFloor(obj: THREE.Object3D): boolean {
  return obj.name === 'shadowFloor'
      || (obj.parent?.name === 'shadowFloor')
      || (obj instanceof THREE.Mesh && obj.material instanceof THREE.ShadowMaterial)
}

function computeVisibleBBox(scene: THREE.Scene): THREE.Box3 | null {
  const box = new THREE.Box3()
  scene.traverse((obj) => {
    if (!obj.visible) return
    if (obj.userData?._crossSectionInternal) return
    if (isShadowFloor(obj)) return
    if (obj instanceof THREE.Mesh && obj.geometry) {
      if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox()
      const geomBox = obj.geometry.boundingBox!.clone()
      geomBox.applyMatrix4(obj.matrixWorld)
      box.expandByPoint(geomBox.min)
      box.expandByPoint(geomBox.max)
    }
  })
  return box.isEmpty() ? null : box
}

function collectModelMeshes(scene: THREE.Scene): MeshData[] {
  const result: MeshData[] = []
  scene.traverse((obj) => {
    if (!obj.visible) return
    if (obj.userData?._crossSectionInternal) return
    if (isShadowFloor(obj)) return
    if (obj instanceof THREE.Mesh && obj.geometry) {
      obj.updateWorldMatrix(true, false)
      result.push({
        geometry: obj.geometry,
        matrixWorld: obj.matrixWorld.clone(),
      })
    }
  })
  return result
}

function cameraDirs(camPos: THREE.Vector3, bboxMin: THREE.Vector3, bboxMax: THREE.Vector3): [number, number, number] {
  return [
    camPos.x < (bboxMin.x + bboxMax.x) / 2 ? 1 : -1,
    camPos.y < (bboxMin.y + bboxMax.y) / 2 ? 1 : -1,
    camPos.z < (bboxMin.z + bboxMax.z) / 2 ? 1 : -1,
  ]
}

function buildPlanes(
  bbox: THREE.Box3,
  dirs: [number, number, number],
  posX: number, posY: number, posZ: number,
): ActivePlane[] {
  const [dX, dY, dZ] = dirs
  const planeX = bbox.min.x + (posX / 100) * (bbox.max.x - bbox.min.x)
  const planeY = bbox.min.y + (posY / 100) * (bbox.max.y - bbox.min.y)
  const planeZ = bbox.min.z + (posZ / 100) * (bbox.max.z - bbox.min.z)
  return [
    { axis: 'x', plane: new THREE.Plane(new THREE.Vector3(dX, 0, 0), -dX * planeX), position: planeX, dir: dX },
    { axis: 'y', plane: new THREE.Plane(new THREE.Vector3(0, dY, 0), -dY * planeY), position: planeY, dir: dY },
    { axis: 'z', plane: new THREE.Plane(new THREE.Vector3(0, 0, dZ), -dZ * planeZ), position: planeZ, dir: dZ },
  ]
}

// Custom shader for cross-section caps.
// Highlights fragments whose world-space distance to the clipping plane is
// within a small epsilon threshold. Uses DoubleSide so both front- and back-
// facing fragments near the plane are visible, producing a complete outline.
const CAP_VERTEX_SHADER = /* glsl */`
  varying vec3 vWorldPosition;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const CAP_FRAGMENT_SHADER = /* glsl */`
  varying vec3 vWorldPosition;
  uniform vec3 uCapPlaneNormal;
  uniform float uCapPlaneConstant;
  uniform float uEpsilon;
  uniform vec4 uOtherPlane0;
  uniform vec4 uOtherPlane1;
  uniform int uOtherPlaneCount;
  uniform vec3 uCapColor;

  void main() {
    float dCap = dot(uCapPlaneNormal, vWorldPosition) + uCapPlaneConstant;

    // Only render fragments whose distance to the plane is within epsilon.
    // These fragments lie on the model surface at the cross-section boundary.
    if (abs(dCap) > uEpsilon) discard;

    // Discard fragments on the clipped side of any OTHER active plane
    if (uOtherPlaneCount >= 1) {
      float d0 = dot(uOtherPlane0.xyz, vWorldPosition) + uOtherPlane0.w;
      if (d0 < 0.0) discard;
    }
    if (uOtherPlaneCount >= 2) {
      float d1 = dot(uOtherPlane1.xyz, vWorldPosition) + uOtherPlane1.w;
      if (d1 < 0.0) discard;
    }

    gl_FragColor = vec4(uCapColor, 1.0);
  }
`

function createCapMaterial(
  capPlane: THREE.Plane,
  otherPlanes: THREE.Plane[],
  color: string,
  epsilon: number,
): THREE.ShaderMaterial {
  const op0 = otherPlanes.length >= 1
    ? new THREE.Vector4(otherPlanes[0].normal.x, otherPlanes[0].normal.y, otherPlanes[0].normal.z, otherPlanes[0].constant)
    : new THREE.Vector4(0, 0, 0, 0)
  const op1 = otherPlanes.length >= 2
    ? new THREE.Vector4(otherPlanes[1].normal.x, otherPlanes[1].normal.y, otherPlanes[1].normal.z, otherPlanes[1].constant)
    : new THREE.Vector4(0, 0, 0, 0)

  return new THREE.ShaderMaterial({
    vertexShader: CAP_VERTEX_SHADER,
    fragmentShader: CAP_FRAGMENT_SHADER,
    uniforms: {
      uCapPlaneNormal: { value: capPlane.normal.clone() },
      uCapPlaneConstant: { value: capPlane.constant },
      uEpsilon: { value: epsilon },
      uOtherPlane0: { value: op0 },
      uOtherPlane1: { value: op1 },
      uOtherPlaneCount: { value: otherPlanes.length },
      uCapColor: { value: new THREE.Color(color) },
    },
    side: THREE.DoubleSide,
    depthTest: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -10,
    polygonOffsetUnits: -10,
  })
}

export default function CrossSectionController() {
  const { gl, scene, camera } = useThree()
  const panelOpen = useCrossSectionStore((s) => s.panelOpen)
  const px = useCrossSectionStore((s) => s.planeX.position)
  const py = useCrossSectionStore((s) => s.planeY.position)
  const pz = useCrossSectionStore((s) => s.planeZ.position)
  const showClipPlane = useCrossSectionStore((s) => s.showClipPlane)
  const useObjectColor = useCrossSectionStore((s) => s.useObjectColor)

  const [state, setState] = useState<{
    bbox: THREE.Box3 | null; meshData: MeshData[]; activePlanes: ActivePlane[]
  }>({ bbox: null, meshData: [], activePlanes: [] })
  const lastDirsRef = useRef<[number, number, number]>([0, 0, 0])

  useEffect(() => {
    if (!panelOpen) {
      setState({ bbox: null, meshData: [], activePlanes: [] })
      gl.clippingPlanes = []; gl.localClippingEnabled = false
      lastDirsRef.current = [0, 0, 0]
      return
    }
    const newBbox = computeVisibleBBox(scene)
    if (!newBbox) {
      setState({ bbox: null, meshData: [], activePlanes: [] })
      gl.clippingPlanes = []; gl.localClippingEnabled = false
      lastDirsRef.current = [0, 0, 0]
      return
    }
    const newMeshData = collectModelMeshes(scene)
    const dirs = cameraDirs(camera.position, newBbox.min, newBbox.max)
    const planes = buildPlanes(newBbox, dirs, px, py, pz)
    setState({ bbox: newBbox, meshData: newMeshData, activePlanes: planes })
    lastDirsRef.current = dirs
    gl.clippingPlanes = planes.map((p) => p.plane)
    gl.localClippingEnabled = true
  }, [panelOpen])

  useEffect(() => {
    if (!panelOpen || !state.bbox) return
    const planes = buildPlanes(state.bbox, lastDirsRef.current, px, py, pz)
    setState((prev) => ({ ...prev, activePlanes: planes }))
    gl.clippingPlanes = planes.map((p) => p.plane)
    gl.localClippingEnabled = true
  }, [px, py, pz])

  useFrame(() => {
    if (!panelOpen || !state.bbox) return
    const newDirs = cameraDirs(camera.position, state.bbox.min, state.bbox.max)
    if (newDirs[0] !== lastDirsRef.current[0] ||
        newDirs[1] !== lastDirsRef.current[1] ||
        newDirs[2] !== lastDirsRef.current[2]) {
      lastDirsRef.current = newDirs
      const planes = buildPlanes(state.bbox, newDirs, px, py, pz)
      setState((prev) => ({ ...prev, activePlanes: planes }))
      gl.clippingPlanes = planes.map((p) => p.plane)
      gl.localClippingEnabled = true
    }
  })

  const { bbox, meshData, activePlanes } = state
  if (!panelOpen || !bbox || activePlanes.length === 0) return null

  return (
    <>
      {activePlanes.map((ap, planeIdx) => {
        const capColor = useObjectColor ? '#cccccc' : PLANE_COLORS[ap.axis]
        const otherPlanes = activePlanes.filter((_, j) => j !== planeIdx).map((p) => p.plane)
        const size = new THREE.Vector3(bbox.max.x - bbox.min.x, bbox.max.y - bbox.min.y, bbox.max.z - bbox.min.z)
        const minDim = Math.min(size.x, size.y, size.z)
        const epsilon = minDim > 0 ? minDim * 0.03 : 0.01
        const capMat = createCapMaterial(ap.plane, otherPlanes, capColor, epsilon)
        let geomW: number, geomH: number
        let rotation: [number, number, number]
        if (ap.axis === 'x') { geomW = size.z; geomH = size.y; rotation = [0, Math.PI / 2, 0] }
        else if (ap.axis === 'y') { geomW = size.x; geomH = size.z; rotation = [-Math.PI / 2, 0, 0] }
        else { geomW = size.x; geomH = size.y; rotation = [0, 0, 0] }
        const center = new THREE.Vector3((bbox.min.x + bbox.max.x) / 2, (bbox.min.y + bbox.max.y) / 2, (bbox.min.z + bbox.max.z) / 2)
        let capPos: [number, number, number]
        if (ap.axis === 'x') capPos = [ap.position, center.y, center.z]
        else if (ap.axis === 'y') capPos = [center.x, ap.position, center.z]
        else capPos = [center.x, center.y, ap.position]
        const margin = Math.max(size.x, size.y, size.z) * 0.05
        const finalW = geomW + margin * 2; const finalH = geomH + margin * 2
        const eps = Math.max(size.x, size.y, size.z) * 0.001
        const rangeMin = ap.axis === 'x' ? bbox.min.x : ap.axis === 'y' ? bbox.min.y : bbox.min.z
        const rangeMax = ap.axis === 'x' ? bbox.max.x : ap.axis === 'y' ? bbox.max.y : bbox.max.z
        const intersectsModel = ap.position > rangeMin + eps && ap.position < rangeMax - eps
        if (!intersectsModel) return null

        return (
          <group key={`cs-${ap.axis}`}>
            {/* Cap: model interior faces on the clipped side, colored as the cross-section surface */}
            {meshData.map((md, i) => (
              <mesh key={`cap-${ap.axis}-${i}`} geometry={md.geometry}
                matrix={md.matrixWorld} matrixAutoUpdate={false}
                material={capMat}
                renderOrder={planeIdx * 3 + 1}
                frustumCulled={false}
                userData={{ _crossSectionInternal: true }}
              />
            ))}
            {/* Helper plane visualization */}
            {showClipPlane && (
              <mesh position={capPos} rotation={rotation as unknown as [number, number, number]}
                renderOrder={planeIdx * 3 + 2}
                userData={{ _crossSectionInternal: true }}>
                <planeGeometry args={[finalW, finalH]} />
                <meshBasicMaterial color={PLANE_COLORS[ap.axis]}
                  side={THREE.DoubleSide} depthWrite={false} depthTest={false}
                  transparent opacity={0.10}
                  clippingPlanes={otherPlanes.length > 0 ? otherPlanes : null}
                  toneMapped={false} />
              </mesh>
            )}
          </group>
        )
      })}
    </>
  )
}
