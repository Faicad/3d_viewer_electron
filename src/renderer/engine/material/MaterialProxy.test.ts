import { describe, it, expect, beforeEach } from 'vitest'
import * as THREE from 'three'
import { MaterialProxy } from './MaterialProxy'
import { disposeMaterialProxyRegistry, getMaterialProxyRegistry, MaterialProxyRegistry } from './MaterialProxyRegistry'

// ---------------------------------------------------------------------------
// MaterialProxy
// ---------------------------------------------------------------------------

describe('MaterialProxy', () => {
  let source: THREE.MeshPhysicalMaterial
  let proxy: MaterialProxy

  beforeEach(() => {
    source = new THREE.MeshPhysicalMaterial()
    source.roughness = 0.35
    source.metalness = 0.9
    source.clearcoat = 0.5
    source.color.setRGB(0.8, 0.6, 0.4, THREE.SRGBColorSpace)
    source.opacity = 1.0

    proxy = new MaterialProxy(source, 'test:part1')
  })

  // ---- Basic construction ----

  it('creates a proxy without mutating the source', () => {
    expect(source.roughness).toBe(0.35)
    expect(source.metalness).toBe(0.9)
    expect(source.clearcoat).toBe(0.5)
  })

  it('current is a clone (not the same reference)', () => {
    expect(proxy.current).not.toBe(source)
  })

  it('current inherits source property values', () => {
    expect((proxy.current as THREE.MeshPhysicalMaterial).roughness).toBe(0.35)
    expect((proxy.current as THREE.MeshPhysicalMaterial).metalness).toBe(0.9)
  })

  it('has no overrides initially', () => {
    expect(proxy.hasOverrides).toBe(false)
    expect(Object.keys(proxy.overrides).length).toBe(0)
  })

  // ---- Property read (fallback to source) ----

  it('get returns source value when no override exists', () => {
    expect(proxy.get('roughness')).toBe(0.35)
    expect(proxy.get('metalness')).toBe(0.9)
    expect(proxy.get('clearcoat')).toBe(0.5)
  })

  it('get returns undefined for unset properties', () => {
    // sheen is never set on source
    expect(proxy.get('sheen')).toBeUndefined()
    expect(proxy.get('anisotropy')).toBeUndefined()
  })

  it('get returns color as [r,g,b,a] (linear values from Three.js internals)', () => {
    // NOTE: Three.js converts sRGB→linear internally. color.r returns linear.
    // setRGB(0.8, 0.6, 0.4, SRGB) → linear three-component array + alpha
    const color = proxy.get('color')
    expect(Array.isArray(color)).toBe(true)
    expect(color!.length).toBe(4)
    expect(typeof color![0]).toBe('number')
    expect(typeof color![1]).toBe('number')
    expect(typeof color![2]).toBe('number')
    expect(color![0]).toBeGreaterThan(0)
    expect(color![1]).toBeGreaterThan(0)
    expect(color![2]).toBeGreaterThan(0)
    expect(color![3]).toBe(1.0)
  })

  it('get returns alphaMode from source', () => {
    expect(proxy.get('alphaMode')).toBe('OPAQUE')
  })

  it('get returns doubleSided from source', () => {
    expect(proxy.get('doubleSided')).toBe(false)
  })

  it('get returns unlit from source type', () => {
    expect(proxy.get('unlit')).toBe(false)
  })

  // ---- Property write ----

  it('set updates _current material immediately', () => {
    proxy.set('roughness', 0.15)
    expect((proxy.current as THREE.MeshPhysicalMaterial).roughness).toBe(0.15)
    // Source unchanged
    expect(source.roughness).toBe(0.35)
  })

  it('set stores the override', () => {
    proxy.set('roughness', 0.15)
    expect(proxy.hasOverrides).toBe(true)
    expect(proxy.get('roughness')).toBe(0.15)
  })

  it('set applies color to _current (sRGB→linear conversion)', () => {
    // MaterialAppearance stores sRGB. mat.color.setRGB(sRGB)→linear internally.
    // sRGB 0.2 → linear ≈ 0.0331
    proxy.set('color', [0.2, 0.3, 0.5, 0.8])
    const mat = proxy.current as THREE.MeshPhysicalMaterial
    expect(mat.color.r).toBeCloseTo(0.0331, 2)
    expect(mat.color.g).toBeCloseTo(0.0732, 2)
    expect(mat.color.b).toBeCloseTo(0.214, 2)
    expect(mat.opacity).toBe(0.8)
  })

  it('set applies emissive to _current', () => {
    proxy.set('emissive', [1.0, 0.5, 0.0])
    const mat = proxy.current as THREE.MeshPhysicalMaterial
    expect(mat.emissive.r).toBe(1.0)
    expect(mat.emissive.g).toBe(0.5)
    expect(mat.emissive.b).toBe(0.0)
  })

  it('set applies emissiveIntensity', () => {
    proxy.set('emissiveIntensity', 2.5)
    expect((proxy.current as any).emissiveIntensity).toBe(2.5)
  })

  it('set applies alphaMode BLEND', () => {
    proxy.set('alphaMode', 'BLEND')
    const mat = proxy.current as THREE.MeshPhysicalMaterial
    expect(mat.transparent).toBe(true)
    expect(mat.opacity).toBe(1.0)
    expect(proxy.get('alphaMode')).toBe('BLEND')
  })

  it('set applies alphaMode MASK', () => {
    proxy.set('alphaMode', 'MASK')
    proxy.set('alphaCutoff', 0.75)
    const mat = proxy.current as THREE.MeshPhysicalMaterial
    expect(mat.alphaTest).toBe(0.75)
  })

  it('set applies doubleSided', () => {
    proxy.set('doubleSided', true)
    expect(proxy.current.side).toBe(THREE.DoubleSide)
    proxy.set('doubleSided', false)
    expect(proxy.current.side).toBe(THREE.FrontSide)
  })

  it('set applies scalar properties via property-map', () => {
    proxy.set('normalScale', 3.0)
    expect((proxy.current as THREE.MeshPhysicalMaterial).normalScale.x).toBe(3.0)
    expect((proxy.current as THREE.MeshPhysicalMaterial).normalScale.y).toBe(3.0)
  })

  it('set applies aoMapIntensity', () => {
    proxy.set('aoMapIntensity', 1.5)
    expect((proxy.current as THREE.MeshPhysicalMaterial).aoMapIntensity).toBe(1.5)
  })

  it('set applies specularIntensity and specularColor', () => {
    proxy.set('specularIntensity', 0.8)
    proxy.set('specularColor', [0.2, 0.3, 0.4])
    const mat = proxy.current as THREE.MeshPhysicalMaterial
    expect(mat.specularIntensity).toBe(0.8)
    expect(mat.specularColor.r).toBe(0.2)
    expect(mat.specularColor.g).toBe(0.3)
    expect(mat.specularColor.b).toBe(0.4)
  })

  it('set applies attenuationColor and attenuationDistance', () => {
    proxy.set('attenuationColor', [0.1, 0.2, 0.3])
    proxy.set('attenuationDistance', 3.0)
    const mat = proxy.current as THREE.MeshPhysicalMaterial
    expect(mat.attenuationColor.r).toBe(0.1)
    expect(mat.attenuationColor.g).toBe(0.2)
    expect(mat.attenuationColor.b).toBe(0.3)
    expect(mat.attenuationDistance).toBe(3.0)
  })

  it('set applies anisotropy and anisotropyRotation', () => {
    proxy.set('anisotropy', 0.6)
    proxy.set('anisotropyRotation', Math.PI / 3)
    const mat = proxy.current as THREE.MeshPhysicalMaterial
    expect(mat.anisotropy).toBe(0.6)
    expect(mat.anisotropyRotation).toBeCloseTo(Math.PI / 3)
  })

  it('set does not throw for any mapped property', () => {
    // Verify all scalar properties in the mapping can be set without errors
    for (const prop of ['roughness', 'metalness', 'normalScale', 'aoMapIntensity',
      'transmission', 'thickness', 'ior', 'attenuationDistance',
      'clearcoat', 'clearcoatRoughness', 'sheen', 'sheenRoughness',
      'anisotropy', 'anisotropyRotation', 'specularIntensity',
      'emissiveIntensity', 'alphaCutoff'] as const) {
      expect(() => proxy.set(prop, 0.5 as any)).not.toThrow()
    }
  })

  // ---- applyBatch ----

  it('applyBatch applies multiple properties at once', () => {
    proxy.applyBatch({
      roughness: 0.2,
      metalness: 0.5,
      clearcoat: 0.3,
      ior: 1.6,
    })

    const mat = proxy.current as THREE.MeshPhysicalMaterial
    expect(mat.roughness).toBe(0.2)
    expect(mat.metalness).toBe(0.5)
    expect(mat.clearcoat).toBe(0.3)
    expect(mat.ior).toBe(1.6)
    expect(proxy.hasOverrides).toBe(true)
  })

  it('applyBatch ignores undefined/null values', () => {
    const before = (proxy.current as THREE.MeshPhysicalMaterial).roughness
    proxy.applyBatch({ roughness: undefined, metalness: null })
    expect((proxy.current as THREE.MeshPhysicalMaterial).roughness).toBe(before)
  })

  // ---- Reset ----

  it('reset single property restores source value', () => {
    proxy.set('roughness', 0.1)
    expect((proxy.current as THREE.MeshPhysicalMaterial).roughness).toBe(0.1)

    proxy.reset('roughness')
    expect((proxy.current as THREE.MeshPhysicalMaterial).roughness).toBe(0.35)
    expect(proxy.get('roughness')).toBe(0.35)
    expect(proxy.hasOverrides).toBe(false)
  })

  it('reset all clears all overrides and re-clones source', () => {
    proxy.set('roughness', 0.1)
    proxy.set('metalness', 0.2)
    proxy.set('clearcoat', 0.9)

    proxy.reset()

    const mat = proxy.current as THREE.MeshPhysicalMaterial
    expect(mat.roughness).toBe(0.35)
    expect(mat.metalness).toBe(0.9)
    expect(mat.clearcoat).toBe(0.5)
    expect(proxy.hasOverrides).toBe(false)
  })

  it('reset restores doubleSided to source value', () => {
    source.side = THREE.DoubleSide
    const proxy2 = new MaterialProxy(source, 'test:ds')
    proxy2.set('doubleSided', false) // override to single-sided
    expect(proxy2.current.side).toBe(THREE.FrontSide)

    proxy2.reset('doubleSided')
    expect(proxy2.current.side).toBe(THREE.DoubleSide)
  })

  // ---- Unlit ----

  it('get unlit returns true for MeshBasicMaterial source', () => {
    const basic = new THREE.MeshBasicMaterial()
    const p = new MaterialProxy(basic, 'test:unlit')
    expect(p.get('unlit')).toBe(true)
  })

  it('unlit toggle converts MeshPhysicalMaterial → MeshBasicMaterial', () => {
    proxy.set('unlit', true)
    expect(proxy.current).toBeInstanceOf(THREE.MeshBasicMaterial)
    // Color preserved (linear value from Three.js internals)
    expect((proxy.current as THREE.MeshBasicMaterial).color.r).toBeCloseTo(0.604, 1)
    expect(proxy.get('unlit')).toBe(true)
  })

  it('unlit toggle back converts MeshBasicMaterial → MeshPhysicalMaterial', () => {
    proxy.set('unlit', true)
    expect(proxy.current).toBeInstanceOf(THREE.MeshBasicMaterial)

    proxy.set('unlit', false)
    expect(proxy.current).toBeInstanceOf(THREE.MeshPhysicalMaterial)
    // roughness restored from _source (not from Basic material which has none)
    expect((proxy.current as THREE.MeshPhysicalMaterial).roughness).toBe(0.35)
    expect(proxy.get('unlit')).toBe(false)
  })

  it('reset unlit restores original material type', () => {
    proxy.set('unlit', true)
    proxy.reset('unlit')
    expect(proxy.current).toBeInstanceOf(THREE.MeshPhysicalMaterial)
    expect(proxy.get('unlit')).toBe(false)
  })

  // ---- toAppearance ----

  it('toAppearance produces a complete MaterialAppearance snapshot', () => {
    proxy.set('roughness', 0.15)
    proxy.set('clearcoat', 0.8)

    const appearance = proxy.toAppearance('test-material')

    expect(appearance.name).toBe('test-material')
    expect(appearance.roughness).toBe(0.15)
    expect(appearance.clearcoat).toBe(0.8)
    expect(appearance.metalness).toBe(0.9) // from source
    // Color should be present (from source)
    expect(appearance.color).toBeDefined()
    expect(appearance.color!.length).toBe(4)
  })

  it('toAppearance includes alphaMode', () => {
    const appearance = proxy.toAppearance('test')
    expect(appearance.alphaMode).toBe('OPAQUE')
  })

  it('toAppearance includes doubleSided', () => {
    const appearance = proxy.toAppearance('test')
    expect(appearance.doubleSided).toBe(false)
  })

  // ---- Properties NOT in SCALAR_PROPS still work via proxy ----

  it('handles all currently-missing properties from the analysis doc', () => {
    // These were the 8 properties identified as missing in the roundtrip analysis.
    // MaterialProxy's fallback-to-source design means they are ALL automatically
    // preserved without any code changes.

    const src = new THREE.MeshPhysicalMaterial()
    src.normalScale.set(3, 3)
    src.aoMapIntensity = 1.2
    src.attenuationColor = new THREE.Color(0.1, 0.2, 0.3)
    src.attenuationDistance = 4.0
    src.specularIntensity = 0.7
    src.specularColor = new THREE.Color(0.5, 0.6, 0.7)

    const p = new MaterialProxy(src, 'test:all')

    // All properties fall through to source automatically
    expect(p.get('normalScale')).toBe(3)
    expect(p.get('aoMapIntensity')).toBe(1.2)
    expect(Array.isArray(p.get('attenuationColor'))).toBe(true)
    expect(p.get('attenuationColor')![0]).toBe(0.1)
    expect(p.get('attenuationDistance')).toBe(4.0)
    expect(p.get('specularIntensity')).toBe(0.7)
    expect(Array.isArray(p.get('specularColor'))).toBe(true)
    expect(p.get('specularColor')![0]).toBe(0.5)

    // None of these are in overrides — they fall through
    expect(p.hasOverrides).toBe(false)
  })

  // ---- dispose ----

  it('dispose releases _current material', () => {
    proxy.dispose()
    // After dispose, accessing properties may throw or be undefined
    // depending on Three.js version. Just verify no crash.
    expect(() => proxy.dispose()).not.toThrow() // double-dispose safe
  })
})

// ---------------------------------------------------------------------------
// MaterialProxyRegistry
// ---------------------------------------------------------------------------

describe('MaterialProxyRegistry', () => {
  let registry: MaterialProxyRegistry

  beforeEach(() => {
    disposeMaterialProxyRegistry()
    registry = getMaterialProxyRegistry()
  })

  it('returns same singleton instance', () => {
    const a = getMaterialProxyRegistry()
    const b = getMaterialProxyRegistry()
    expect(a).toBe(b)
  })

  it('register creates a new proxy', () => {
    const mat = new THREE.MeshPhysicalMaterial()
    const proxy = registry.register('file1:part1', mat)
    expect(proxy).toBeInstanceOf(MaterialProxy)
    expect(registry.size).toBe(1)
    expect(registry.has('file1:part1')).toBe(true)
  })

  it('register replaces existing proxy for same key', () => {
    const mat1 = new THREE.MeshPhysicalMaterial({ roughness: 0.5 })
    const p1 = registry.register('key', mat1)

    const mat2 = new THREE.MeshPhysicalMaterial({ roughness: 0.8 })
    const p2 = registry.register('key', mat2)

    expect(p2).not.toBe(p1)
    expect(registry.size).toBe(1)
    expect(p2.get('roughness')).toBe(0.8)
  })

  it('get returns undefined for unknown key', () => {
    expect(registry.get('nonexistent')).toBeUndefined()
  })

  it('unregisterFile removes all proxies for a file', () => {
    registry.register('fileA:part1', new THREE.MeshPhysicalMaterial())
    registry.register('fileA:part2', new THREE.MeshPhysicalMaterial())
    registry.register('fileB:part1', new THREE.MeshPhysicalMaterial())

    expect(registry.size).toBe(3)

    registry.unregisterFile('fileA')
    expect(registry.size).toBe(1)
    expect(registry.has('fileA:part1')).toBe(false)
    expect(registry.has('fileA:part2')).toBe(false)
    expect(registry.has('fileB:part1')).toBe(true)
  })

  it('applyStoreOverrides calls proxy.applyBatch', () => {
    const mat = new THREE.MeshPhysicalMaterial({ roughness: 0.5 })
    registry.register('key', mat)

    registry.applyStoreOverrides('key', { roughness: 0.2, metalness: 0.8 })

    const proxy = registry.get('key')!
    expect(proxy.get('roughness')).toBe(0.2)
    expect(proxy.get('metalness')).toBe(0.8)
    expect(proxy.hasOverrides).toBe(true)
  })

  it('applyStoreOverrides is no-op for unknown key', () => {
    expect(() =>
      registry.applyStoreOverrides('unknown', { roughness: 0.5 }),
    ).not.toThrow()
  })

  it('resetOverrides clears proxy overrides', () => {
    const mat = new THREE.MeshPhysicalMaterial({ roughness: 0.5 })
    registry.register('key', mat)
    registry.applyStoreOverrides('key', { roughness: 0.2 })

    registry.resetOverrides('key')
    const proxy = registry.get('key')!
    expect(proxy.get('roughness')).toBe(0.5)
    expect(proxy.hasOverrides).toBe(false)
  })

  it('disposeAll clears all proxies', () => {
    registry.register('a', new THREE.MeshPhysicalMaterial())
    registry.register('b', new THREE.MeshPhysicalMaterial())
    registry.disposeAll()
    expect(registry.size).toBe(0)
  })
})
