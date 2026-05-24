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

// Shared vertex shader — passes interpolated world position to fragment shader.
const CAP_VERTEX_SHADER = /* glsl */`
  varying vec3 vWorldPosition;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

// Fill shader: renders back faces on the clipped side to fill the cross-section interior.
// No epsilon — keeps ALL back faces on the clipped side. BackSide ensures only
// faces pointing away from the camera (the interior surface) are rendered.
const FILL_FRAGMENT_SHADER = /* glsl */`
  varying vec3 vWorldPosition;
  uniform vec3 uCapPlaneNormal;
  uniform float uCapPlaneConstant;
  uniform vec4 uOtherPlane0;
  uniform vec4 uOtherPlane1;
  uniform int uOtherPlaneCount;
  uniform vec3 uCapColor;

  void main() {
    float dCap = dot(uCapPlaneNormal, vWorldPosition) + uCapPlaneConstant;

    // Keep fragments on the clipped side only (d < 0)
    if (dCap >= 0.0) discard;

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

// Outline shader: renders all faces within epsilon of the plane to form
// the complete cross-section contour. DoubleSide prevents missing edges.
const OUTLINE_FRAGMENT_SHADER = /* glsl */`
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

    // Only render fragments within epsilon distance of the plane
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

function createFillMaterial(
  capPlane: THREE.Plane,
  otherPlanes: THREE.Plane[],
  color: string,
): THREE.ShaderMaterial {
  const op0 = otherPlanes.length >= 1
    ? new THREE.Vector4(otherPlanes[0].normal.x, otherPlanes[0].normal.y, otherPlanes[0].normal.z, otherPlanes[0].constant)
    : new THREE.Vector4(0, 0, 0, 0)
  const op1 = otherPlanes.length >= 2
    ? new THREE.Vector4(otherPlanes[1].normal.x, otherPlanes[1].normal.y, otherPlanes[1].normal.z, otherPlanes[1].constant)
    : new THREE.Vector4(0, 0, 0, 0)

  return new THREE.ShaderMaterial({
    vertexShader: CAP_VERTEX_SHADER,
    fragmentShader: FILL_FRAGMENT_SHADER,
    uniforms: {
      uCapPlaneNormal: { value: capPlane.normal.clone() },
      uCapPlaneConstant: { value: capPlane.constant },
      uOtherPlane0: { value: op0 },
      uOtherPlane1: { value: op1 },
      uOtherPlaneCount: { value: otherPlanes.length },
      uCapColor: { value: new THREE.Color(color) },
    },
    side: THREE.BackSide,
    depthTest: true,
    depthWrite: true,
  })
}

function createOutlineMaterial(
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
    fragmentShader: OUTLINE_FRAGMENT_SHADER,
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
    depthTest: false,
    depthWrite: false,
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

        // Fill material: BackSide, renders back faces on the clipped side (d < 0).
        // These form the solid cross-section interior.
        const fillMat = createFillMaterial(ap.plane, otherPlanes, capColor)

        // Outline material: DoubleSide, renders all faces within epsilon of the plane.
        // This produces the complete cross-section contour.
        const outlineEpsilon = minDim > 0 ? minDim * 0.03 : 0.01
        const outlineMat = createOutlineMaterial(ap.plane, otherPlanes, capColor, outlineEpsilon)

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
            {/* Fill pass: back faces on the clipped side → solid cross-section interior */}
            {meshData.map((md, i) => (
              <mesh key={`fill-${ap.axis}-${i}`} geometry={md.geometry}
                matrix={md.matrixWorld} matrixAutoUpdate={false}
                material={fillMat}
                renderOrder={planeIdx * 3 + 0}
                frustumCulled={false}
                userData={{ _crossSectionInternal: true }}
              />
            ))}
            {/* Outline pass: all faces within epsilon → complete cross-section contour */}
            {meshData.map((md, i) => (
              <mesh key={`outline-${ap.axis}-${i}`} geometry={md.geometry}
                matrix={md.matrixWorld} matrixAutoUpdate={false}
                material={outlineMat}
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
