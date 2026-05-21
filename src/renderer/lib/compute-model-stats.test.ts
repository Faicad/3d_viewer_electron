import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { computeModelStats, formatNumber, computeMaterialCost } from './compute-model-stats'
import { sourceUnitToLabel, FILE_FORMATS } from '@/config/file-formats'
import type { UnitSystem } from '@/config/file-formats'

function makeBoxGroup(useIndex: boolean): THREE.Group {
  const group = new THREE.Group()
  const geo = new THREE.BoxGeometry(2, 2, 2)
  if (!useIndex && geo.index) {
    const pos = geo.getAttribute('position')
    const nonIndexed = new THREE.BufferGeometry()
    const idx = geo.index!.array as Uint16Array
    const verts: number[] = []
    for (let i = 0; i < idx.length; i++) {
      verts.push(pos.getX(idx[i]), pos.getY(idx[i]), pos.getZ(idx[i]))
    }
    nonIndexed.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
    nonIndexed.computeVertexNormals()
    const mesh = new THREE.Mesh(nonIndexed)
    group.add(mesh)
  } else {
    const mesh = new THREE.Mesh(geo)
    group.add(mesh)
  }
  group.updateWorldMatrix(true, false)
  return group
}

describe('formatNumber', () => {
  it('preserves small values that Math.round would truncate to 0', () => {
    expect(Number(formatNumber(0.06))).toBeGreaterThan(0)
    expect(Number(formatNumber(0.001))).toBeGreaterThan(0)
    expect(Number(formatNumber(0.1))).toBeGreaterThan(0)
  })

  it('does not show as string "0" for non-zero small values', () => {
    expect(formatNumber(0.06)).not.toBe('0')
    expect(formatNumber(0.001)).not.toBe('0')
    expect(formatNumber(0.1)).not.toBe('0')
  })

  it('rounds large values to integer with locale formatting', () => {
    expect(formatNumber(1234.56)).toBe('1,235')
    expect(formatNumber(100)).toBe('100')
  })

  it('handles zero', () => {
    expect(formatNumber(0)).toBe('0')
  })

  it('handles non-finite values', () => {
    expect(formatNumber(Infinity)).toBe('-')
    expect(formatNumber(NaN)).toBe('-')
  })
})

describe('computeModelStats', () => {
  it('computes non-zero stats for a box mesh with indexed geometry', () => {
    const group = makeBoxGroup(true)
    const stats = computeModelStats(group)
    expect(stats.vertices).toBeGreaterThan(0)
    expect(stats.triangles).toBe(12)
    expect(stats.surfaceArea).toBe(24)
    expect(stats.volume).toBe(8)
    expect(stats.boundingBox.isEmpty()).toBe(false)
    expect(stats.partCount).toBe(1)
  })

  it('computes non-zero stats for a box mesh with non-indexed geometry', () => {
    const group = makeBoxGroup(false)
    const stats = computeModelStats(group)
    expect(stats.vertices).toBeGreaterThan(0)
    expect(stats.triangles).toBe(12)
    expect(stats.surfaceArea).toBe(24)
    expect(stats.volume).toBe(8)
    expect(stats.boundingBox.isEmpty()).toBe(false)
    expect(stats.partCount).toBe(1)
  })

  it('computes non-zero stats when mesh position is set (simulating R3F)', () => {
    const group = new THREE.Group()
    const geo = new THREE.BoxGeometry(2, 2, 2)
    const mesh = new THREE.Mesh(geo)
    mesh.position.set(5, -3, 2)
    group.add(mesh)
    group.updateWorldMatrix(true, false)
    const stats = computeModelStats(group)
    expect(stats.surfaceArea).toBe(24)
    expect(stats.volume).toBe(8)
    expect(stats.boundingBox.isEmpty()).toBe(false)
  })

  it('handles meshes with identity matrixWorld (not yet updated)', () => {
    const group = new THREE.Group()
    const geo = new THREE.BoxGeometry(2, 2, 2)
    const mesh = new THREE.Mesh(geo)
    mesh.position.set(5, -3, 2)
    group.add(mesh)
    const stats = computeModelStats(group)
    expect(stats.surfaceArea).toBe(24)
    expect(stats.volume).toBe(8)
  })

  it('computes non-zero stats for small model like test-box.glb (0.1 unit box)', () => {
    const group = new THREE.Group()
    const geo = new THREE.BoxGeometry(0.1, 0.1, 0.1)
    const mesh = new THREE.Mesh(geo)
    group.add(mesh)
    group.updateWorldMatrix(true, false)
    const stats = computeModelStats(group)
    expect(stats.surfaceArea).toBeGreaterThan(0)
    expect(stats.volume).toBeGreaterThan(0)
    expect(stats.boundingBox.isEmpty()).toBe(false)
    expect(Number(formatNumber(stats.surfaceArea))).toBeGreaterThan(0)
    expect(Number(formatNumber(stats.volume))).toBeGreaterThan(0)
  })

  it('computes non-zero stats for multi-mesh group', () => {
    const group = new THREE.Group()
    for (let i = 0; i < 2; i++) {
      const geo = new THREE.BoxGeometry(2, 2, 2)
      const mesh = new THREE.Mesh(geo)
      mesh.position.set(i * 10, 0, 0)
      group.add(mesh)
    }
    group.updateWorldMatrix(true, false)
    const stats = computeModelStats(group)
    expect(stats.surfaceArea).toBe(48)
    expect(stats.volume).toBe(16)
    expect(stats.partCount).toBe(2)
    expect(stats.boundingBox.isEmpty()).toBe(false)
  })
})

describe('sourceUnitToLabel', () => {
  const cases: [UnitSystem, string][] = [
    ['millimeter', 'mm'],
    ['centimeter', 'cm'],
    ['meter', 'm'],
    ['inch', 'in'],
    ['foot', 'ft'],
    ['micron', 'µm'],
    ['angstrom', 'Å'],
  ]

  for (const [unit, label] of cases) {
    it(`maps ${unit} → ${label}`, () => {
      expect(sourceUnitToLabel(unit)).toBe(label)
    })
  }

  it('falls back to mm for unknown unit', () => {
    expect(sourceUnitToLabel('unknown' as UnitSystem)).toBe('mm')
  })
})

describe('file-formats defaultUnit coverage', () => {
  const validUnits: UnitSystem[] = ['millimeter', 'centimeter', 'meter', 'inch', 'foot', 'micron', 'angstrom']

  for (const format of FILE_FORMATS) {
    it(`${format.label} (${format.extensions.join(', ')}) has a valid defaultUnit`, () => {
      expect(format.defaultUnit).toBeDefined()
      expect(validUnits).toContain(format.defaultUnit)
    })
  }
})

describe('computeMaterialCost', () => {
  it('returns "-" for zero volume', () => {
    expect(computeMaterialCost(0, 'millimeter')).toBe('-')
  })

  it('returns "-" for negative volume', () => {
    expect(computeMaterialCost(-1, 'millimeter')).toBe('-')
  })

  it('computes correctly for mm³ volume', () => {
    // 1000 mm³ = 1 cm³ → 1.24 g
    expect(computeMaterialCost(1000, 'millimeter')).toBe('1.24 g (PLA)')
  })

  it('handles cm³ volume with conversion', () => {
    // 1 cm³ = 1000 mm³ → 1000/1000*1.24 = 1.24 g
    expect(computeMaterialCost(1, 'centimeter')).toBe('1.24 g (PLA)')
  })

  it('handles m³ volume with conversion (e.g. GLB file)', () => {
    // A 0.15×0.12×0.09 m box → 0.00162 m³
    // 0.00162 * 10⁹ = 1,620,000 mm³ → 1620000/1000*1.24 = 2008.8 g
    const cost = computeMaterialCost(0.00162, 'meter')
    expect(cost).toContain('g (PLA)')
    expect(cost).not.toBe('-')
    // Should be around 2009 g
    const grams = parseFloat(cost.replace(/ g \(PLA\)$/, '').replace(/,/g, ''))
    expect(grams).toBeGreaterThan(1000)
    expect(grams).toBeLessThan(3000)
  })

  it('handles in³ volume with conversion', () => {
    // 1 in³ = 16387.064 mm³ → 16387.064/1000*1.24 ≈ 20.32 g
    const cost = computeMaterialCost(1, 'inch')
    expect(cost).toContain('g (PLA)')
    const grams = parseFloat(cost.replace(/ g \(PLA\)$/, '').replace(/,/g, ''))
    expect(grams).toBeGreaterThan(20)
    expect(grams).toBeLessThan(21)
  })

  it('handles ft³ volume with conversion', () => {
    // 1 ft³ = 28316846.592 mm³ → 28316846.592/1000*1.24 ≈ 35113 g
    const cost = computeMaterialCost(1, 'foot')
    expect(cost).toContain('g (PLA)')
    const grams = parseFloat(cost.replace(/ g \(PLA\)$/, '').replace(/,/g, ''))
    expect(grams).toBeGreaterThan(35000)
    expect(grams).toBeLessThan(36000)
  })

  it('returns non-zero for non-mm units', () => {
    const units: UnitSystem[] = ['centimeter', 'meter', 'inch', 'foot', 'micron', 'angstrom']
    for (const unit of units) {
      // Use a volume that ensures reasonable output
      const cost = computeMaterialCost(unit === 'micron' ? 1e9 : unit === 'angstrom' ? 1e24 : 1, unit)
      expect(cost).not.toBe('-')
      expect(parseFloat(cost.replace(/ g \(PLA\)$/, '').replace(/,/g, ''))).toBeGreaterThan(0)
    }
  })
})
