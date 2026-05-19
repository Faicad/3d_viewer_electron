import * as THREE from 'three'

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
  return n.toLocaleString()
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
