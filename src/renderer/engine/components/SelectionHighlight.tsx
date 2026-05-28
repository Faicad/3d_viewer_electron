import { useEffect, useMemo, useRef, useState } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { Line2, LineMaterial, LineGeometry } from 'three-stdlib'
import { useModelStore } from '@/stores/model-store'
import { useEngineStore } from '@/stores/engine-store'
import { flattenVisibility } from '@/lib/scene-tree-utils'
import type { Reference, SelectorRuntime } from '@/lib/topology/types'

interface SelectionHighlightProps {
  runtime: SelectorRuntime | null
  referenceId: string | null
  color: string
  opacity: number
  modelGroupRef?: React.RefObject<THREE.Group | null>
  renderOrder?: number
}

type HighlightGeometry =
  | { type: 'mesh'; geo: THREE.BufferGeometry }
  | { type: 'line'; geo: LineGeometry }
  | { type: 'vertex'; geo: THREE.BufferGeometry }
  | null

export default function SelectionHighlight({
  runtime,
  referenceId,
  color,
  opacity,
  modelGroupRef,
  renderOrder = 2,
}: SelectionHighlightProps) {
  const { size } = useThree()
  const lineObjRef = useRef<Line2 | null>(null)
  const lineMatRef = useRef<LineMaterial | null>(null)
  const [lineVersion, setLineVersion] = useState(0)
  void lineVersion // suppress unused warning — used to trigger re-renders after ref update

  // Subscribe to sceneTree so highlight geometry is recomputed when mesh visibility toggles.
  // We compute a Set of visible partIds from the sceneTree directly instead of relying on
  // Three.js child.visible, because useMemo runs during render — before R3F commits
  // visibility prop changes to the Three.js objects.
  const sceneTree = useModelStore((s) => s.sceneTree)
  const highlightVersion = useEngineStore((s) => s.highlightVersion)
  const visiblePartIds = useMemo(() => {
    const map = flattenVisibility(sceneTree)
    const set = new Set<string>()
    for (const [id, vis] of map) {
      if (vis) set.add(id)
    }
    return set
  }, [sceneTree])

  const geometry: HighlightGeometry = useMemo(() => {
    if (!referenceId) return null

    // First try topology reference (face/edge/vertex)
    const ref = runtime?.referenceMap.get(referenceId)
    if (ref) {
      if (ref.selectorType === 'face') {
        return buildFaceHighlightGeometry(
          ref.pickData.triangleStart,
          ref.pickData.triangleCount,
          ref.partId,
          modelGroupRef,
          visiblePartIds,
        )
      }

      if (ref.selectorType === 'edge') {
        const result = buildEdgeLineGeometry(
          runtime!,
          ref.pickData.segmentStart,
          ref.pickData.segmentCount,
          modelGroupRef,
          visiblePartIds,
        )
        if (result) return { type: 'line', geo: result.geo }
        return null
      }

      if (ref.selectorType === 'vertex') {
        return buildVertexHighlightGeometry(runtime!, ref, modelGroupRef, visiblePartIds)
      }

      return null
    }

    // Fallback: referenceId is a partId (object-mode selection or tree node click)
    // Highlight the entire mesh for that part
    return buildObjectHighlightGeometry(referenceId, modelGroupRef, visiblePartIds)
  }, [runtime, referenceId, modelGroupRef, visiblePartIds, highlightVersion])

  useEffect(() => {
    // Dispose previous line objects
    if (lineObjRef.current) {
      lineObjRef.current.geometry?.dispose()
      lineObjRef.current = null
    }
    if (lineMatRef.current) {
      lineMatRef.current.dispose()
      lineMatRef.current = null
    }

    if (geometry?.type !== 'line') return

    const mat = new LineMaterial({
      linewidth: 3,
      worldUnits: false,
      resolution: new THREE.Vector2(1, 1),
      transparent: true,
      depthTest: true,
      depthWrite: false,
    })
    const line2 = new Line2(geometry.geo, mat)
    line2.renderOrder = renderOrder
    line2.frustumCulled = false
    lineObjRef.current = line2
    lineMatRef.current = mat
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLineVersion(v => v + 1)

    return () => {
      lineObjRef.current?.geometry?.dispose()
      lineMatRef.current?.dispose()
    }
  }, [geometry, renderOrder])

  // Geometry is now in world coordinates (transformed via mesh.matrixWorld)
  // So position offset is just (0,0,0)
  const worldPosition = new THREE.Vector3(0, 0, 0)

  if (!geometry) return null

  const position: [number, number, number] = [worldPosition.x, worldPosition.y, worldPosition.z]

  /* eslint-disable react-hooks/refs */
  if (geometry.type === 'line' && lineObjRef.current && lineMatRef.current) {
    const mat = lineMatRef.current
    mat.color.set(color)
    mat.opacity = opacity
    mat.resolution.set(size.width, size.height)
    const line2 = lineObjRef.current
    line2.position.set(...position)
    return <primitive object={line2} />
  }
  /* eslint-enable react-hooks/refs */

  if (geometry.type === 'vertex') {
    return (
      <mesh geometry={geometry.geo} position={position} frustumCulled={false} renderOrder={renderOrder}>
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    )
  }

  return (
    <mesh geometry={geometry.geo} position={position} frustumCulled={false} renderOrder={renderOrder}>
      <meshBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        side={THREE.DoubleSide}
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  )
}

// ---- helpers ----

function collectDisplayMeshes(
  group: THREE.Group | null,
  visiblePartIds?: Set<string>,
): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = []
  if (!group) return meshes
  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const partId = child.userData?.partId as string | undefined
    const vis = visiblePartIds
      ? partId != null && visiblePartIds.has(partId)
      : child.visible
    if (vis) meshes.push(child)
  })
  return meshes
}

// ---- geometry builders ----

function buildObjectHighlightGeometry(
  partId: string,
  modelGroupRef: React.RefObject<THREE.Group | null> | undefined,
  visiblePartIds?: Set<string>,
): { type: 'mesh'; geo: THREE.BufferGeometry } | null {
  if (!modelGroupRef?.current) return null

  const meshes = collectDisplayMeshes(modelGroupRef.current, visiblePartIds)
  const mesh = meshes.find((m) => m.userData?.partId === partId)
  if (!mesh) return null

  const geo = mesh.geometry
  if (!geo.index) return null

  mesh.updateWorldMatrix(true, false)

  const positions = geo.getAttribute('position')
  if (!positions || positions.count === 0) return null

  const indexData = geo.index
  const _totalTriangles = indexData.count / 3

  // Collect all vertex indices for the entire mesh
  const vertexMap = new Map<number, number>()
  const uniqueVerts: number[] = []
  const remappedIndices = new Uint32Array(indexData.count)

  for (let i = 0; i < indexData.count; i++) {
    const idx = indexData.getX(i)
    if (!vertexMap.has(idx)) {
      vertexMap.set(idx, uniqueVerts.length)
      uniqueVerts.push(idx)
    }
    remappedIndices[i] = vertexMap.get(idx)!
  }

  // Transform local positions to world using mesh's matrixWorld
  const newPositions = new Float32Array(uniqueVerts.length * 3)
  for (let i = 0; i < uniqueVerts.length; i++) {
    const srcIdx = uniqueVerts[i]
    const worldPos = new THREE.Vector3(
      positions.getX(srcIdx),
      positions.getY(srcIdx),
      positions.getZ(srcIdx),
    ).applyMatrix4(mesh.matrixWorld)
    newPositions[i * 3] = worldPos.x
    newPositions[i * 3 + 1] = worldPos.y
    newPositions[i * 3 + 2] = worldPos.z
  }

  const resultGeo = new THREE.BufferGeometry()
  resultGeo.setAttribute('position', new THREE.BufferAttribute(newPositions, 3))
  resultGeo.setIndex(new THREE.BufferAttribute(remappedIndices, 1))
  return { type: 'mesh', geo: resultGeo }
}

function buildFaceHighlightGeometry(
  triangleStart: number,
  triangleCount: number,
  partId: string | undefined,
  modelGroupRef: React.RefObject<THREE.Group | null> | undefined,
  visiblePartIds?: Set<string>,
): { type: 'mesh'; geo: THREE.BufferGeometry } | null {
  if (triangleCount <= 0) return null
  if (!modelGroupRef?.current) return null

  const meshes = collectDisplayMeshes(modelGroupRef.current, visiblePartIds)
  if (!meshes.length) return null

  let mesh: THREE.Mesh | undefined
  if (partId) {
    mesh = meshes.find((m) => m.userData?.partId === partId)
  } else {
    mesh = meshes[0]
  }
  // If the target mesh is hidden (not in visible meshes), don't show highlight
  if (!mesh) return null

  const geo = mesh.geometry
  if (!geo.index) return null

  const positions = geo.getAttribute('position')
  if (!positions || positions.count === 0) return null

  // Update world matrix to ensure we have latest transforms
  mesh.updateWorldMatrix(true, false)

  const indexData = geo.index
  const indexStart = triangleStart * 3
  const indexEnd = Math.min(indexStart + triangleCount * 3, indexData.count)

  if (indexEnd <= indexStart) return null

  const triIndices: number[] = []
  for (let i = indexStart; i < indexEnd; i++) {
    triIndices.push(indexData.getX(i))
  }

  const vertexMap = new Map<number, number>()
  const uniqueVerts: number[] = []
  for (const idx of triIndices) {
    if (!vertexMap.has(idx)) {
      vertexMap.set(idx, uniqueVerts.length)
      uniqueVerts.push(idx)
    }
  }

  const remappedIndices = new Uint32Array(triIndices.length)
  for (let i = 0; i < triIndices.length; i++) {
    remappedIndices[i] = vertexMap.get(triIndices[i])!
  }

  // Transform local positions to world positions using mesh's matrixWorld
  const newPositions = new Float32Array(uniqueVerts.length * 3)
  for (let i = 0; i < uniqueVerts.length; i++) {
    const srcIdx = uniqueVerts[i]
    const localX = positions.getX(srcIdx)
    const localY = positions.getY(srcIdx)
    const localZ = positions.getZ(srcIdx)
    // Apply mesh matrixWorld to transform to world coordinates
    const worldPos = new THREE.Vector3(localX, localY, localZ).applyMatrix4(mesh.matrixWorld)
    newPositions[i * 3] = worldPos.x
    newPositions[i * 3 + 1] = worldPos.y
    newPositions[i * 3 + 2] = worldPos.z
  }

  const resultGeo = new THREE.BufferGeometry()
  resultGeo.setAttribute('position', new THREE.BufferAttribute(newPositions, 3))
  resultGeo.setIndex(new THREE.BufferAttribute(remappedIndices, 1))
  return { type: 'mesh', geo: resultGeo }
}

function buildEdgeLineGeometry(
  runtime: SelectorRuntime,
  segmentStart: number,
  segmentCount: number,
  modelGroupRef: React.RefObject<THREE.Group | null> | undefined,
  visiblePartIds?: Set<string>,
): { type: 'line'; geo: LineGeometry } | null {
  const { edgePositions, edgeIndices } = runtime.proxy

  if (
    !(edgePositions instanceof Float32Array && edgePositions.length > 0) ||
    !(edgeIndices instanceof Uint32Array && edgeIndices.length > 0)
  ) {
    return null
  }

  if (segmentCount <= 0) return null

  // If no visible meshes, hide the highlight
  const visibleMeshes = modelGroupRef?.current ? collectDisplayMeshes(modelGroupRef.current, visiblePartIds) : []
  if (modelGroupRef?.current && visibleMeshes.length === 0) return null

  const indexStart = segmentStart * 2
  const indexEnd = Math.min(indexStart + segmentCount * 2, edgeIndices.length)

  const pairCount = (indexEnd - indexStart) / 2
  const positions = new Float32Array(pairCount * 6)

  for (let si = indexStart, pi = 0; si < indexEnd; si += 2, pi += 6) {
    const i0 = edgeIndices[si] * 3
    const i1 = edgeIndices[si + 1] * 3

    let worldPos0 = new THREE.Vector3(edgePositions[i0], edgePositions[i0 + 1], edgePositions[i0 + 2])
    let worldPos1 = new THREE.Vector3(edgePositions[i1], edgePositions[i1 + 1], edgePositions[i1 + 2])

    if (modelGroupRef?.current) {
      const meshes = collectDisplayMeshes(modelGroupRef.current, visiblePartIds)
      if (meshes.length > 0) {
        meshes[0].updateWorldMatrix(true, false)
        worldPos0 = worldPos0.applyMatrix4(meshes[0].matrixWorld)
        worldPos1 = worldPos1.applyMatrix4(meshes[0].matrixWorld)
      }
    }

    positions[pi] = worldPos0.x
    positions[pi + 1] = worldPos0.y
    positions[pi + 2] = worldPos0.z
    positions[pi + 3] = worldPos1.x
    positions[pi + 4] = worldPos1.y
    positions[pi + 5] = worldPos1.z
  }

  const geo = new LineGeometry()
  geo.setPositions(Array.from(positions))
  return { type: 'line', geo }
}

function buildVertexHighlightGeometry(
  runtime: SelectorRuntime,
  ref: Reference,
  modelGroupRef: React.RefObject<THREE.Group | null> | undefined,
  visiblePartIds?: Set<string>,
): { type: 'vertex'; geo: THREE.BufferGeometry } | null {
  // If no visible meshes, hide the highlight
  const visibleMeshes = modelGroupRef?.current ? collectDisplayMeshes(modelGroupRef.current, visiblePartIds) : []
  if (modelGroupRef?.current && visibleMeshes.length === 0) return null

  const vertexIndex = ref.rowIndex
  const { allPointPositions, vertexPositions } = runtime.proxy

  const positions =
    allPointPositions instanceof Float32Array && allPointPositions.length > 0
      ? allPointPositions
      : vertexPositions

  if (
    !(positions instanceof Float32Array) ||
    vertexIndex < 0 ||
    (vertexIndex + 1) * 3 > positions.length
  ) {
    return null
  }

  const localX = positions[vertexIndex * 3]
  const localY = positions[vertexIndex * 3 + 1]
  const localZ = positions[vertexIndex * 3 + 2]

  let worldX = localX
  let worldY = localY
  let worldZ = localZ
  if (modelGroupRef?.current) {
    const meshes = collectDisplayMeshes(modelGroupRef.current, visiblePartIds)
    if (meshes.length > 0) {
      meshes[0].updateWorldMatrix(true, false)
      const worldPos = new THREE.Vector3(localX, localY, localZ).applyMatrix4(meshes[0].matrixWorld)
      worldX = worldPos.x
      worldY = worldPos.y
      worldZ = worldPos.z
    }
  }

  const radius = pointHighlightRadius(vertexIndex, allPointPositions, runtime)
  const geo = new THREE.SphereGeometry(radius, 8, 8)
  geo.translate(worldX, worldY, worldZ)
  return { type: 'vertex', geo }
}

function pointHighlightRadius(
  vertexIndex: number,
  allPointPositions: Float32Array,
  runtime: SelectorRuntime,
): number {
  const bbox = runtime.bbox
  const bboxMin = bbox?.min
  const bboxMax = bbox?.max
  if (!Array.isArray(bboxMin) || !Array.isArray(bboxMax)) return 0.12
  const diag = Math.hypot(
    bboxMax[0] - bboxMin[0],
    bboxMax[1] - bboxMin[1],
    bboxMax[2] - bboxMin[2],
  )
  const vertexCount = runtime.proxy.vertexPointCount || 0
  if (vertexIndex >= vertexCount && allPointPositions.length > 0) {
    return Math.max(0.0003, Math.min(0.2, diag * 0.008))
  }
  return Math.max(0.0005, Math.min(0.3, diag * 0.015))
}
