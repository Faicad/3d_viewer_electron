import { describe, it, expect, beforeEach } from 'vitest'
import * as THREE from 'three'
import { resolveMaterial, resetDefaultFactory } from './materialResolver'
import { MaterialFactory } from './MaterialFactory'
import { MATERIAL_PRESETS } from './presets'
import type { MaterialAppearance } from './types'

describe('resolveMaterial', () => {
  beforeEach(() => {
    resetDefaultFactory()
  })

  // ---------------------------------------------------------------------------
  // builtin: prefix
  // ---------------------------------------------------------------------------

  it('resolves "builtin:chrome" to chrome preset material', () => {
    const mat = resolveMaterial('builtin:chrome')
    expect(mat).toBeInstanceOf(THREE.MeshPhysicalMaterial)
    expect(mat.metalness).toBe(1.0)
    expect(mat.roughness).toBe(0.02)
  })

  it('resolves "builtin:gold" to gold preset material', () => {
    const mat = resolveMaterial('builtin:gold')
    expect(mat).toBeInstanceOf(THREE.MeshPhysicalMaterial)
    expect(mat.metalness).toBe(1.0)
  })

  it('falls back to concrete for unknown builtin id', () => {
    const mat = resolveMaterial('builtin:nonexistent')
    expect(mat).toBeInstanceOf(THREE.MeshPhysicalMaterial)
    expect(mat.roughness).toBe(0.92)
    expect(mat.metalness).toBe(0.0)
  })

  // ---------------------------------------------------------------------------
  // Plain string — preset key lookup
  // ---------------------------------------------------------------------------

  it('resolves preset key without builtin prefix', () => {
    const mat = resolveMaterial('chrome')
    expect(mat.metalness).toBe(1.0)
    expect(mat.roughness).toBe(0.02)
  })

  it('falls back to concrete for unknown string', () => {
    const mat = resolveMaterial('some-random-material')
    expect(mat.roughness).toBe(0.92)
  })

  // ---------------------------------------------------------------------------
  // Hex colour string
  // ---------------------------------------------------------------------------

  it('resolves hex colour string', () => {
    const mat = resolveMaterial('#ff0000')
    expect(mat.color.r).toBe(1.0)
    expect(mat.color.g).toBe(0.0)
    expect(mat.color.b).toBe(0.0)
    expect(mat.roughness).toBe(0.5)
    expect(mat.metalness).toBe(0.0)
  })

  // ---------------------------------------------------------------------------
  // RGB array
  // ---------------------------------------------------------------------------

  it('resolves [r, g, b] tuple to coloured material', () => {
    const mat = resolveMaterial([0.2, 0.6, 0.9])
    // sRGB → linear: 0.2→~0.033, 0.6→~0.319, 0.9→~0.787
    expect(mat.color.r).toBeCloseTo(0.033, 2)
    expect(mat.color.g).toBeCloseTo(0.319, 2)
    expect(mat.color.b).toBeCloseTo(0.787, 2)
    expect(mat.roughness).toBe(0.5)
    expect(mat.metalness).toBe(0.0)
  })

  // ---------------------------------------------------------------------------
  // MaterialAppearance object
  // ---------------------------------------------------------------------------

  it('resolves MaterialAppearance directly', () => {
    const appearance: MaterialAppearance = {
      name: 'custom',
      color: [0.1, 0.2, 0.3],
      metalness: 0.7,
      roughness: 0.3,
      clearcoat: 0.5,
    }
    const mat = resolveMaterial(appearance)
    expect(mat.metalness).toBe(0.7)
    expect(mat.roughness).toBe(0.3)
    expect(mat.clearcoat).toBe(0.5)
  })

  // ---------------------------------------------------------------------------
  // Explicit factory
  // ---------------------------------------------------------------------------

  it('uses provided factory instance', () => {
    const factory = new MaterialFactory()
    const a = resolveMaterial('chrome', factory)
    const b = resolveMaterial('chrome', factory)
    expect(a).toBe(b) // same factory, same cache key
    factory.dispose()
  })

  // ---------------------------------------------------------------------------
  // Default factory isolation
  // ---------------------------------------------------------------------------

  it('returns same material from default factory for same descriptor', () => {
    const a = resolveMaterial('builtin:chrome')
    const b = resolveMaterial('builtin:chrome')
    expect(a).toBe(b)
  })

  it('resetDefaultFactory clears default factory cache', () => {
    const a = resolveMaterial('builtin:chrome')
    resetDefaultFactory()
    const b = resolveMaterial('builtin:chrome')
    expect(a).not.toBe(b)
  })

  // ---------------------------------------------------------------------------
  // All 29 presets via builtin: prefix
  // ---------------------------------------------------------------------------

  it('resolves all 29 presets via builtin: prefix', () => {
    const presetIds = Object.keys(MATERIAL_PRESETS)
    expect(presetIds).toHaveLength(29)

    for (const id of presetIds) {
      const mat = resolveMaterial(`builtin:${id}`)
      expect(mat).toBeInstanceOf(THREE.MeshPhysicalMaterial)
      // Verify material was created with the preset's properties
      const preset = MATERIAL_PRESETS[id]
      expect(mat.roughness).toBe(preset.roughness)
      expect(mat.metalness).toBe(preset.metalness)
    }
  })
})
