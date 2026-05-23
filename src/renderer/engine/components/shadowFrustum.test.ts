import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { computeShadowFrustum } from './shadowFrustum'

describe('computeShadowFrustum', () => {
  const lightPos = new THREE.Vector3(3, -3, 8)

  it('returns minimum frustum of ±3 for tiny models', () => {
    const bbox: [number, number, number, number, number, number] = [
      -0.07, -0.07, -0.03, 0.07, 0.07, 0.03,
    ]
    const f = computeShadowFrustum(bbox, lightPos)
    expect(f.left).toBe(-3)
    expect(f.right).toBe(3)
    expect(f.top).toBe(3)
    expect(f.bottom).toBe(-3)
  })

  it('scales frustum for larger models', () => {
    const bbox: [number, number, number, number, number, number] = [
      -5, -5, -5, 5, 5, 5,
    ]
    const f = computeShadowFrustum(bbox, lightPos)
    expect(f.left).toBe(-40)
    expect(f.right).toBe(40)
  })

  it('tightens near/far around the model depth for small models', () => {
    const bbox: [number, number, number, number, number, number] = [
      -0.07, -0.07, -0.03, 0.07, 0.07, 0.03,
    ]
    const f = computeShadowFrustum(bbox, lightPos)

    expect(f.far / f.near).toBeLessThan(50)
    expect(f.near).toBeGreaterThan(1)

    const distToCenter = lightPos.distanceTo(new THREE.Vector3(0, 0, 0))
    expect(f.far).toBeGreaterThan(distToCenter)
  })

  it('keeps near reasonable for models far from light', () => {
    const bbox: [number, number, number, number, number, number] = [
      -1, -1, -51, 1, 1, -49,
    ]
    const f = computeShadowFrustum(bbox, lightPos)
    expect(f.far / f.near).toBeLessThan(50)
    expect(f.near).toBeGreaterThan(0)
  })

  it('handles Y-up bbox correctly', () => {
    const bbox: [number, number, number, number, number, number] = [
      -10, -1, -10, 10, 1, 10,
    ]
    const f = computeShadowFrustum(bbox, lightPos)
    expect(f.left).toBe(-80)
    expect(f.right).toBe(80)
    expect(f.far / f.near).toBeLessThan(50)
  })

  it('far/near ratio < 50 for all model sizes (vs old static 1000)', () => {
    const testCases: [number, number, number, number, number, number][] = [
      [-0.05, -0.05, -0.05, 0.05, 0.05, 0.05],
      [-1, -1, -1, 1, 1, 1],
      [-10, -10, -10, 10, 10, 10],
      [-100, -100, -100, 100, 100, 100],
    ]

    for (const bbox of testCases) {
      const f = computeShadowFrustum(bbox, lightPos)
      expect(f.far / f.near).toBeLessThan(50)
    }
  })
})
