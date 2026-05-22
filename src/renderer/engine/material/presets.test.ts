import { describe, it, expect } from 'vitest'
import { MATERIAL_PRESETS, MATERIAL_PRESET_NAMES, getPreset } from './presets'
import type { MaterialAppearance } from './types'

const ALL_PRESETS: [string, MaterialAppearance][] = Object.entries(MATERIAL_PRESETS)

describe('MATERIAL_PRESETS', () => {
  it('contains exactly 29 presets', () => {
    expect(MATERIAL_PRESET_NAMES).toHaveLength(29)
    expect(ALL_PRESETS).toHaveLength(29)
  })

  it('every preset has a non-empty name', () => {
    for (const [, p] of ALL_PRESETS) {
      expect(p.name).toBeTruthy()
      expect(typeof p.name).toBe('string')
    }
  })

  it('all preset names are unique', () => {
    const names = ALL_PRESETS.map(([, p]) => p.name)
    const unique = new Set(names)
    expect(unique.size).toBe(names.length)
  })

  it('all metalness values are in [0, 1]', () => {
    for (const [, p] of ALL_PRESETS) {
      if (p.metalness !== undefined) {
        expect(p.metalness).toBeGreaterThanOrEqual(0)
        expect(p.metalness).toBeLessThanOrEqual(1)
      }
    }
  })

  it('all roughness values are in [0, 1]', () => {
    for (const [, p] of ALL_PRESETS) {
      if (p.roughness !== undefined) {
        expect(p.roughness).toBeGreaterThanOrEqual(0)
        expect(p.roughness).toBeLessThanOrEqual(1)
      }
    }
  })

  it('all transmission values are in [0, 1]', () => {
    for (const [, p] of ALL_PRESETS) {
      if (p.transmission !== undefined) {
        expect(p.transmission).toBeGreaterThanOrEqual(0)
        expect(p.transmission).toBeLessThanOrEqual(1)
      }
    }
  })

  it('all clearcoat values are in [0, 1]', () => {
    for (const [, p] of ALL_PRESETS) {
      if (p.clearcoat !== undefined) {
        expect(p.clearcoat).toBeGreaterThanOrEqual(0)
        expect(p.clearcoat).toBeLessThanOrEqual(1)
      }
    }
  })

  it('transmission presets have ior set', () => {
    for (const [, p] of ALL_PRESETS) {
      if (p.transmission !== undefined && p.transmission > 0) {
        expect(p.ior).toBeDefined()
        expect(p.ior!).toBeGreaterThan(1.0)
      }
    }
  })

  it('anisotropy presets are only on metals', () => {
    for (const [, p] of ALL_PRESETS) {
      if (p.anisotropy !== undefined && p.anisotropy > 0) {
        expect(p.metalness).toBeGreaterThan(0)
      }
    }
  })

  it('car paint has clearcoat', () => {
    const car = MATERIAL_PRESETS.carPaint
    expect(car.clearcoat).toBeGreaterThan(0.5)
  })

  it('chrome is highly reflective (low roughness)', () => {
    expect(MATERIAL_PRESETS.chrome.roughness).toBeLessThan(0.1)
    expect(MATERIAL_PRESETS.chrome.metalness).toBe(1.0)
  })

  it('concrete is rough and non-metallic', () => {
    expect(MATERIAL_PRESETS.concrete.roughness).toBeGreaterThan(0.8)
    expect(MATERIAL_PRESETS.concrete.metalness).toBe(0)
  })

  it('MATERIAL_PRESET_NAMES matches keys', () => {
    const keys = Object.keys(MATERIAL_PRESETS).sort()
    const names = [...MATERIAL_PRESET_NAMES].sort()
    expect(keys).toEqual(names)
  })

  it('getPreset returns correct preset', () => {
    expect(getPreset('chrome')).toBe(MATERIAL_PRESETS.chrome)
    expect(getPreset('gold')).toBe(MATERIAL_PRESETS.gold)
  })

  it('getPreset returns undefined for unknown id', () => {
    expect(getPreset('nonexistent')).toBeUndefined()
  })

  // -----------------------------------------------------------------------
  // Category coverage
  // -----------------------------------------------------------------------

  it('has 6 polished metals', () => {
    const metals = ALL_PRESETS.filter(([, p]) =>
      p.metalness === 1.0 && (p.roughness ?? 1) < 0.2,
    )
    expect(metals).toHaveLength(6)
  })

  it('has 5 brushed / satin metals', () => {
    const brushed = ALL_PRESETS.filter(([, p]) =>
      (p.metalness ?? 0) >= 0.8 && (p.roughness ?? 0) >= 0.25 && (p.roughness ?? 0) <= 0.7,
    )
    // stainlessSteel, brushedAluminum, castIron, titanium, weatheredSteel
    expect(brushed.length).toBeGreaterThanOrEqual(5)
  })

  it('has at least 3 glass / transparent presets with transmission', () => {
    const glass = ALL_PRESETS.filter(([, p]) => (p.transmission ?? 0) > 0)
    expect(glass.length).toBeGreaterThanOrEqual(3)
  })

  it('has at least 3 rubber presets with high roughness', () => {
    const rubber = ALL_PRESETS.filter(([, p]) =>
      p.metalness === 0 && (p.roughness ?? 0) >= 0.8,
    )
    expect(rubber.length).toBeGreaterThanOrEqual(3)
  })

  it('carPaint and metallicPaint have clearcoat', () => {
    expect(MATERIAL_PRESETS.carPaint.clearcoat).toBeGreaterThan(0)
    expect(MATERIAL_PRESETS.metallicPaint.clearcoat).toBeGreaterThan(0)
  })
})
