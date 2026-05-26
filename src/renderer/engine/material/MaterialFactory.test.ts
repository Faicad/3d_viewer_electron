import { describe, it, expect, beforeEach } from 'vitest'
import * as THREE from 'three'
import { MaterialFactory } from './MaterialFactory'
import type { MaterialAppearance } from './types'
import { MATERIAL_PRESETS } from './presets'
import { TextureCache } from './TextureCache'

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
  // Alpha mode colour preservation — regression: switching modes must NOT
  // lose the material colour (bug: OPAQUE→BLEND turned objects white)
  //
  // NOTE: MaterialFactory sets colour via mat.color.setRGB(r,g,b, SRGB),
  // so Three.js stores the value in linear space.  We compare materials
  // against each other rather than against raw sRGB inputs.
  // -----------------------------------------------------------------------

  it('BLEND alpha mode preserves colour', () => {
    const base: MaterialAppearance = {
      name: 'colored',
      color: [0.8, 0.6, 0.2, 0.7],
      roughness: 0.5,
      metalness: 0.0,
    }
    const matOpaque = factory.createMaterial(base)
    const matBlend = factory.createMaterial({ ...base, alphaMode: 'BLEND' as const })

    expect(matBlend.transparent).toBe(true)
    expect(matBlend.opacity).toBe(0.7)
    // Colour MUST equal the OPAQUE reference — not default white
    expect(matBlend.color.r).toBe(matOpaque.color.r)
    expect(matBlend.color.g).toBe(matOpaque.color.g)
    expect(matBlend.color.b).toBe(matOpaque.color.b)
  })

  it('MASK alpha mode preserves colour', () => {
    const base: MaterialAppearance = {
      name: 'colored',
      color: [0.3, 0.7, 0.5, 1.0],
      roughness: 0.4,
      metalness: 0.2,
    }
    const matOpaque = factory.createMaterial(base)
    const matMask = factory.createMaterial({ ...base, alphaMode: 'MASK' as const, alphaCutoff: 0.6 })

    expect(matMask.alphaTest).toBe(0.6)
    expect(matMask.color.r).toBe(matOpaque.color.r)
    expect(matMask.color.g).toBe(matOpaque.color.g)
    expect(matMask.color.b).toBe(matOpaque.color.b)
  })

  it('OPAQUE → BLEND → OPAQUE roundtrip preserves colour', () => {
    const opaque: MaterialAppearance = {
      name: 'brass',
      color: [0.8, 0.6, 0.2, 1.0],
      roughness: 0.3,
      metalness: 0.8,
    }
    const blend: MaterialAppearance = { ...opaque, alphaMode: 'BLEND' as const }
    const backToOpaque: MaterialAppearance = { ...blend, alphaMode: 'OPAQUE' as const }

    const matOpaque = factory.createMaterial(opaque)
    const matBlend = factory.createMaterial(blend)
    const matBackToOpaque = factory.createMaterial(backToOpaque)

    // All three must have identical colour
    for (const mat of [matBlend, matBackToOpaque]) {
      expect(mat.color.r, 'color.r must survive alpha mode switch').toBeCloseTo(matOpaque.color.r, 4)
      expect(mat.color.g, 'color.g must survive alpha mode switch').toBeCloseTo(matOpaque.color.g, 4)
      expect(mat.color.b, 'color.b must survive alpha mode switch').toBeCloseTo(matOpaque.color.b, 4)
    }
    expect(matBackToOpaque.roughness).toBe(matOpaque.roughness)
    expect(matBackToOpaque.metalness).toBe(matOpaque.metalness)
  })

  it('OPAQUE → MASK → OPAQUE roundtrip preserves colour', () => {
    const opaque: MaterialAppearance = {
      name: 'brass',
      color: [0.8, 0.6, 0.2, 1.0],
      roughness: 0.3,
      metalness: 0.8,
    }
    const mask: MaterialAppearance = { ...opaque, alphaMode: 'MASK' as const, alphaCutoff: 0.5 }
    const backToOpaque: MaterialAppearance = { ...mask, alphaMode: 'OPAQUE' as const }

    const matOpaque = factory.createMaterial(opaque)
    const matMask = factory.createMaterial(mask)
    const matBackToOpaque = factory.createMaterial(backToOpaque)

    expect(matMask.color.r).toBeCloseTo(matOpaque.color.r, 4)
    expect(matMask.color.g).toBeCloseTo(matOpaque.color.g, 4)
    expect(matMask.color.b).toBeCloseTo(matOpaque.color.b, 4)
    expect(matBackToOpaque.color.r).toBeCloseTo(matOpaque.color.r, 4)
    expect(matBackToOpaque.color.g).toBeCloseTo(matOpaque.color.g, 4)
    expect(matBackToOpaque.color.b).toBeCloseTo(matOpaque.color.b, 4)
  })

  it('OPAQUE → BLEND → MASK → OPAQUE full cycle preserves colour', () => {
    const base: MaterialAppearance = {
      name: 'test',
      color: [0.5, 0.3, 0.9, 1.0],
      roughness: 0.4,
      metalness: 0.6,
    }
    const matBase = factory.createMaterial(base)

    const blend: MaterialAppearance = { ...base, alphaMode: 'BLEND' as const }
    const mask: MaterialAppearance = { ...base, alphaMode: 'MASK' as const, alphaCutoff: 0.5 }
    const opaque2: MaterialAppearance = { ...base, alphaMode: 'OPAQUE' as const }

    for (const app of [blend, mask, opaque2]) {
      const mat = factory.createMaterial(app)
      expect(mat.color.r).toBeCloseTo(matBase.color.r, 4)
      expect(mat.color.g).toBeCloseTo(matBase.color.g, 4)
      expect(mat.color.b).toBeCloseTo(matBase.color.b, 4)
      expect(mat.roughness).toBe(matBase.roughness)
      expect(mat.metalness).toBe(matBase.metalness)
    }
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
  // Alpha mode edge cases
  // -----------------------------------------------------------------------

  it('handles 3-component colour array (no alpha) through alpha mode switches', () => {
    const appearance: MaterialAppearance = {
      name: 'no-alpha',
      color: [0.4, 0.6, 0.8] as unknown as [number, number, number, number],
      roughness: 0.5,
      metalness: 0.0,
    }
    const matOpaque = factory.createMaterial(appearance)
    expect(matOpaque.transparent).toBe(false)

    // Switch to BLEND — opacity defaults to 1.0, colour unchanged
    const matBlend = factory.createMaterial({ ...appearance, alphaMode: 'BLEND' as const })
    expect(matBlend.transparent).toBe(true)
    expect(matBlend.opacity).toBe(1.0)
    expect(matBlend.color.r).toBe(matOpaque.color.r)
    expect(matBlend.color.g).toBe(matOpaque.color.g)
    expect(matBlend.color.b).toBe(matOpaque.color.b)
  })

  it('BLEND with explicit partial opacity preserves colour', () => {
    const base: MaterialAppearance = {
      name: 'semi-transparent',
      color: [0.2, 0.5, 0.9, 0.4],
      roughness: 0.5,
      metalness: 0.0,
    }
    const matOpaque = factory.createMaterial(base)
    const matBlend = factory.createMaterial({ ...base, alphaMode: 'BLEND' as const })

    expect(matBlend.opacity).toBe(0.4)
    expect(matBlend.transparent).toBe(true)
    expect(matBlend.color.r).toBe(matOpaque.color.r)
    expect(matBlend.color.g).toBe(matOpaque.color.g)
    expect(matBlend.color.b).toBe(matOpaque.color.b)
  })

  it('MASK without explicit alphaCutoff defaults to 0.5 and preserves colour', () => {
    const base: MaterialAppearance = {
      name: 'test',
      color: [0.7, 0.3, 0.5, 1.0],
      roughness: 0.5,
      metalness: 0.0,
    }
    const matOpaque = factory.createMaterial(base)
    const matMask = factory.createMaterial({ ...base, alphaMode: 'MASK' as const })

    expect(matMask.alphaTest).toBe(0.5)
    expect(matMask.transparent).toBe(false)
    expect(matMask.color.r).toBe(matOpaque.color.r)
    expect(matMask.color.g).toBe(matOpaque.color.g)
    expect(matMask.color.b).toBe(matOpaque.color.b)
  })

  it('rapid multi-switch OPAQUE→BLEND→OPAQUE→BLEND→OPAQUE preserves colour', () => {
    const base: MaterialAppearance = {
      name: 'rapid',
      color: [0.55, 0.45, 0.35, 1.0],
      roughness: 0.3,
      metalness: 0.7,
    }
    const matBase = factory.createMaterial(base)

    const sequence: Partial<MaterialAppearance>[] = [
      { alphaMode: 'BLEND' as const },
      { alphaMode: 'OPAQUE' as const },
      { alphaMode: 'BLEND' as const },
      { alphaMode: 'OPAQUE' as const },
    ]

    let current = { ...base }
    for (const update of sequence) {
      current = { ...current, ...update }
      const mat = factory.createMaterial(current)
      expect(mat.color.r, `color.r must survive after ${JSON.stringify(update)}`).toBe(matBase.color.r)
      expect(mat.color.g, `color.g must survive after ${JSON.stringify(update)}`).toBe(matBase.color.g)
      expect(mat.color.b, `color.b must survive after ${JSON.stringify(update)}`).toBe(matBase.color.b)
      expect(mat.roughness).toBe(matBase.roughness)
      expect(mat.metalness).toBe(matBase.metalness)
    }
  })

  it('BLEND mode with colour alpha=0 does not lose colour', () => {
    const base: MaterialAppearance = {
      name: 'invisible',
      color: [0.8, 0.2, 0.2, 0.0],
      roughness: 0.5,
      metalness: 0.0,
    }
    const matOpaque = factory.createMaterial(base)
    const matBlend = factory.createMaterial({ ...base, alphaMode: 'BLEND' as const })

    expect(matBlend.opacity).toBe(0.0)
    // Colour channels must still equal the opaque reference (not default white)
    expect(matBlend.color.r).toBe(matOpaque.color.r)
    expect(matBlend.color.g).toBe(matOpaque.color.g)
    expect(matBlend.color.b).toBe(matOpaque.color.b)
  })

  // -----------------------------------------------------------------------
  // Texture transfer — CRITICAL: switching alpha mode must preserve textures
  //
  // BUG: When user changes alphaMode, MaterialFactory creates a new material.
  // Textures are only applied via _applyCachedTextures if they're already in
  // the TextureCache. GLTFLoader loads textures directly onto the original
  // material — they are NOT in the TextureCache. So the new material has NO
  // textures, and the object renders with just its base colour.
  //
  // For a material with baseColorTexture (like the AnisotropyBarnLamp lamp
  // metal), the baseColorFactor defaults to [1,1,1] (white). Without the
  // texture, the object turns WHITE — exactly the reported bug.
  // -----------------------------------------------------------------------

  it('BUG: textures are LOST when cache has no entry for the URL', () => {
    const appearance: MaterialAppearance = {
      name: 'textured',
      color: [1, 1, 1, 1],         // white — what the user sees after the bug
      roughness: 0.5,
      metalness: 0.0,
      map: 'data:image/png;base64,FAKE_TEXTURE_DATA',       // has texture URL
      normalMap: 'data:image/png;base64,FAKE_NORMAL_DATA',   // has normal map URL
    }
    const mat = factory.createMaterial(appearance)

    // BUG VERIFIED: map and normalMap are null because the textures were
    // never loaded into the TextureCache. The material renders with just
    // color=[1,1,1] → WHITE object.
    expect(mat.map).toBeNull()
    expect(mat.normalMap).toBeNull()

    // The color is correctly set (white base color factor)
    expect(mat.color.r).toBe(1.0)
    expect(mat.color.g).toBe(1.0)
    expect(mat.color.b).toBe(1.0)
  })

  it('FIX: textures ARE applied when pre-loaded into TextureCache', () => {
    // Pre-populate the texture cache (simulates what should happen during
    // initial GLB loading — textures should be registered in the cache).
    const tc = new TextureCache()
    const mapTex = new THREE.Texture()
    mapTex.name = 'baseColorTexture'
    mapTex.needsUpdate = true
    const normalTex = new THREE.Texture()
    normalTex.name = 'normalTexture'
    normalTex.needsUpdate = true

    const MAP_URL = 'data:image/png;base64,REAL_TEXTURE'
    const NORMAL_URL = 'data:image/png;base64,REAL_NORMAL'

    // Inject into cache (simulating TextureCache.load completing)
    ;(tc as unknown as { _cache: Map<string, THREE.Texture> })._cache.set(MAP_URL, mapTex)
    ;(tc as unknown as { _cache: Map<string, THREE.Texture> })._cache.set(NORMAL_URL, normalTex)

    factory.setTextureCache(tc)

    const appearance: MaterialAppearance = {
      name: 'textured',
      color: [1, 1, 1, 1],
      roughness: 0.5,
      metalness: 0.0,
      map: MAP_URL,
      normalMap: NORMAL_URL,
    }
    const mat = factory.createMaterial(appearance)

    // FIX VERIFIED: textures are applied from the cache
    expect(mat.map).toBe(mapTex)
    expect(mat.normalMap).toBe(normalTex)
    // Color is the baseColorFactor (white [1,1,1] is valid for textured materials)
    expect(mat.roughness).toBe(0.5)
    expect(mat.metalness).toBe(0.0)

    factory.setTextureCache(null)
  })

  it('textures survive OPAQUE → BLEND switch when cache is populated', () => {
    const tc = new TextureCache()
    const mapTex = new THREE.Texture()
    mapTex.needsUpdate = true
    const MAP_URL = 'data:image/jpeg;base64,TEXTURE'
    ;(tc as unknown as { _cache: Map<string, THREE.Texture> })._cache.set(MAP_URL, mapTex)
    factory.setTextureCache(tc)

    const base: MaterialAppearance = {
      name: 'textured-metal',
      color: [0.8, 0.6, 0.2, 1.0],
      roughness: 0.35,
      metalness: 0.9,
      map: MAP_URL,
    }

    // OPAQUE material — has texture
    const matOpaque = factory.createMaterial(base)
    expect(matOpaque.map).toBe(mapTex)
    expect(matOpaque.transparent).toBe(false)

    // Switch to BLEND — must still have texture
    const matBlend = factory.createMaterial({ ...base, alphaMode: 'BLEND' as const })
    expect(matBlend.map, 'texture must survive OPAQUE→BLEND switch').toBe(mapTex)
    expect(matBlend.transparent).toBe(true)

    // Switch back to OPAQUE — must still have texture
    const matOpaque2 = factory.createMaterial({ ...base, alphaMode: 'OPAQUE' as const })
    expect(matOpaque2.map, 'texture must survive BLEND→OPAQUE switch').toBe(mapTex)
    expect(matOpaque2.transparent).toBe(false)

    // All must have the same color
    expect(matBlend.color.r).toBe(matOpaque.color.r)
    expect(matOpaque2.color.r).toBe(matOpaque.color.r)

    factory.setTextureCache(null)
  })

  it('material with multiple textures loses ALL textures when cache is empty', () => {
    // Simulates AnisotropyBarnLamp lamp metal: baseColorTexture,
    // normalTexture, metallicRoughnessTexture (shared with occlusionTexture)
    const appearance: MaterialAppearance = {
      name: 'lamp-metal',
      color: [1, 1, 1, 1],
      roughness: 0.35,
      metalness: 0.9,
      map: 'data:image/png;base64,BASE_COLOR',
      normalMap: 'data:image/png;base64,NORMAL',
      roughnessMap: 'data:image/png;base64,METAL_ROUGH',
      metalnessMap: 'data:image/png;base64,METAL_ROUGH',
      aoMap: 'data:image/png;base64,OCCLUSION',
    }
    const mat = factory.createMaterial(appearance)

    // BUG: ALL 5 texture slots are null — object renders completely untextured
    expect(mat.map).toBeNull()
    expect(mat.normalMap).toBeNull()
    expect(mat.roughnessMap).toBeNull()
    expect(mat.metalnessMap).toBeNull()
    expect(mat.aoMap).toBeNull()

    // Color is white (baseColorFactor default) → object is WHITE
    expect(mat.color.r).toBe(1.0)
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
