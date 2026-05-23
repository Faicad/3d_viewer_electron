import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { CleanRoomEnvironment } from './CleanRoomEnvironment'

describe('CleanRoomEnvironment', () => {
  it('is a THREE.Scene', () => {
    const env = new CleanRoomEnvironment()
    expect(env).toBeInstanceOf(THREE.Scene)
    env.dispose()
  })

  it('scene position.y is 0 and rotation.y is 0°', () => {
    const env = new CleanRoomEnvironment()
    expect(env.position.y).toBeCloseTo(0, 1)
    expect(env.rotation.y).toBeCloseTo(0, 4)
    env.dispose()
  })

  it('contains one PointLight', () => {
    const env = new CleanRoomEnvironment()
    const lights = env.children.filter((c) => c instanceof THREE.PointLight)
    expect(lights).toHaveLength(1)
    const light = lights[0] as THREE.PointLight
    expect(light.intensity).toBe(900)
    env.dispose()
  })

  it('contains one room BoxGeometry with BackSide material', () => {
    const env = new CleanRoomEnvironment()
    // The room mesh is the first Mesh that's not an area light (largest scale)
    const meshes = env.children.filter(
      (c) => c instanceof THREE.Mesh,
    ) as THREE.Mesh[]
    // Room is the largest mesh
    const room = meshes.reduce((a, b) =>
      a.scale.x * a.scale.y * a.scale.z > b.scale.x * b.scale.y * b.scale.z ? a : b,
    )
    expect(room.geometry).toBeInstanceOf(THREE.BoxGeometry)

    const mat = room.material as THREE.MeshStandardMaterial
    expect(mat.side).toBe(THREE.BackSide)
    env.dispose()
  })

  it('contains 6 area lights with MeshLambertMaterial', () => {
    const env = new CleanRoomEnvironment()
    const areaLights = env.children.filter(
      (c) => c instanceof THREE.Mesh && (c.material as THREE.Material).type === 'MeshLambertMaterial',
    )
    expect(areaLights).toHaveLength(6)

    for (const light of areaLights) {
      const mesh = light as THREE.Mesh
      expect(mesh.geometry).toBeInstanceOf(THREE.BoxGeometry)

      const mat = mesh.material as THREE.MeshLambertMaterial
      expect(mat.emissive).toBeInstanceOf(THREE.Color)
      expect(mat.emissiveIntensity).toBeGreaterThan(0)
    }
    env.dispose()
  })

  it('contains one infinity cove on the -z wall', () => {
    const env = new CleanRoomEnvironment()
    // Cove is the mesh with BufferGeometry (not BoxGeometry)
    const meshes = env.children.filter(
      (c) => c instanceof THREE.Mesh,
    ) as THREE.Mesh[]
    const coves = meshes.filter(
      (m) => m.geometry instanceof THREE.BufferGeometry && !(m.geometry instanceof THREE.BoxGeometry),
    )
    expect(coves).toHaveLength(1)

    const cove = coves[0]
    // Cove should be positioned at the -z wall
    expect(cove.position.z).toBeLessThan(0)
    env.dispose()
  })

  it('total child count is 1 PointLight + 1 room + 1 cove + 6 area lights = 9', () => {
    const env = new CleanRoomEnvironment()
    expect(env.children).toHaveLength(9)
    env.dispose()
  })

  it('dispose cleans up geometries and materials', () => {
    const env = new CleanRoomEnvironment()
    // Should not throw
    expect(() => env.dispose()).not.toThrow()
  })
})
