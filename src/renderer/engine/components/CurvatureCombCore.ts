import * as THREE from 'three'
import type { SelectorRuntime } from '@/lib/topology/types'

const EPS = 1e-12
const MAX_TOOTH_FRACTION = 0.15

interface EdgeVertexData {
  positions: Float32Array
  curvatures: Float32Array
  normals: Float32Array
  vertexCount: number
}

function cross(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
): number[] {
  return [
    ay * bz - az * by,
    az * bx - ax * bz,
    ax * by - ay * bx,
  ]
}

function dot(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  return ax * bx + ay * by + az * bz
}

function normalize(x: number, y: number, z: number): number[] {
  const len = Math.sqrt(x * x + y * y + z * z)
  if (len < EPS) return [0, 0, 0]
  return [x / len, y / len, z / len]
}

function sub(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
): number[] {
  return [ax - bx, ay - by, az - bz]
}

function length(x: number, y: number, z: number): number {
  return Math.sqrt(x * x + y * y + z * z)
}

export function computeEdgeCurvature(
  edgePositions: Float32Array,
  edgeIndices: Uint32Array,
  segmentStart: number,
  segmentCount: number,
): EdgeVertexData | null {
  if (edgePositions.length === 0 || edgeIndices.length === 0 || segmentCount < 1) return null

  const firstIdx = edgeIndices[segmentStart * 2]
  const vertexCount = segmentCount + 1

  if (firstIdx * 3 + (vertexCount - 1) * 3 + 2 >= edgePositions.length) return null

  const positions = new Float32Array(vertexCount * 3)
  for (let i = 0; i < vertexCount; i++) {
    const srcOff = (firstIdx + i) * 3
    const dstOff = i * 3
    positions[dstOff] = edgePositions[srcOff]
    positions[dstOff + 1] = edgePositions[srcOff + 1]
    positions[dstOff + 2] = edgePositions[srcOff + 2]
  }

  const curvatures = new Float32Array(vertexCount)
  const normals = new Float32Array(vertexCount * 3)

  if (vertexCount < 3) {
    for (let i = 0; i < vertexCount; i++) {
      curvatures[i] = 0
      normals[i * 3] = 0
      normals[i * 3 + 1] = 0
      normals[i * 3 + 2] = 0
    }
    return { positions, curvatures, normals, vertexCount }
  }

  for (let i = 1; i < vertexCount - 1; i++) {
    const off0 = (i - 1) * 3
    const off1 = i * 3
    const off2 = (i + 1) * 3

    const ax = positions[off0], ay = positions[off0 + 1], az = positions[off0 + 2]
    const bx = positions[off1], by = positions[off1 + 1], bz = positions[off1 + 2]
    const cx = positions[off2], cx_ = positions[off2 + 1], cz = positions[off2 + 2]

    const [v1x, v1y, v1z] = sub(bx, by, bz, ax, ay, az)
    const [v2x, v2y, v2z] = sub(cx, cx_, cz, bx, by, bz)
    const [v3x, v3y, v3z] = sub(cx, cx_, cz, ax, ay, az)

    const aLen = length(v1x, v1y, v1z)
    const bLen = length(v2x, v2y, v2z)
    const cLen = length(v3x, v3y, v3z)

    if (aLen < EPS || bLen < EPS || cLen < EPS) {
      curvatures[i] = 0
      normals[off1] = 0; normals[off1 + 1] = 0; normals[off1 + 2] = 0
      continue
    }

    const [crx, cry, crz] = cross(v1x, v1y, v1z, v3x, v3y, v3z)
    const crossLen = length(crx, cry, crz)
    const triangleArea = crossLen * 0.5

    if (triangleArea < EPS) {
      curvatures[i] = 0
      normals[off1] = 0; normals[off1 + 1] = 0; normals[off1 + 2] = 0
      continue
    }

    const kappa = 4 * triangleArea / (aLen * bLen * cLen)
    curvatures[i] = kappa

    const [tx, ty, tz] = normalize(v3x, v3y, v3z)

    const [nx, ny, nz] = normalize(crx, cry, crz)
    const [normalX, normalY, normalZ] = cross(nx, ny, nz, tx, ty, tz)
    const normalLen = length(normalX, normalY, normalZ)

    if (normalLen < EPS) {
      normals[off1] = 0; normals[off1 + 1] = 0; normals[off1 + 2] = 0
      continue
    }

    const [aax, aay, aaz] = sub(v2x, v2y, v2z, v1x, v1y, v1z)
    const dt = dot(aax, aay, aaz, tx, ty, tz)
    const [apx, apy, apz] = sub(aax, aay, aaz, tx * dt, ty * dt, tz * dt)

    const [nnx, nny, nnz] = normalize(normalX, normalY, normalZ)
    if (dot(nnx, nny, nnz, apx, apy, apz) < 0) {
      normals[off1] = nnx
      normals[off1 + 1] = nny
      normals[off1 + 2] = nnz
    } else {
      normals[off1] = -nnx
      normals[off1 + 1] = -nny
      normals[off1 + 2] = -nnz
    }
  }

  curvatures[0] = curvatures[1]
  normals[0] = normals[3]; normals[1] = normals[4]; normals[2] = normals[5]

  const last = vertexCount - 1
  curvatures[last] = curvatures[last - 1]
  normals[last * 3] = normals[(last - 1) * 3]
  normals[last * 3 + 1] = normals[(last - 1) * 3 + 1]
  normals[last * 3 + 2] = normals[(last - 1) * 3 + 2]

  return { positions, curvatures, normals, vertexCount }
}

export function collectEdgeRows(
  runtime: SelectorRuntime,
  selectedIds: string[],
): number[] {
  const edgeRows = new Set<number>()

  for (const id of selectedIds) {
    const ref = runtime.referenceMap.get(id)
    if (!ref) continue

    if (ref.selectorType === 'edge') {
      edgeRows.add(ref.rowIndex)
    } else if (ref.selectorType === 'face') {
      const faceRow = runtime.faces[ref.rowIndex]
      if (!faceRow) continue
      const { edgeStart = 0, edgeCount = 0 } = faceRow
      const faceEdgeRows = runtime.proxy.faceEdgeRows
      if (!faceEdgeRows || !edgeCount) continue
      for (let i = 0; i < edgeCount; i++) {
        const edgeRowIdx = faceEdgeRows[edgeStart + i]
        if (typeof edgeRowIdx === 'number') {
          edgeRows.add(edgeRowIdx)
        }
      }
    }
  }

  return [...edgeRows]
}

function computeBboxDiagonal(edgePositions: Float32Array): number {
  if (edgePositions.length < 3) return 0
  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity
  let minZ = Infinity, maxZ = -Infinity
  for (let i = 0; i < edgePositions.length; i += 3) {
    const x = edgePositions[i], y = edgePositions[i + 1], z = edgePositions[i + 2]
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
    if (z < minZ) minZ = z
    if (z > maxZ) maxZ = z
  }
  const dx = maxX - minX, dy = maxY - minY, dz = maxZ - minZ
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

export function buildCombGeometry(
  runtime: SelectorRuntime | null,
  selectedIds: string[],
  scale: number,
  matrixWorld?: THREE.Matrix4,
): THREE.BufferGeometry | null {
  if (!runtime || selectedIds.length === 0) return null

  const edgePositions = runtime.proxy.edgePositions
  const edgeIndices = runtime.proxy.edgeIndices
  if (edgePositions.length === 0 || edgeIndices.length === 0) return null

  const bboxDiag = computeBboxDiagonal(edgePositions)
  const maxToothLength = bboxDiag * MAX_TOOTH_FRACTION

  const edgeRows = collectEdgeRows(runtime, selectedIds)
  if (edgeRows.length === 0) return null

  const combPoints: number[] = []

  const vec3 = new THREE.Vector3()

  for (const edgeRowIdx of edgeRows) {
    const edgeRow = runtime.edges[edgeRowIdx]
    if (!edgeRow) continue

    const segmentStart = edgeRow.segmentStart ?? 0
    const segmentCount = edgeRow.segmentCount ?? 0
    if (segmentCount < 1) continue

    const data = computeEdgeCurvature(edgePositions, edgeIndices, segmentStart, segmentCount)
    if (!data) continue

    const { positions, curvatures, normals, vertexCount } = data

    for (let i = 0; i < vertexCount; i++) {
      const po = i * 3
      const px = positions[po], py = positions[po + 1], pz = positions[po + 2]
      const k = curvatures[i]
      const no = i * 3
      const nx = normals[no], ny = normals[no + 1], nz = normals[no + 2]

      if (k < EPS) continue

      const rawLength = k * scale
      const clampedLength = rawLength > maxToothLength ? maxToothLength : rawLength

      if (matrixWorld) {
        vec3.set(px, py, pz).applyMatrix4(matrixWorld)
        combPoints.push(vec3.x, vec3.y, vec3.z)
        vec3.set(px + nx * clampedLength, py + ny * clampedLength, pz + nz * clampedLength).applyMatrix4(matrixWorld)
        combPoints.push(vec3.x, vec3.y, vec3.z)
      } else {
        combPoints.push(px, py, pz)
        combPoints.push(
          px + nx * clampedLength,
          py + ny * clampedLength,
          pz + nz * clampedLength,
        )
      }
    }
  }

  if (combPoints.length === 0) return null

  const positionsArray = new Float32Array(combPoints)
  const indices: number[] = []

  for (let i = 0; i < combPoints.length / 6; i++) {
    indices.push(i * 2, i * 2 + 1)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positionsArray, 3))
  geometry.setIndex(indices)
  return geometry
}

export function computeAutoScale(
  runtime: SelectorRuntime | null,
  selectedIds: string[],
): number {
  if (!runtime || selectedIds.length === 0) return 1

  const edgeRows = collectEdgeRows(runtime, selectedIds)

  let totalLength = 0
  let maxCurv = 0
  const edgePositions = runtime.proxy.edgePositions
  const edgeIndices = runtime.proxy.edgeIndices
  if (edgePositions.length === 0 || edgeIndices.length === 0) return 1

  for (const edgeRowIdx of edgeRows) {
    const edgeRow = runtime.edges[edgeRowIdx]
    if (!edgeRow) continue
    const len = edgeRow.length ?? 0
    totalLength += len

    const data = computeEdgeCurvature(edgePositions, edgeIndices, edgeRow.segmentStart ?? 0, edgeRow.segmentCount ?? 0)
    if (!data) continue
    for (let i = 0; i < data.vertexCount; i++) {
      if (data.curvatures[i] > maxCurv) maxCurv = data.curvatures[i]
    }
  }

  if (maxCurv < EPS || totalLength < EPS) return 1
  return (totalLength * 0.3) / maxCurv
}
