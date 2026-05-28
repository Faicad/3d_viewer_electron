import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildCornerGeometry, CORNER_RATIO } from '@/engine/components/SelectionBoundingBox'

function createTestGroup(): THREE.Group {
  const group = new THREE.Group()

  // Part A: a 2×2×2 box centered at (3, 0, 0) → bbox [2, -1, -1] to [4, 1, 1]
  const geoA = new THREE.BoxGeometry(2, 2, 2)
  geoA.computeBoundingBox()
  const meshA = new THREE.Mesh(geoA)
  meshA.userData.partId = 'partA'
  meshA.position.set(3, 0, 0)
  meshA.updateMatrixWorld()
  group.add(meshA)

  // Part B: a 1×1×1 box at (0, 5, 0) → bbox [-0.5, 4.5, -0.5] to [0.5, 5.5, 0.5]
  const geoB = new THREE.BoxGeometry(1, 1, 1)
  geoB.computeBoundingBox()
  const meshB = new THREE.Mesh(geoB)
  meshB.userData.partId = 'partB'
  meshB.position.set(0, 5, 0)
  meshB.updateMatrixWorld()
  group.add(meshB)

  // Unrelated part
  const geoC = new THREE.BoxGeometry(1, 1, 1)
  const meshC = new THREE.Mesh(geoC)
  meshC.userData.partId = 'partC'
  meshC.position.set(100, 100, 100)
  meshC.updateMatrixWorld()
  group.add(meshC)

  return group
}

describe('buildCornerGeometry', () => {
  it('returns null when selectedPartIds is empty', () => {
    const group = createTestGroup()
    expect(buildCornerGeometry(group, [])).toBeNull()
  })

  it('returns null when no matching meshes found', () => {
    const group = createTestGroup()
    expect(buildCornerGeometry(group, ['nonexistent'])).toBeNull()
  })

  it('computes correct bbox for a single selected part', () => {
    const group = createTestGroup()
    const geo = buildCornerGeometry(group, ['partA'])
    expect(geo).not.toBeNull()

    const positions = geo!.getAttribute('position') as THREE.BufferAttribute
    // 8 corners × 3 segments × 2 vertices = 48 vertices
    expect(positions.count).toBe(48)

    // partA bbox: [2, -1, -1] to [4, 1, 1], dimensions: [2, 2, 2]
    // corner ratio: 0.1, so arm length = 0.2 on each axis
    const arr = positions.array as Float32Array

    // Check that one corner (minX, minY, minZ) = (2, -1, -1) has arms extending in +X, +Y, +Z
    // Looking for a vertex at (2, -1, -1)...
    let foundMinCorner = false
    for (let i = 0; i < arr.length; i += 3) {
      if (Math.abs(arr[i] - 2) < 0.001 && Math.abs(arr[i + 1] - (-1)) < 0.001 && Math.abs(arr[i + 2] - (-1)) < 0.001) {
        foundMinCorner = true
        break
      }
    }
    expect(foundMinCorner).toBe(true)
  })

  it('merges bbox for multiple selected parts', () => {
    const group = createTestGroup()
    const geo = buildCornerGeometry(group, ['partA', 'partB'])
    expect(geo).not.toBeNull()

    const positions = geo!.getAttribute('position') as THREE.BufferAttribute
    expect(positions.count).toBe(48)

    // Combined bbox: min [-0.5, -1, -1], max [4, 5.5, 1]
    // dimensions: [4.5, 6.5, 2], arms: [0.45, 0.65, 0.2]
    const arr = positions.array as Float32Array

    // Check max corner exists: (4, 5.5, 1)
    let foundMaxCorner = false
    for (let i = 0; i < arr.length; i += 3) {
      if (Math.abs(arr[i] - 4) < 0.001 && Math.abs(arr[i + 1] - 5.5) < 0.001 && Math.abs(arr[i + 2] - 1) < 0.001) {
        foundMaxCorner = true
        break
      }
    }
    expect(foundMaxCorner).toBe(true)
  })

  it('arm lengths are proportional to bbox dimensions', () => {
    const group = createTestGroup()
    const geo = buildCornerGeometry(group, ['partA'])
    expect(geo).not.toBeNull()

    const positions = geo!.getAttribute('position') as THREE.BufferAttribute
    const arr = positions.array as Float32Array

    // partA bbox: [2, -1, -1] to [4, 1, 1], dimensions: 2×2×2
    // arms should be 2 * 0.1 = 0.2 in each direction
    // At corner (4, 1, 1) → arms go to (3.8, 1, 1), (4, 0.8, 1), (4, 1, 0.8)
    // Segment 1: (4, 1, 1) → (3.8, 1, 1) → delta = [-0.2, 0, 0]
    // Segment 2: (4, 1, 1) → (4, 0.8, 1) → delta = [0, -0.2, 0]
    // Segment 3: (4, 1, 1) → (4, 1, 0.8) → delta = [0, 0, -0.2]

    // Find the max corner vertices and verify arm endpoints
    const maxX = 4, maxY = 1, maxZ = 1
    const armLen = 2 * CORNER_RATIO // 0.2

    let foundXArm = false, foundYArm = false, foundZArm = false
    for (let i = 0; i < arr.length; i += 6) {
      const x1 = arr[i], y1 = arr[i + 1], z1 = arr[i + 2]
      const x2 = arr[i + 3], y2 = arr[i + 4], z2 = arr[i + 5]

      // Check if this is the max corner (4, 1, 1)
      if (Math.abs(x1 - maxX) > 0.001 || Math.abs(y1 - maxY) > 0.001 || Math.abs(z1 - maxZ) > 0.001) continue

      // Check arm direction
      if (Math.abs(x2 - (maxX - armLen)) < 0.001 && Math.abs(y2 - maxY) < 0.001 && Math.abs(z2 - maxZ) < 0.001) foundXArm = true
      if (Math.abs(x2 - maxX) < 0.001 && Math.abs(y2 - (maxY - armLen)) < 0.001 && Math.abs(z2 - maxZ) < 0.001) foundYArm = true
      if (Math.abs(x2 - maxX) < 0.001 && Math.abs(y2 - maxY) < 0.001 && Math.abs(z2 - (maxZ - armLen)) < 0.001) foundZArm = true
    }

    expect(foundXArm).toBe(true)
    expect(foundYArm).toBe(true)
    expect(foundZArm).toBe(true)
  })
})
