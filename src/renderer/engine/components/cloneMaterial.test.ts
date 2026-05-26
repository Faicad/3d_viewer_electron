import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { cloneAndConvertMaterial, createDefaultMaterial, disposeMaterial, getMaterialColor, materialToAppearance, textureThumbnail } from './cloneMaterial'

function makeFakeTexture() {
  const canvas = Buffer.alloc(16) // dummy — Texture won't render in node but props work
  const tex = new THREE.Texture(canvas as unknown as HTMLImageElement)
  tex.needsUpdate = true
  return tex
}

describe('cloneAndConvertMaterial', () => {
  it('returns null for null input', () => {
    expect(cloneAndConvertMaterial(null)).toBeNull()
    expect(cloneAndConvertMaterial(undefined)).toBeNull()
  })

  it('clones MeshPhysicalMaterial as-is', () => {
    const src = new THREE.MeshPhysicalMaterial({ roughness: 0.3, metalness: 0.7 })
    const result = cloneAndConvertMaterial(src) as THREE.Material
    expect(result).toBeInstanceOf(THREE.MeshPhysicalMaterial)
    expect((result as THREE.MeshPhysicalMaterial).roughness).toBe(0.3)
    expect((result as THREE.MeshPhysicalMaterial).metalness).toBe(0.7)
    expect(result).not.toBe(src) // cloned, not same ref
  })

  it('upgrades MeshStandardMaterial to MeshPhysicalMaterial', () => {
    const src = new THREE.MeshStandardMaterial({ roughness: 0.5 })
    const result = cloneAndConvertMaterial(src) as THREE.Material
    expect(result).toBeInstanceOf(THREE.MeshPhysicalMaterial)
    expect((result as THREE.MeshStandardMaterial).roughness).toBe(0.5)
  })

  it('converts MeshPhongMaterial to MeshPhysicalMaterial', () => {
    const src = new THREE.MeshPhongMaterial({ shininess: 500 })
    const result = cloneAndConvertMaterial(src) as THREE.Material
    expect(result).toBeInstanceOf(THREE.MeshPhysicalMaterial)
  })

  it('converts MeshLambertMaterial to MeshPhysicalMaterial', () => {
    const src = new THREE.MeshLambertMaterial()
    const result = cloneAndConvertMaterial(src) as THREE.Material
    expect(result).toBeInstanceOf(THREE.MeshPhysicalMaterial)
    expect((result as THREE.MeshStandardMaterial).roughness).toBe(0.9)
    expect((result as THREE.MeshStandardMaterial).metalness).toBe(0.0)
  })

  it('converts MeshBasicMaterial to MeshPhysicalMaterial', () => {
    const src = new THREE.MeshBasicMaterial()
    const result = cloneAndConvertMaterial(src) as THREE.Material
    expect(result).toBeInstanceOf(THREE.MeshPhysicalMaterial)
    expect((result as THREE.MeshStandardMaterial).roughness).toBe(1.0)
  })

  it('converts MeshToonMaterial to MeshPhysicalMaterial', () => {
    const src = new THREE.MeshToonMaterial()
    const result = cloneAndConvertMaterial(src) as THREE.Material
    expect(result).toBeInstanceOf(THREE.MeshPhysicalMaterial)
    expect((result as THREE.MeshStandardMaterial).roughness).toBe(0.6)
  })

  it('converts MeshMatcapMaterial to MeshPhysicalMaterial', () => {
    const src = new THREE.MeshMatcapMaterial()
    const result = cloneAndConvertMaterial(src) as THREE.Material
    expect(result).toBeInstanceOf(THREE.MeshPhysicalMaterial)
    expect((result as THREE.MeshStandardMaterial).roughness).toBe(1.0)
  })

  it('clones MeshNormalMaterial as-is', () => {
    const src = new THREE.MeshNormalMaterial()
    const result = cloneAndConvertMaterial(src) as THREE.Material
    expect(result).toBeInstanceOf(THREE.MeshNormalMaterial)
  })

  it('handles material arrays', () => {
    const src = [new THREE.MeshLambertMaterial(), new THREE.MeshPhongMaterial()]
    const result = cloneAndConvertMaterial(src) as THREE.Material[]
    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(2)
  })

  it('applies polygonOffset to converted materials', () => {
    const src = new THREE.MeshPhongMaterial()
    const result = cloneAndConvertMaterial(src) as THREE.MeshStandardMaterial
    expect(result.polygonOffset).toBe(true)
    expect(result.polygonOffsetFactor).toBe(-1)
    expect(result.polygonOffsetUnits).toBe(-1)
  })

  // -----------------------------------------------------------------------
  // envMap forwarding — every converter must carry forward source envMap
  // -----------------------------------------------------------------------

  it('phongToStandard forwards envMap and envMapIntensity', () => {
    const tex = makeFakeTexture()
    const src = new THREE.MeshPhongMaterial({ envMap: tex, envMapIntensity: 2.5 })
    const dst = cloneAndConvertMaterial(src) as THREE.MeshStandardMaterial
    expect(dst.envMap).toBe(tex)
    expect(dst.envMapIntensity).toBe(2.5)
  })

  it('lambertToStandard forwards envMap and envMapIntensity', () => {
    const tex = makeFakeTexture()
    const src = new THREE.MeshLambertMaterial({ envMap: tex, envMapIntensity: 1.8 })
    const dst = cloneAndConvertMaterial(src) as THREE.MeshStandardMaterial
    expect(dst.envMap).toBe(tex)
    expect(dst.envMapIntensity).toBe(1.8)
  })

  it('basicToStandard forwards envMap and envMapIntensity', () => {
    const tex = makeFakeTexture()
    const src = new THREE.MeshBasicMaterial({ envMap: tex })
    // MeshBasicMaterial does not have envMapIntensity natively; set via cast
    ;(src as unknown as Record<string, unknown>).envMapIntensity = 0.5
    const dst = cloneAndConvertMaterial(src) as THREE.MeshStandardMaterial
    expect(dst.envMap).toBe(tex)
    expect(dst.envMapIntensity).toBe(0.5)
  })

  it('toonToStandard forwards envMap and envMapIntensity', () => {
    const tex = makeFakeTexture()
    const src = new THREE.MeshToonMaterial()
    // MeshToonMaterial does not have envMap/envMapIntensity natively; set via cast
    ;(src as unknown as Record<string, unknown>).envMap = tex
    ;(src as unknown as Record<string, unknown>).envMapIntensity = 0.7
    const dst = cloneAndConvertMaterial(src) as THREE.MeshStandardMaterial
    expect(dst.envMap).toBe(tex)
    expect(dst.envMapIntensity).toBe(0.7)
  })

  it('fallbackToStandard forwards envMap and envMapIntensity when present', () => {
    const tex = makeFakeTexture()
    // ShadowMaterial extends Material but has no color by default
    const src = new THREE.ShadowMaterial()
    // Simulate envMap being set on an unknown material type
    ;(src as unknown as Record<string, unknown>).envMap = tex
    ;(src as unknown as Record<string, unknown>).envMapIntensity = 0.9
    const dst = cloneAndConvertMaterial(src) as THREE.MeshStandardMaterial
    expect(dst.envMap).toBe(tex)
    expect(dst.envMapIntensity).toBe(0.9)
  })

  it('MeshPhysicalMaterial clone preserves envMap', () => {
    const tex = makeFakeTexture()
    const src = new THREE.MeshPhysicalMaterial({ envMap: tex, envMapIntensity: 1.5 })
    const dst = cloneAndConvertMaterial(src) as THREE.MeshPhysicalMaterial
    expect(dst.envMap).toBe(tex)
    expect(dst.envMapIntensity).toBe(1.5)
  })
})

describe('createDefaultMaterial', () => {
  it('returns MeshPhysicalMaterial with default PBR properties', () => {
    const mat = createDefaultMaterial()
    expect(mat).toBeInstanceOf(THREE.MeshPhysicalMaterial)
    expect(mat.color.getHex()).toBe(0x9ba6ae)
    expect(mat.roughness).toBe(0.35)
    expect(mat.metalness).toBe(0.1)
    expect(mat.side).toBe(THREE.FrontSide)
    mat.dispose()
  })
})

describe('getMaterialColor', () => {
  it('returns hex for colored materials', () => {
    const mat = new THREE.MeshStandardMaterial({ color: 0xff0000 })
    const color = getMaterialColor(mat)
    expect(color).toBe('#ff0000')
  })

  it('returns null for default-white materials', () => {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff })
    expect(getMaterialColor(mat)).toBeNull()
  })

  it('returns null for null input', () => {
    expect(getMaterialColor(null)).toBeNull()
  })

  it('returns distinctive blue for MeshNormalMaterial', () => {
    const mat = new THREE.MeshNormalMaterial()
    expect(getMaterialColor(mat)).toBe('#4488ff')
  })

  it('uses first material when given an array', () => {
    const mats = [
      new THREE.MeshStandardMaterial({ color: 0x00ff00 }),
      new THREE.MeshStandardMaterial({ color: 0xff0000 }),
    ]
    expect(getMaterialColor(mats)).toBe('#00ff00')
  })
})

describe('disposeMaterial', () => {
  it('disposes single material', () => {
    const mat = new THREE.MeshStandardMaterial()
    expect(() => disposeMaterial(mat)).not.toThrow()
  })

  it('disposes material array', () => {
    const mats = [new THREE.MeshStandardMaterial(), new THREE.MeshStandardMaterial()]
    expect(() => disposeMaterial(mats)).not.toThrow()
  })

  it('handles null/undefined gracefully', () => {
    expect(() => disposeMaterial(null)).not.toThrow()
    expect(() => disposeMaterial(undefined)).not.toThrow()
  })
})

// -----------------------------------------------------------------------
// materialToAppearance
// -----------------------------------------------------------------------

describe('materialToAppearance', () => {
  it('returns null for null input', () => {
    const { appearance } = materialToAppearance(null, 'test')
    expect(appearance).toBeNull()
  })

  it('extracts color from a standard material', () => {
    const mat = new THREE.MeshStandardMaterial({ color: 0xcc8844 })
    const { appearance } = materialToAppearance(mat, 'test')
    expect(appearance).not.toBeNull()
    // Three.js converts sRGB colour to linear: srgb(0.8) ≈ linear(0.604)
    expect(appearance!.color![0]).toBeCloseTo(0.604, 1)
    expect(appearance!.color![1]).toBeCloseTo(0.244, 1)
    expect(appearance!.color![2]).toBeCloseTo(0.057, 1)
  })

  it('extracts roughness and metalness from MeshStandardMaterial', () => {
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.7 })
    const { appearance } = materialToAppearance(mat, 'test')
    expect(appearance!.roughness).toBe(0.3)
    expect(appearance!.metalness).toBe(0.7)
  })

  it('extracts MeshPhysicalMaterial-only properties', () => {
    const mat = new THREE.MeshPhysicalMaterial({
      clearcoat: 0.5,
      clearcoatRoughness: 0.2,
      sheen: 0.8,
      sheenRoughness: 0.3,
      transmission: 0.6,
      thickness: 1.2,
      ior: 1.6,
    })
    const { appearance } = materialToAppearance(mat, 'test')
    expect(appearance!.clearcoat).toBe(0.5)
    expect(appearance!.clearcoatRoughness).toBe(0.2)
    expect(appearance!.sheen).toBe(0.8)
    expect(appearance!.sheenRoughness).toBe(0.3)
    expect(appearance!.transmission).toBe(0.6)
    expect(appearance!.thickness).toBe(1.2)
    expect(appearance!.ior).toBe(1.6)
  })

  it('defaults to OPAQUE alphaMode for non-transparent material', () => {
    const mat = new THREE.MeshStandardMaterial({ color: 0xff0000 })
    const { appearance } = materialToAppearance(mat, 'test')
    expect(appearance!.alphaMode).toBeUndefined()
  })

  it('detects BLEND alphaMode when transparent', () => {
    const mat = new THREE.MeshStandardMaterial({ color: 0xff0000, transparent: true })
    const { appearance } = materialToAppearance(mat, 'test')
    expect(appearance!.alphaMode).toBe('BLEND')
  })

  it('detects MASK alphaMode when alphaTest > 0', () => {
    const mat = new THREE.MeshStandardMaterial({ color: 0xff0000, transparent: true, alphaTest: 0.5 })
    const { appearance } = materialToAppearance(mat, 'test')
    expect(appearance!.alphaMode).toBe('MASK')
    expect(appearance!.alphaCutoff).toBe(0.5)
  })

  it('detects doubleSided material', () => {
    const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide })
    const { appearance } = materialToAppearance(mat, 'test')
    expect(appearance!.doubleSided).toBe(true)
  })

  it('extracts emissive color and intensity', () => {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: new THREE.Color(0xff0000),
      emissiveIntensity: 2.0,
    })
    const { appearance } = materialToAppearance(mat, 'test')
    expect(appearance!.emissive).toEqual([1, 0, 0])
    expect(appearance!.emissiveIntensity).toBe(2.0)
  })

  it('skips emissive when black', () => {
    const mat = new THREE.MeshStandardMaterial({ emissive: new THREE.Color(0x000000) })
    const { appearance } = materialToAppearance(mat, 'test')
    expect(appearance!.emissive).toBeUndefined()
  })

  it('extracts opaqueness from color alpha channel', () => {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 })
    const { appearance } = materialToAppearance(mat, 'test')
    expect(appearance!.color![3]).toBe(0.5)
  })

  // ---- color space: appearance colour should be sRGB per type spec ----
  it('KNOWN BUG: materialToAppearance stores linear colour values, not sRGB', () => {
    // Three.js MeshStandardMaterial stores colour in linear space internally.
    // materialToAppearance() reads target.color.r (linear) and stores it
    // directly in the appearance. But the MaterialAppearance type spec says
    // "Colour components are sRGB RGBA in the 0–1 range."
    //
    // This mismatch causes MaterialFactory (which treats appearance colours
    // as sRGB) to double-convert: sRGB→linear → stored as linear → treated
    // as sRGB → converted to linear AGAIN.
    //
    // For a source colour of 0x6699cc (sRGB), the expected sRGB components
    // would be approx [0.4, 0.6, 0.8]. After Three.js sRGB→linear conversion,
    // the internal values are approx [0.1329, 0.3185, 0.6038].
    // materialToAppearance stores these LINEAR values without converting back.
    const mat = new THREE.MeshStandardMaterial({ color: 0x6699cc })
    const { appearance } = materialToAppearance(mat, 'test')

    // sRGB→linear converted values (Three.js internal)
    expect(appearance!.color![0]).toBeCloseTo(0.1329, 1)
    expect(appearance!.color![1]).toBeCloseTo(0.3185, 1)
    expect(appearance!.color![2]).toBeCloseTo(0.6038, 1)

    // Expected sRGB values (if properly converted back):
    // expect(appearance!.color![0]).toBeCloseTo(0.4, 1)  // sRGB 0x66/255
    // expect(appearance!.color![1]).toBeCloseTo(0.6, 1)  // sRGB 0x99/255
    // expect(appearance!.color![2]).toBeCloseTo(0.8, 1)  // sRGB 0xCC/255
  })

  // ---- alpha mode roundtrip: switching modes must preserve color ----
  it('preserves color when toggling between OPAQUE and BLEND', () => {
    const mat = new THREE.MeshStandardMaterial({ color: 0xcc8844 })
    const { appearance: original } = materialToAppearance(mat, 'test')

    // Simulate user switching to BLEND
    expect(original!.color![0]).toBeCloseTo(0.604, 1)
    const blended = { ...original, alphaMode: 'BLEND' as const }
    expect(blended.color).toEqual(original!.color)

    // Simulate user switching back to OPAQUE
    const backToOpaque = { ...blended, alphaMode: 'OPAQUE' as const }
    expect(backToOpaque.color).toEqual(original!.color)
  })
})

// -----------------------------------------------------------------------
// materialToAppearance from AnisotropyBarnLamp-style materials
//
// This model (glTF-Sample-Models) has 3 materials with anisotropy,
// clearcoat, transmission, volume, and emissive_strength extensions.
// It exercises every material property path in materialToAppearance.
//
// Texture extraction tests are in the __tests__ directory (jsdom env).
// -----------------------------------------------------------------------

describe('materialToAppearance from AnisotropyBarnLamp-style materials', () => {
  it('extracts all PBR properties from a metal material with anisotropy + clearcoat', () => {
    const mat = new THREE.MeshPhysicalMaterial()
    // lamp metal — material 0 from AnisotropyBarnLamp
    mat.color.setRGB(0.8, 0.75, 0.7, THREE.SRGBColorSpace)
    mat.roughness = 0.35
    mat.metalness = 0.9
    // KHR_materials_anisotropy
    mat.anisotropy = 0.75
    // KHR_materials_clearcoat
    mat.clearcoat = 0.25
    mat.clearcoatRoughness = 0.15

    const { appearance } = materialToAppearance(mat, 'lamp metal')

    expect(appearance).not.toBeNull()
    expect(appearance!.name).toBe('lamp metal')
    expect(appearance!.roughness).toBe(0.35)
    expect(appearance!.metalness).toBe(0.9)
    expect(appearance!.clearcoat).toBe(0.25)
    expect(appearance!.clearcoatRoughness).toBe(0.15)
    // color must be extracted (4-component [r,g,b,a])
    expect(appearance!.color).toBeDefined()
    expect(appearance!.color!.length).toBe(4)
  })

  it('extracts emissive strength material (lamp filament)', () => {
    const mat = new THREE.MeshPhysicalMaterial()
    mat.color.setRGB(0.09, 0.09, 0.09, THREE.SRGBColorSpace)
    mat.roughness = 0.7
    mat.metalness = 0.0
    mat.emissive = new THREE.Color(1.0, 0.9, 0.6)
    mat.emissiveIntensity = 25

    const { appearance } = materialToAppearance(mat, 'lamp filament')

    expect(appearance).not.toBeNull()
    expect(appearance!.roughness).toBe(0.7)
    expect(appearance!.metalness).toBe(0.0)
    expect(appearance!.emissive).toBeDefined()
    expect(appearance!.emissiveIntensity).toBe(25)
    expect(appearance!.color).toBeDefined()
  })

  it('extracts transmission + volume material (lamp glass)', () => {
    const mat = new THREE.MeshPhysicalMaterial()
    mat.color.setRGB(1, 1, 1, THREE.SRGBColorSpace)
    mat.roughness = 0.0
    mat.metalness = 0.0
    mat.transmission = 1.0
    mat.thickness = 0.01
    mat.ior = 1.5

    const { appearance } = materialToAppearance(mat, 'lamp glass')

    expect(appearance).not.toBeNull()
    expect(appearance!.roughness).toBe(0.0)
    expect(appearance!.metalness).toBe(0.0)
    expect(appearance!.transmission).toBe(1.0)
    expect(appearance!.thickness).toBe(0.01)
    expect(appearance!.ior).toBe(1.5)
  })

  it('extracts clearcoat from MeshPhysicalMaterial-only properties', () => {
    const mat = new THREE.MeshPhysicalMaterial()
    mat.clearcoat = 0.4
    mat.clearcoatRoughness = 0.1
    mat.sheen = 0.6
    mat.sheenColor = new THREE.Color(0.9, 0.8, 0.7)
    mat.sheenRoughness = 0.3

    const { appearance } = materialToAppearance(mat, 'clearcoat+sheen')

    expect(appearance!.clearcoat).toBe(0.4)
    expect(appearance!.clearcoatRoughness).toBe(0.1)
    expect(appearance!.sheen).toBe(0.6)
    expect(appearance!.sheenColor).toEqual([0.9, 0.8, 0.7])
    expect(appearance!.sheenRoughness).toBe(0.3)
  })

  it('does NOT extract anisotropy into appearance (not in MaterialAppearance type)', () => {
    const mat = new THREE.MeshPhysicalMaterial()
    mat.anisotropy = 0.75
    mat.anisotropyRotation = Math.PI / 3

    const { appearance } = materialToAppearance(mat, 'aniso')

    // Anisotropy is NOT in the MaterialAppearance type — it's a rendering-only
    // property that GLTFLoader sets directly on the material.
    expect(appearance!.anisotropy).toBeUndefined()
    expect((appearance as Record<string, unknown>).anisotropyRotation).toBeUndefined()
  })

  it('all three AnisotropyBarnLamp materials survive full pipeline roundtrip', () => {
    // Material 0: lamp metal (anisotropy + clearcoat)
    const metal = new THREE.MeshPhysicalMaterial()
    metal.color.setRGB(0.8, 0.75, 0.7, THREE.SRGBColorSpace)
    metal.roughness = 0.35
    metal.metalness = 0.9
    metal.anisotropy = 0.75
    metal.clearcoat = 0.25
    metal.clearcoatRoughness = 0.15

    // Material 1: lamp filament (emissive)
    const filament = new THREE.MeshPhysicalMaterial()
    filament.color.setRGB(0.09, 0.09, 0.09, THREE.SRGBColorSpace)
    filament.roughness = 0.7
    filament.metalness = 0.0
    filament.emissive = new THREE.Color(1.0, 0.9, 0.6)
    filament.emissiveIntensity = 25

    // Material 2: lamp glass (transmission + volume)
    const glass = new THREE.MeshPhysicalMaterial()
    glass.color.setRGB(1, 1, 1, THREE.SRGBColorSpace)
    glass.roughness = 0.0
    glass.metalness = 0.0
    glass.transmission = 1.0
    glass.thickness = 0.01
    glass.ior = 1.5

    for (const [name, mat] of [['metal', metal], ['filament', filament], ['glass', glass]] as const) {
      const { appearance } = materialToAppearance(mat, name)
      expect(appearance, `appearance extractable from ${name}`).not.toBeNull()
      expect(appearance!.name).toBe(name)
      expect(appearance!.roughness).toBeDefined()
      expect(appearance!.metalness).toBeDefined()

      // Verify JSON serialisability (no circular refs)
      const json = JSON.stringify(appearance)
      expect(json).toBeTypeOf('string')
      const parsed = JSON.parse(json)
      expect(parsed.name).toBe(name)
      expect(parsed.roughness).toBeDefined()
    }
  })
})

// -----------------------------------------------------------------------
// textureThumbnail
// -----------------------------------------------------------------------

describe('textureThumbnail', () => {
  it('returns undefined for texture without image', () => {
    const tex = new THREE.Texture()
    expect(textureThumbnail(tex)).toBeUndefined()
  })
})
