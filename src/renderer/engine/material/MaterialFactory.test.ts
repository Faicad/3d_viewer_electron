import { describe, it, expect, beforeEach } from 'vitest'
import * as THREE from 'three'
import { MaterialFactory } from './MaterialFactory'
import type { MaterialAppearance } from './types'
import { MATERIAL_PRESETS } from './presets'

describe('MaterialFactory', () => {
  let factory: MaterialFactory

  beforeEach(() => {
    factory = new MaterialFactory()
  })

  // -----------------------------------------------------------------------
  // Basic creation
  // -----------------------------------------------------------------------

  it('creates a MeshPhysicalMaterial', () => {
    const mat = factory.createMaterial(MATERIAL_PRESETS.chrome)
    expect(mat).toBeInstanceOf(THREE.MeshPhysicalMaterial)
  })

  it('applies metalness and roughness from appearance', () => {
    const mat = factory.createMaterial(MATERIAL_PRESETS.chrome)
    expect(mat.metalness).toBe(1.0)
    expect(mat.roughness).toBeLessThan(0.1)
  })

  it('sets color with sRGB color space', () => {
    const appearance: MaterialAppearance = {
      name: 'test',
      color: [1.0, 0.0, 0.0],
      metalness: 0.5,
      roughness: 0.5,
    }
    const mat = factory.createMaterial(appearance)
    expect(mat.color.r).toBe(1.0)
    expect(mat.color.g).toBe(0.0)
    expect(mat.color.b).toBe(0.0)
  })

  it('applies polygonOffset for CAD face overlap prevention', () => {
    const mat = factory.createMaterial(MATERIAL_PRESETS.glossyPlastic)
    expect(mat.polygonOffset).toBe(true)
    expect(mat.polygonOffsetFactor).toBe(-1)
    expect(mat.polygonOffsetUnits).toBe(-1)
  })

  // -----------------------------------------------------------------------
  // Transmission (glass)
  // -----------------------------------------------------------------------

  it('sets transmission and forces opacity to 1.0', () => {
    const mat = factory.createMaterial(MATERIAL_PRESETS.clearGlass)
    expect(mat.transmission).toBe(1.0)
    expect(mat.opacity).toBe(1.0)
  })

  it('sets ior on transmission materials', () => {
    const mat = factory.createMaterial(MATERIAL_PRESETS.clearGlass)
    expect(mat.ior).toBe(1.5)
  })

  it('sets thickness when specified', () => {
    const mat = factory.createMaterial(MATERIAL_PRESETS.clearGlass)
    expect(mat.thickness).toBe(3.0)
  })

  it('sets attenuationColor and attenuationDistance on tinted glass', () => {
    const mat = factory.createMaterial(MATERIAL_PRESETS.tintedGlass)
    expect(mat.attenuationColor).toBeInstanceOf(THREE.Color)
    expect(mat.attenuationDistance).toBe(2.0)
  })

  // -----------------------------------------------------------------------
  // Clearcoat
  // -----------------------------------------------------------------------

  it('sets clearcoat and clearcoatRoughness on car paint', () => {
    const mat = factory.createMaterial(MATERIAL_PRESETS.carPaint)
    expect(mat.clearcoat).toBe(1.0)
    expect(mat.clearcoatRoughness).toBe(0.08)
  })

  it('skips clearcoat when value is 0 or undefined', () => {
    const mat = factory.createMaterial(MATERIAL_PRESETS.chrome)
    expect(mat.clearcoat).toBe(0)
  })

  // -----------------------------------------------------------------------
  // Sheen
  // -----------------------------------------------------------------------

  it('sets sheen properties when defined', () => {
    const appearance: MaterialAppearance = {
      name: 'velvet',
      color: [0.8, 0.2, 0.2],
      roughness: 0.6,
      metalness: 0.0,
      sheen: 0.8,
      sheenColor: [1.0, 0.9, 0.8],
      sheenRoughness: 0.3,
    }
    const mat = factory.createMaterial(appearance)
    expect(mat.sheen).toBe(0.8)
    expect(mat.sheenColor).toBeInstanceOf(THREE.Color)
    expect(mat.sheenRoughness).toBe(0.3)
  })

  // -----------------------------------------------------------------------
  // Anisotropy
  // -----------------------------------------------------------------------

  it('sets anisotropy for brushed metal materials', () => {
    const mat = factory.createMaterial(MATERIAL_PRESETS.brushedAluminum)
    expect(mat.anisotropy).toBeGreaterThan(0)
  })

  it('sets anisotropyRotation when non-zero', () => {
    const appearance: MaterialAppearance = {
      name: 'test',
      metalness: 0.9,
      roughness: 0.3,
      anisotropy: 0.5,
      anisotropyRotation: Math.PI / 4,
    }
    const mat = factory.createMaterial(appearance)
    expect(mat.anisotropyRotation).toBeCloseTo(Math.PI / 4)
  })

  // -----------------------------------------------------------------------
  // Specular workflow
  // -----------------------------------------------------------------------

  it('sets specularIntensity and specularColor when defined', () => {
    const appearance: MaterialAppearance = {
      name: 'test',
      roughness: 0.3,
      metalness: 0.0,
      specularIntensity: 0.8,
      specularColor: [0.2, 0.3, 0.5],
    }
    const mat = factory.createMaterial(appearance)
    expect(mat.specularIntensity).toBe(0.8)
    expect(mat.specularColor).toBeInstanceOf(THREE.Color)
  })

  // -----------------------------------------------------------------------
  // Emissive
  // -----------------------------------------------------------------------

  it('sets emissive color and intensity', () => {
    const appearance: MaterialAppearance = {
      name: 'glow',
      roughness: 0.5,
      metalness: 0.0,
      emissive: [1.0, 0.5, 0.0],
      emissiveIntensity: 2.5,
    }
    const mat = factory.createMaterial(appearance)
    expect(mat.emissive).toBeInstanceOf(THREE.Color)
    expect(mat.emissiveIntensity).toBe(2.5)
  })

  // -----------------------------------------------------------------------
  // Double-sided
  // -----------------------------------------------------------------------

  it('uses FrontSide by default', () => {
    const mat = factory.createMaterial(MATERIAL_PRESETS.chrome)
    expect(mat.side).toBe(THREE.FrontSide)
  })

  it('uses DoubleSide when doubleSided is true', () => {
    const appearance: MaterialAppearance = {
      name: 'doublesided',
      roughness: 0.5,
      metalness: 0.0,
      doubleSided: true,
    }
    const mat = factory.createMaterial(appearance)
    expect(mat.side).toBe(THREE.DoubleSide)
  })

  // -----------------------------------------------------------------------
  // Alpha modes
  // -----------------------------------------------------------------------

  it('BLEND alpha mode sets transparent with opacity', () => {
    const appearance: MaterialAppearance = {
      name: 'blend',
      color: [1.0, 0.5, 0.3, 0.5],
      roughness: 0.5,
      metalness: 0.0,
      alphaMode: 'BLEND',
    }
    const mat = factory.createMaterial(appearance)
    expect(mat.transparent).toBe(true)
    expect(mat.opacity).toBe(0.5)
  })

  it('MASK alpha mode sets alphaTest', () => {
    const appearance: MaterialAppearance = {
      name: 'mask',
      roughness: 0.5,
      metalness: 0.0,
      alphaMode: 'MASK',
      alphaCutoff: 0.75,
    }
    const mat = factory.createMaterial(appearance)
    expect(mat.transparent).toBe(false)
    expect(mat.alphaTest).toBe(0.75)
  })

  // -----------------------------------------------------------------------
  // Normal scale
  // -----------------------------------------------------------------------

  it('sets normalScale when specified', () => {
    const appearance: MaterialAppearance = {
      name: 'bumpy',
      roughness: 0.5,
      metalness: 0.0,
      normalScale: 2.0,
    }
    const mat = factory.createMaterial(appearance)
    expect(mat.normalScale.x).toBe(2.0)
    expect(mat.normalScale.y).toBe(2.0)
  })

  // -----------------------------------------------------------------------
  // Cache
  // -----------------------------------------------------------------------

  it('returns the same material instance for the same appearance', () => {
    const a = MATERIAL_PRESETS.chrome
    const m1 = factory.createMaterial(a)
    const m2 = factory.createMaterial(a)
    expect(m1).toBe(m2)
  })

  it('returns different instances for different appearances', () => {
    const m1 = factory.createMaterial(MATERIAL_PRESETS.chrome)
    const m2 = factory.createMaterial(MATERIAL_PRESETS.gold)
    expect(m1).not.toBe(m2)
  })

  it('accepts an explicit sharingKey', () => {
    const a = MATERIAL_PRESETS.chrome
    const m1 = factory.createMaterial(a, 'my-key')
    const m2 = factory.createMaterial(a, 'my-key')
    expect(m1).toBe(m2)
  })

  // -----------------------------------------------------------------------
  // Dispose
  // -----------------------------------------------------------------------

  it('dispose clears the cache', () => {
    const m1 = factory.createMaterial(MATERIAL_PRESETS.chrome)
    factory.dispose()
    const m2 = factory.createMaterial(MATERIAL_PRESETS.chrome)
    expect(m2).not.toBe(m1) // new instance
  })
})
