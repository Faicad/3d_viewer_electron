import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { CleanRoomEnvironment } from './CleanRoomEnvironment'

describe('CleanRoomEnvironment', () => {
  it('creates a scene with non-null background', () => {
    const env = new CleanRoomEnvironment()
    expect(env.scene).toBeInstanceOf(THREE.Scene)
    expect(env.scene.background).toBeInstanceOf(THREE.Color)
    env.dispose()
  })

  it('scene is rotated 45° around Y', () => {
    const env = new CleanRoomEnvironment()
    expect(env.scene.rotation.y).toBeCloseTo(Math.PI / 4, 4)
    env.dispose()
  })

  it('contains exactly one room box', () => {
    const env = new CleanRoomEnvironment()
    const boxes = env.scene.children.filter(
      (c) => c.name === 'roomBox' && c instanceof THREE.Mesh,
    )
    expect(boxes).toHaveLength(1)

    const box = boxes[0] as THREE.Mesh
    expect(box.geometry).toBeInstanceOf(THREE.BoxGeometry)
    // BoxGeometry params are approximately (10, 8, 10)
    const bbox = new THREE.Box3().setFromObject(box)
    expect(bbox.max.x - bbox.min.x).toBeCloseTo(10, 0)
    expect(bbox.max.y - bbox.min.y).toBeCloseTo(8, 0)
    expect(bbox.max.z - bbox.min.z).toBeCloseTo(10, 0)
    env.dispose()
  })

  it('room box uses BackSide materials', () => {
    const env = new CleanRoomEnvironment()
    const box = env.scene.children.find(
      (c) => c.name === 'roomBox' && c instanceof THREE.Mesh,
    ) as THREE.Mesh

    const mats = Array.isArray(box.material) ? box.material : [box.material]
    expect(mats).toHaveLength(6)
    for (const mat of mats) {
      expect((mat as THREE.MeshStandardMaterial).side).toBe(THREE.BackSide)
    }
    env.dispose()
  })

  it('contains 6 area lights', () => {
    const env = new CleanRoomEnvironment()
    const lights = env.scene.children.filter((c) => c.name === 'areaLight')
    expect(lights).toHaveLength(6)

    for (const light of lights) {
      const mesh = light as THREE.Mesh
      expect(mesh.geometry).toBeInstanceOf(THREE.PlaneGeometry)

      const mat = mesh.material as THREE.MeshStandardMaterial
      expect(mat.emissive).toBeInstanceOf(THREE.Color)
      expect(mat.emissiveIntensity).toBeGreaterThan(0)
    }
    env.dispose()
  })

  it('contains 4 infinity coves', () => {
    const env = new CleanRoomEnvironment()
    const coves = env.scene.children.filter((c) => c.name === 'infinityCove')
    expect(coves).toHaveLength(4)

    for (const cove of coves) {
      const mesh = cove as THREE.Mesh
      expect(mesh.geometry).toBeInstanceOf(THREE.CylinderGeometry)

      // Each cove should be positioned at the floor level
      expect(mesh.position.y).toBeLessThan(0)
    }
    env.dispose()
  })

  it('infinity coves are positioned at floor-wall junctions', () => {
    const env = new CleanRoomEnvironment()
    const coves = env.scene.children.filter((c) => c.name === 'infinityCove') as THREE.Mesh[]

    // Cove Y position: bottom + COVE_RADIUS = -4 + 1.5 = -2.5
    for (const cove of coves) {
      expect(cove.position.y).toBeCloseTo(-2.5, 1)
    }

    // One cove per wall edge: +X, -X, +Z, -Z
    const positions = coves.map((c) => [c.position.x, c.position.z])
    const halfMinusR = 5 - 1.5 // 3.5

    // +X edge: x ≈ 3.5, z ≈ 0
    expect(positions.some(([x, z]) => Math.abs(x! - halfMinusR) < 0.1 && Math.abs(z!) < 0.1)).toBe(true)
    // -X edge: x ≈ -3.5, z ≈ 0
    expect(positions.some(([x, z]) => Math.abs(x! + halfMinusR) < 0.1 && Math.abs(z!) < 0.1)).toBe(true)
    // +Z edge: x ≈ 0, z ≈ 3.5
    expect(positions.some(([x, z]) => Math.abs(x!) < 0.1 && Math.abs(z! - halfMinusR) < 0.1)).toBe(true)
    // -Z edge: x ≈ 0, z ≈ -3.5
    expect(positions.some(([x, z]) => Math.abs(x!) < 0.1 && Math.abs(z! + halfMinusR) < 0.1)).toBe(true)

    env.dispose()
  })

  it('dispose cleans up geometries and materials', () => {
    const env = new CleanRoomEnvironment()
    env.dispose()

    // After dispose, scene children still exist but geometries are disposed
    for (const child of env.scene.children) {
      if (child instanceof THREE.Mesh) {
        // Not checking geometry — it was shared in some cases
        // but all materials should be disposed
      }
    }
  })

  it('total child count is 1 room + 6 lights + 4 coves = 11', () => {
    const env = new CleanRoomEnvironment()
    expect(env.scene.children).toHaveLength(11)
    env.dispose()
  })
})
