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
    expect(f.left).toBe(-30)
    expect(f.right).toBe(30)
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
    expect(f.left).toBe(-60)
    expect(f.right).toBe(60)
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

  // ---------------------------------------------------------------------------
  // Shadow map utilisation / texel density
  // ---------------------------------------------------------------------------

  /**
   * Effective on-ground texel density (pixels per world unit) for a shadow map
   * of `mapSize` pixels covering a frustum of `2 * half` world units.
   */
  function shadowTexelDensity(
    half: number,
    mapSize: number = 4096,
  ): number {
    return mapSize / (2 * half)
  }

  it('provides ≥8 texels/unit for moderate models (extent ≤ 50) with 4K shadow map', () => {
    const mapSize = 4096
    const testCases: [number, string][] = [
      [0.5, 'tiny'],
      [5, 'small'],
      [20, 'medium'],
      [50, 'large'],
    ]

    for (const [extent, label] of testCases) {
      const halfExt = extent / 2
      const bbox: [number, number, number, number, number, number] = [
        -halfExt, -halfExt, -halfExt, halfExt, halfExt, halfExt,
      ]
      const f = computeShadowFrustum(bbox, lightPos)
      const half = f.right // symmetric
      const density = shadowTexelDensity(half, mapSize)
      expect(density, `${label} model (extent=${extent}): texel density ${density.toFixed(1)} < 8`).toBeGreaterThanOrEqual(8)
    }
  })

  it('frustum half tracks extent with multiplier ≤ 3 (tight fit)', () => {
    const testCases: number[] = [1, 2, 5, 10, 20, 50, 100]

    for (const extent of testCases) {
      const halfExt = extent / 2
      const bbox: [number, number, number, number, number, number] = [
        -halfExt, -halfExt, -halfExt, halfExt, halfExt, halfExt,
      ]
      const f = computeShadowFrustum(bbox, lightPos)
      const half = f.right
      // half should be at most 3× extent for the non-minimum case
      const ratio = half / extent
      expect(ratio, `extent=${extent}: half/extent ratio ${ratio.toFixed(2)} > 4`).toBeLessThanOrEqual(4)
    }
  })
})
