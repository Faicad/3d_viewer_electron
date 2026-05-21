import * as THREE from 'three'
import type { UnitSystem } from '@/config/file-formats'

export interface ComputedModelStats {
  vertices: number
  triangles: number
  surfaceArea: number
  volume: number
  boundingBox: THREE.Box3
  partCount: number
}

export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '-'
  if (n === 0) return '0'
  if (Math.abs(n) >= 100) return Math.round(n).toLocaleString()
  // For values between 1 and 100, show up to 4 significant digits
  if (Math.abs(n) >= 1) return n.toLocaleString(undefined, { maximumSignificantDigits: 4 })
  // For values < 1, show up to 3 significant digits
  return n.toLocaleString(undefined, { maximumSignificantDigits: 3 })
}

function computeMeshStats(mesh: THREE.Mesh): {
  vertices: number
  triangles: number
  surfaceArea: number
  volume: number
  box: THREE.Box3
} {
  const geo = mesh.geometry
  if (!geo) {
    return { vertices: 0, triangles: 0, surfaceArea: 0, volume: 0, box: new THREE.Box3() }
  }

  const posAttr = geo.getAttribute('position')
  if (!posAttr) {
    return { vertices: 0, triangles: 0, surfaceArea: 0, volume: 0, box: new THREE.Box3() }
  }

  const vertices = posAttr.count

  const index = geo.index
  let surfaceArea = 0
  let volume = 0

  if (index) {
    const idx = index.array
    const idxCount = index.count
    for (let i = 0; i < idxCount; i += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(posAttr, idx[i])
      const b = new THREE.Vector3().fromBufferAttribute(posAttr, idx[i + 1])
      const c = new THREE.Vector3().fromBufferAttribute(posAttr, idx[i + 2])

      a.applyMatrix4(mesh.matrixWorld)
      b.applyMatrix4(mesh.matrixWorld)
      c.applyMatrix4(mesh.matrixWorld)

      const ab = new THREE.Vector3().subVectors(b, a)
      const ac = new THREE.Vector3().subVectors(c, a)
      const cross = new THREE.Vector3().crossVectors(ab, ac)
      surfaceArea += cross.length() * 0.5

      volume += (a.x * b.y * c.z + a.y * b.z * c.x + a.z * b.x * c.y
               - a.x * b.z * c.y - a.y * b.x * c.z - a.z * b.y * c.x)
    }
  } else {
    const count = posAttr.count
    for (let i = 0; i < count; i += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(posAttr, i)
      const b = new THREE.Vector3().fromBufferAttribute(posAttr, i + 1)
      const c = new THREE.Vector3().fromBufferAttribute(posAttr, i + 2)

      a.applyMatrix4(mesh.matrixWorld)
      b.applyMatrix4(mesh.matrixWorld)
      c.applyMatrix4(mesh.matrixWorld)

      const ab = new THREE.Vector3().subVectors(b, a)
      const ac = new THREE.Vector3().subVectors(c, a)
      const cross = new THREE.Vector3().crossVectors(ab, ac)
      surfaceArea += cross.length() * 0.5

      volume += (a.x * b.y * c.z + a.y * b.z * c.x + a.z * b.x * c.y
               - a.x * b.z * c.y - a.y * b.x * c.z - a.z * b.y * c.x)
    }
  }

  volume = Math.abs(volume) / 6

  const triangles = index ? index.count / 3 : posAttr.count / 3

  const box = new THREE.Box3()
  if (geo.boundingBox) {
    const worldBox = geo.boundingBox.clone()
    worldBox.applyMatrix4(mesh.matrixWorld)
    box.copy(worldBox)
  } else {
    box.setFromBufferAttribute(posAttr)
    box.applyMatrix4(mesh.matrixWorld)
  }

  return { vertices, triangles, surfaceArea, volume, box }
}

export function computeModelStats(group: THREE.Group): ComputedModelStats {
  let totalVertices = 0
  let totalTriangles = 0
  let totalSurfaceArea = 0
  let totalVolume = 0
  let partCount = 0
  const overallBox = new THREE.Box3()

  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.visible) return

    const geo = child.geometry
    if (!geo || !geo.getAttribute('position')) return

    const stats = computeMeshStats(child)
    totalVertices += stats.vertices
    totalTriangles += stats.triangles
    totalSurfaceArea += stats.surfaceArea
    totalVolume += stats.volume
    overallBox.union(stats.box)
    partCount++
  })

  return {
    vertices: totalVertices,
    triangles: totalTriangles,
    surfaceArea: totalSurfaceArea,
    volume: totalVolume,
    boundingBox: overallBox,
    partCount,
  }
}

/** Convert volume from source unit to mm³ */
function volumeToMm3(volume: number, sourceUnit: UnitSystem): number {
  switch (sourceUnit) {
    case 'millimeter': return volume
    case 'centimeter': return volume * 1000            // 1 cm³ = 1000 mm³
    case 'meter':      return volume * 1_000_000_000    // 1 m³ = 10⁹ mm³
    case 'inch':       return volume * 16_387.064       // 1 in³ = 16387.064 mm³
    case 'foot':       return volume * 28_316_846.592   // 1 ft³ ≈ 28.3×10⁶ mm³
    case 'micron':     return volume * 1e-9             // 1 µm³ = 10⁻⁹ mm³
    case 'angstrom':   return volume * 1e-24            // 1 Å³ = 10⁻²⁴ mm³
    default:           return volume                    // assume mm
  }
}

/** Compute PLA material cost string.
 *  Formula: mm³ ÷ 1000 × 1.24 g/cm³ (PLA density).
 *  Volume is converted to mm³ based on sourceUnit before applying the formula. */
export function computeMaterialCost(volume: number, sourceUnit: UnitSystem): string {
  if (!Number.isFinite(volume) || volume <= 0) return '-'
  const volumeMm3 = volumeToMm3(volume, sourceUnit)
  const grams = volumeMm3 / 1000 * 1.24
  return `${formatNumber(grams)} g (PLA)`
}
