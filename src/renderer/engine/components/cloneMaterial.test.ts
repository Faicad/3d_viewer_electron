import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { cloneAndConvertMaterial, createDefaultMaterial, disposeMaterial, getMaterialColor } from './cloneMaterial'

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
