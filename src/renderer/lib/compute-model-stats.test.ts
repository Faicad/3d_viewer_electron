import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { computeModelStats, formatNumber } from './compute-model-stats'

function makeBoxGroup(useIndex: boolean): THREE.Group {
  const group = new THREE.Group()
  const geo = new THREE.BoxGeometry(2, 2, 2)
  if (!useIndex && geo.index) {
    const pos = geo.getAttribute('position')
    const nonIndexed = new THREE.BufferGeometry()
    const idx = geo.index!.array as Uint16Array
    const verts: number[] = []
    for (let i = 0; i < idx.length; i++) {
      verts.push(pos.getX(idx[i]), pos.getY(idx[i]), pos.getZ(idx[i]))
    }
    nonIndexed.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
    nonIndexed.computeVertexNormals()
    const mesh = new THREE.Mesh(nonIndexed)
    group.add(mesh)
  } else {
    const mesh = new THREE.Mesh(geo)
    group.add(mesh)
  }
  group.updateWorldMatrix(true, false)
  return group
}

describe('formatNumber', () => {
  it('preserves small values that Math.round would truncate to 0', () => {
    expect(Number(formatNumber(0.06))).toBeGreaterThan(0)
    expect(Number(formatNumber(0.001))).toBeGreaterThan(0)
    expect(Number(formatNumber(0.1))).toBeGreaterThan(0)
  })

  it('does not show as string "0" for non-zero small values', () => {
    expect(formatNumber(0.06)).not.toBe('0')
    expect(formatNumber(0.001)).not.toBe('0')
    expect(formatNumber(0.1)).not.toBe('0')
  })

  it('rounds large values to integer with locale formatting', () => {
    expect(formatNumber(1234.56)).toBe('1,235')
    expect(formatNumber(100)).toBe('100')
  })

  it('handles zero', () => {
    expect(formatNumber(0)).toBe('0')
  })

  it('handles non-finite values', () => {
    expect(formatNumber(Infinity)).toBe('-')
    expect(formatNumber(NaN)).toBe('-')
  })
})

describe('computeModelStats', () => {
  it('computes non-zero stats for a box mesh with indexed geometry', () => {
    const group = makeBoxGroup(true)
    const stats = computeModelStats(group)
    expect(stats.vertices).toBeGreaterThan(0)
    expect(stats.triangles).toBe(12)
    expect(stats.surfaceArea).toBe(24)
    expect(stats.volume).toBe(8)
    expect(stats.boundingBox.isEmpty()).toBe(false)
    expect(stats.partCount).toBe(1)
  })

  it('computes non-zero stats for a box mesh with non-indexed geometry', () => {
    const group = makeBoxGroup(false)
    const stats = computeModelStats(group)
    expect(stats.vertices).toBeGreaterThan(0)
    expect(stats.triangles).toBe(12)
    expect(stats.surfaceArea).toBe(24)
    expect(stats.volume).toBe(8)
    expect(stats.boundingBox.isEmpty()).toBe(false)
    expect(stats.partCount).toBe(1)
  })

  it('computes non-zero stats when mesh position is set (simulating R3F)', () => {
    const group = new THREE.Group()
    const geo = new THREE.BoxGeometry(2, 2, 2)
    const mesh = new THREE.Mesh(geo)
    mesh.position.set(5, -3, 2)
    group.add(mesh)
    group.updateWorldMatrix(true, false)
    const stats = computeModelStats(group)
    expect(stats.surfaceArea).toBe(24)
    expect(stats.volume).toBe(8)
    expect(stats.boundingBox.isEmpty()).toBe(false)
  })

  it('handles meshes with identity matrixWorld (not yet updated)', () => {
    const group = new THREE.Group()
    const geo = new THREE.BoxGeometry(2, 2, 2)
    const mesh = new THREE.Mesh(geo)
    mesh.position.set(5, -3, 2)
    group.add(mesh)
    const stats = computeModelStats(group)
    expect(stats.surfaceArea).toBe(24)
    expect(stats.volume).toBe(8)
  })

  it('computes non-zero stats for small model like test-box.glb (0.1 unit box)', () => {
    const group = new THREE.Group()
    const geo = new THREE.BoxGeometry(0.1, 0.1, 0.1)
    const mesh = new THREE.Mesh(geo)
    group.add(mesh)
    group.updateWorldMatrix(true, false)
    const stats = computeModelStats(group)
    expect(stats.surfaceArea).toBeGreaterThan(0)
    expect(stats.volume).toBeGreaterThan(0)
    expect(stats.boundingBox.isEmpty()).toBe(false)
    expect(Number(formatNumber(stats.surfaceArea))).toBeGreaterThan(0)
    expect(Number(formatNumber(stats.volume))).toBeGreaterThan(0)
  })

  it('computes non-zero stats for multi-mesh group', () => {
    const group = new THREE.Group()
    for (let i = 0; i < 2; i++) {
      const geo = new THREE.BoxGeometry(2, 2, 2)
      const mesh = new THREE.Mesh(geo)
      mesh.position.set(i * 10, 0, 0)
      group.add(mesh)
    }
    group.updateWorldMatrix(true, false)
    const stats = computeModelStats(group)
    expect(stats.surfaceArea).toBe(48)
    expect(stats.volume).toBe(16)
    expect(stats.partCount).toBe(2)
    expect(stats.boundingBox.isEmpty()).toBe(false)
  })
})
