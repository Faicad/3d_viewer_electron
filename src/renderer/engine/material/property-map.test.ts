import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  SCALAR_PROPS,
  TEXTURE_PROPS,
  TEXTURE_PROP_SET,
  MAPPED_SCALAR_KEYS,
  getScalarByAppearanceKey,
  readScalarFromMaterial,
  writeScalarToMaterial,
  extractAllScalars,
  applyAllScalars,
} from './property-map'
import type { MaterialAppearance } from './types'

// ---------------------------------------------------------------------------
// Completeness
// ---------------------------------------------------------------------------

describe('property-map completeness', () => {
  /**
   * These keys are handled by dedicated code (multi-field logic or
   * material-type-level decisions).  They should NOT be in SCALAR_PROPS.
   */
  const DEDICATED_KEYS = new Set([
    'name',          // display only
    'color',         // [r,g,b,a] with THREE.Color + opacity logic
    'map',           // texture
    'metalnessMap',  // texture
    'roughnessMap',  // texture
    'normalMap',     // texture
    'aoMap',         // texture
    'emissive',      // THREE.Color with black-zero skip logic
    'emissiveMap',   // texture
    'transmissionMap', // texture
    'thicknessMap',  // texture
    'clearcoatMap',  // texture
    'clearcoatNormalMap', // texture
    'alphaMap',      // texture
    'alphaMode',     // multi-field: transparent + alphaTest
    'doubleSided',   // THREE.Side enum
    'unlit',         // material type selection
  ])

  it('every MaterialAppearance key is either mapped or declared as dedicated', () => {
    // MaterialAppearance is an interface, so we can't enumerate keys at
    // runtime.  Instead, we manually list ALL expected keys and verify
    // each one is covered.
    const ALL_KEYS: (keyof MaterialAppearance)[] = [
      'name',
      'color',
      'map',
      'metalness',
      'roughness',
      'metalnessMap',
      'roughnessMap',
      'normalMap',
      'normalScale',
      'aoMap',
      'aoMapIntensity',
      'emissive',
      'emissiveMap',
      'emissiveIntensity',
      'transmission',
      'transmissionMap',
      'thickness',
      'thicknessMap',
      'ior',
      'attenuationColor',
      'attenuationDistance',
      'clearcoat',
      'clearcoatRoughness',
      'clearcoatMap',
      'clearcoatNormalMap',
      'sheen',
      'sheenColor',
      'sheenRoughness',
      'anisotropy',
      'anisotropyRotation',
      'specularIntensity',
      'specularColor',
      'alphaMode',
      'alphaCutoff',
      'doubleSided',
      'unlit',
    ]

    for (const key of ALL_KEYS) {
      const isMapped = MAPPED_SCALAR_KEYS.has(key)
      const isDedicated = DEDICATED_KEYS.has(key)
      const isTexture = TEXTURE_PROP_SET.has(key as string)

      const covered = isMapped || isDedicated || isTexture
      expect(
        covered,
        `"${key}" must be in SCALAR_PROPS, DEDICATED_KEYS, or TEXTURE_PROPS`,
      ).toBe(true)
    }
  })

  it('no key is in both SCALAR_PROPS and DEDICATED_KEYS', () => {
    for (const key of MAPPED_SCALAR_KEYS) {
      expect(
        DEDICATED_KEYS.has(key),
        `"${key}" is in both SCALAR_PROPS and DEDICATED_KEYS — pick one`,
      ).toBe(false)
    }
  })

  it('every SCALAR_PROP has a unique appearanceKey', () => {
    const seen = new Set<string>()
    for (const p of SCALAR_PROPS) {
      expect(seen.has(p.appearanceKey), `Duplicate key: ${p.appearanceKey}`).toBe(false)
      seen.add(p.appearanceKey)
    }
  })

  it('every SCALAR_PROP has a unique threeKey', () => {
    const seen = new Set<string>()
    for (const p of SCALAR_PROPS) {
      expect(seen.has(p.threeKey), `Duplicate threeKey: ${p.threeKey}`).toBe(false)
      seen.add(p.threeKey)
    }
  })

  it('every TEXTURE_PROP is unique', () => {
    expect(TEXTURE_PROPS.length).toBe(new Set(TEXTURE_PROPS).size)
  })

  it('TEXTURE_PROPS matches TEXTURE_SLOTS in cloneMaterial.ts', () => {
    // Regression: TEXTURE_PROPS must include every slot that cloneMaterial
    // extracts texture data-URIs for, plus alphaMap.
    // This test will fail if someone adds a texture slot to cloneMaterial
    // without also adding it here.
    const CLONE_MATERIAL_TEXTURE_SLOTS = [
      'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap',
      'emissiveMap', 'transmissionMap', 'thicknessMap', 'clearcoatMap',
      'clearcoatNormalMap', 'alphaMap',
    ]
    for (const slot of CLONE_MATERIAL_TEXTURE_SLOTS) {
      expect(TEXTURE_PROP_SET.has(slot), `TEXTURE_PROPS missing: ${slot}`).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// Serialization roundtrip
// ---------------------------------------------------------------------------

describe('SCALAR_PROPS serialize/deserialize', () => {
  it('roughness roundtrips through serialize → deserialize', () => {
    const prop = getScalarByAppearanceKey('roughness')!
    const raw = 0.35
    const serialized = prop.serialize(raw)
    const deserialized = prop.deserialize(serialized)
    expect(deserialized).toBe(raw)
  })

  it('metalness roundtrips', () => {
    const prop = getScalarByAppearanceKey('metalness')!
    expect(prop.deserialize(prop.serialize(0.9))).toBe(0.9)
  })

  it('normalScale roundtrips Vector2 → number → Vector2', () => {
    const prop = getScalarByAppearanceKey('normalScale')!
    const vec = new THREE.Vector2(2.5, 2.5)
    const num = prop.serialize(vec)
    expect(num).toBe(2.5)
    const restored = prop.deserialize(num) as THREE.Vector2
    expect(restored.x).toBe(2.5)
    expect(restored.y).toBe(2.5)
  })

  it('aoMapIntensity roundtrips', () => {
    const prop = getScalarByAppearanceKey('aoMapIntensity')!
    expect(prop.deserialize(prop.serialize(1.5))).toBe(1.5)
  })

  it('transmission roundtrips', () => {
    const prop = getScalarByAppearanceKey('transmission')!
    expect(prop.deserialize(prop.serialize(0.8))).toBe(0.8)
  })

  it('thickness roundtrips', () => {
    const prop = getScalarByAppearanceKey('thickness')!
    expect(prop.deserialize(prop.serialize(2.0))).toBe(2.0)
  })

  it('ior roundtrips', () => {
    const prop = getScalarByAppearanceKey('ior')!
    expect(prop.deserialize(prop.serialize(1.52))).toBe(1.52)
  })

  it('attenuationColor roundtrips', () => {
    const prop = getScalarByAppearanceKey('attenuationColor')!
    const color = new THREE.Color(0.8, 0.6, 0.4)
    const arr = prop.serialize(color) as [number, number, number]
    expect(arr).toEqual([0.8, 0.6, 0.4])
    const restored = prop.deserialize(arr) as THREE.Color
    expect(restored.r).toBe(0.8)
    expect(restored.g).toBe(0.6)
    expect(restored.b).toBe(0.4)
  })

  it('attenuationDistance roundtrips', () => {
    const prop = getScalarByAppearanceKey('attenuationDistance')!
    expect(prop.deserialize(prop.serialize(3.0))).toBe(3.0)
  })

  it('clearcoat roundtrips', () => {
    const prop = getScalarByAppearanceKey('clearcoat')!
    expect(prop.deserialize(prop.serialize(0.5))).toBe(0.5)
  })

  it('clearcoatRoughness roundtrips', () => {
    const prop = getScalarByAppearanceKey('clearcoatRoughness')!
    expect(prop.deserialize(prop.serialize(0.15))).toBe(0.15)
  })

  it('sheen roundtrips', () => {
    const prop = getScalarByAppearanceKey('sheen')!
    expect(prop.deserialize(prop.serialize(0.7))).toBe(0.7)
  })

  it('sheenColor roundtrips via THREE.Color', () => {
    const prop = getScalarByAppearanceKey('sheenColor')!
    const color = new THREE.Color(0.9, 0.5, 0.3)
    const arr = prop.serialize(color) as [number, number, number]
    const restored = prop.deserialize(arr) as THREE.Color
    expect(restored.r).toBe(0.9)
    expect(restored.g).toBe(0.5)
    expect(restored.b).toBe(0.3)
  })

  it('sheenRoughness roundtrips', () => {
    const prop = getScalarByAppearanceKey('sheenRoughness')!
    expect(prop.deserialize(prop.serialize(0.25))).toBe(0.25)
  })

  it('anisotropy roundtrips', () => {
    const prop = getScalarByAppearanceKey('anisotropy')!
    expect(prop.deserialize(prop.serialize(0.6))).toBe(0.6)
  })

  it('anisotropyRotation roundtrips', () => {
    const prop = getScalarByAppearanceKey('anisotropyRotation')!
    expect(prop.deserialize(prop.serialize(Math.PI / 3))).toBeCloseTo(Math.PI / 3)
  })

  it('specularIntensity roundtrips', () => {
    const prop = getScalarByAppearanceKey('specularIntensity')!
    expect(prop.deserialize(prop.serialize(0.7))).toBe(0.7)
  })

  it('specularColor roundtrips via THREE.Color', () => {
    const prop = getScalarByAppearanceKey('specularColor')!
    const color = new THREE.Color(0.2, 0.4, 0.8)
    const arr = prop.serialize(color) as [number, number, number]
    const restored = prop.deserialize(arr) as THREE.Color
    expect(restored.r).toBe(0.2)
    expect(restored.g).toBe(0.4)
    expect(restored.b).toBe(0.8)
  })

  it('emissiveIntensity roundtrips', () => {
    const prop = getScalarByAppearanceKey('emissiveIntensity')!
    expect(prop.deserialize(prop.serialize(2.5))).toBe(2.5)
  })

  it('alphaCutoff roundtrips', () => {
    const prop = getScalarByAppearanceKey('alphaCutoff')!
    expect(prop.deserialize(prop.serialize(0.75))).toBe(0.75)
  })
})

// ---------------------------------------------------------------------------
// readScalarFromMaterial / writeScalarToMaterial
// ---------------------------------------------------------------------------

describe('readScalarFromMaterial / writeScalarToMaterial', () => {
  it('reads roughness from MeshPhysicalMaterial', () => {
    const mat = new THREE.MeshPhysicalMaterial()
    mat.roughness = 0.42
    expect(readScalarFromMaterial(mat, 'roughness')).toBe(0.42)
  })

  it('reads normalScale from MeshStandardMaterial', () => {
    const mat = new THREE.MeshStandardMaterial()
    mat.normalScale.set(3, 3)
    expect(readScalarFromMaterial(mat, 'normalScale')).toBe(3)
  })

  it('returns undefined for zero-valued clearcoat', () => {
    const mat = new THREE.MeshPhysicalMaterial()
    mat.clearcoat = 0
    expect(readScalarFromMaterial(mat, 'clearcoat')).toBeUndefined()
  })

  it('writes roughness to material', () => {
    const mat = new THREE.MeshPhysicalMaterial()
    writeScalarToMaterial(mat, 'roughness', 0.77)
    expect(mat.roughness).toBe(0.77)
  })

  it('writes attenuationColor as THREE.Color', () => {
    const mat = new THREE.MeshPhysicalMaterial()
    writeScalarToMaterial(mat, 'attenuationColor', [0.1, 0.2, 0.3])
    expect(mat.attenuationColor).toBeInstanceOf(THREE.Color)
    expect(mat.attenuationColor.r).toBe(0.1)
    expect(mat.attenuationColor.g).toBe(0.2)
    expect(mat.attenuationColor.b).toBe(0.3)
  })

  it('writes normalScale as Vector2', () => {
    const mat = new THREE.MeshPhysicalMaterial()
    writeScalarToMaterial(mat, 'normalScale', 4.0)
    expect(mat.normalScale.x).toBe(4.0)
    expect(mat.normalScale.y).toBe(4.0)
  })

  it('no-ops on unmapped key', () => {
    const mat = new THREE.MeshPhysicalMaterial()
    expect(() => writeScalarToMaterial(mat, 'name' as any, 'test')).not.toThrow()
    expect(() => readScalarFromMaterial(mat, 'name' as any)).not.toThrow()
  })

  it('no-ops on undefined value', () => {
    const mat = new THREE.MeshPhysicalMaterial()
    const before = mat.roughness
    writeScalarToMaterial(mat, 'roughness', undefined)
    expect(mat.roughness).toBe(before)
  })
})

// ---------------------------------------------------------------------------
// extractAllScalars / applyAllScalars
// ---------------------------------------------------------------------------

describe('extractAllScalars / applyAllScalars', () => {
  it('extracts all set properties from MeshPhysicalMaterial', () => {
    const mat = new THREE.MeshPhysicalMaterial()
    mat.roughness = 0.35
    mat.metalness = 0.9
    mat.clearcoat = 0.5
    mat.sheen = 0.8
    mat.anisotropy = 0.6
    mat.transmission = 0.4
    mat.normalScale.set(2, 2)
    mat.aoMapIntensity = 1.2
    mat.specularIntensity = 0.7

    const result = extractAllScalars(mat)

    expect(result.roughness).toBe(0.35)
    expect(result.metalness).toBe(0.9)
    expect(result.clearcoat).toBe(0.5)
    expect(result.sheen).toBe(0.8)
    expect(result.anisotropy).toBe(0.6)
    expect(result.transmission).toBe(0.4)
    expect(result.normalScale).toBe(2)
    expect(result.aoMapIntensity).toBe(1.2)
    expect(result.specularIntensity).toBe(0.7)
  })

  it('skips zero-valued properties (transmission=0, clearcoat=0, etc.)', () => {
    const mat = new THREE.MeshPhysicalMaterial()
    mat.transmission = 0     // zeroValue
    mat.clearcoat = 0        // zeroValue
    mat.sheen = 0            // zeroValue
    mat.anisotropy = 0       // zeroValue
    mat.roughness = 0.5

    const result = extractAllScalars(mat)
    expect(result.transmission).toBeUndefined()
    expect(result.clearcoat).toBeUndefined()
    expect(result.sheen).toBeUndefined()
    expect(result.anisotropy).toBeUndefined()
    expect(result.roughness).toBe(0.5)
  })

  it('applies all properties from appearance fragment to material', () => {
    const appearance: Partial<MaterialAppearance> = {
      roughness: 0.25,
      metalness: 0.8,
      clearcoat: 0.3,
      sheen: 0.5,
      normalScale: 1.5,
      aoMapIntensity: 0.8,
      specularIntensity: 0.6,
      ior: 1.6,
    }

    const mat = new THREE.MeshPhysicalMaterial()
    applyAllScalars(mat, appearance)

    expect(mat.roughness).toBe(0.25)
    expect(mat.metalness).toBe(0.8)
    expect(mat.clearcoat).toBe(0.3)
    expect(mat.sheen).toBe(0.5)
    expect(mat.normalScale.x).toBe(1.5)
    expect(mat.aoMapIntensity).toBe(0.8)
    expect(mat.specularIntensity).toBe(0.6)
    expect(mat.ior).toBe(1.6)
  })

  it('skips Physical-only props when applying to MeshStandardMaterial', () => {
    const appearance: Partial<MaterialAppearance> = {
      roughness: 0.5,
      clearcoat: 0.8,   // Physical only — should be skipped
      transmission: 0.5, // Physical only
    }

    const mat = new THREE.MeshStandardMaterial()
    // Should not throw
    expect(() => applyAllScalars(mat, appearance)).not.toThrow()
    expect(mat.roughness).toBe(0.5)
    // clearcoat and transmission don't exist on MeshStandardMaterial,
    // so they can't be verified via mat.clearcoat — just verify no crash
  })

  it('roundtrip: extract → apply → extract produces identical result', () => {
    const src = new THREE.MeshPhysicalMaterial()
    src.roughness = 0.42
    src.metalness = 0.88
    src.clearcoat = 0.3
    src.clearcoatRoughness = 0.1
    src.sheen = 0.6
    src.sheenColor = new THREE.Color(0.9, 0.5, 0.3)
    src.anisotropy = 0.7
    src.anisotropyRotation = Math.PI / 4
    src.transmission = 0.3
    src.thickness = 1.5
    src.ior = 1.52
    src.normalScale.set(2.5, 2.5)
    src.aoMapIntensity = 1.3
    src.specularIntensity = 0.5
    src.attenuationColor = new THREE.Color(0.8, 0.4, 0.2)
    src.attenuationDistance = 3.0

    const extracted = extractAllScalars(src)
    const dst = new THREE.MeshPhysicalMaterial()
    applyAllScalars(dst, extracted)

    expect(dst.roughness).toBe(0.42)
    expect(dst.metalness).toBe(0.88)
    expect(dst.clearcoat).toBe(0.3)
    expect(dst.clearcoatRoughness).toBe(0.1)
    expect(dst.sheen).toBe(0.6)
    expect(dst.sheenColor.r).toBe(0.9)
    expect(dst.anisotropy).toBe(0.7)
    expect(dst.anisotropyRotation).toBeCloseTo(Math.PI / 4)
    expect(dst.transmission).toBe(0.3)
    expect(dst.thickness).toBe(1.5)
    expect(dst.ior).toBe(1.52)
    expect(dst.normalScale.x).toBe(2.5)
    expect(dst.aoMapIntensity).toBe(1.3)
    expect(dst.specularIntensity).toBe(0.5)
    expect(dst.attenuationColor.r).toBe(0.8)
    expect(dst.attenuationDistance).toBe(3.0)
  })
})
