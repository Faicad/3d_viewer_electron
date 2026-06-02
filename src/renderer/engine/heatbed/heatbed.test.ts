import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import {
  autoSelectBedSize,
  calculateGridStep,
  squareBedDimensions,
  computePlateLayout,
  SUPPORTED_BED_SIZES,
  DEFAULT_BED_COLORS,
  GROUND_Z,
  GRIDLINE_Z,
  HEATBED_DEFAULT_FORMATS,
} from './types'
import { Heatbed } from './Heatbed'
import { calcZoomToBoundingBoxFactor } from './cameraFit'

// =============================================================================
// Unit tests — pure logic functions
// =============================================================================

// ---------------------------------------------------------------------------
// HEATBED_DEFAULT_FORMATS
// ---------------------------------------------------------------------------

describe('HEATBED_DEFAULT_FORMATS', () => {
  it('only includes stl, 3mf, amf, step — NOT glb/gltf', () => {
    expect(HEATBED_DEFAULT_FORMATS.has('stl')).toBe(true)
    expect(HEATBED_DEFAULT_FORMATS.has('3mf')).toBe(true)
    expect(HEATBED_DEFAULT_FORMATS.has('amf')).toBe(true)
    expect(HEATBED_DEFAULT_FORMATS.has('step')).toBe(true)
    expect(HEATBED_DEFAULT_FORMATS.has('glb')).toBe(false)
    expect(HEATBED_DEFAULT_FORMATS.has('gltf')).toBe(false)
    expect(HEATBED_DEFAULT_FORMATS.size).toBe(4)
  })
})

// ---------------------------------------------------------------------------
// autoSelectBedSize
// ---------------------------------------------------------------------------

describe('autoSelectBedSize', () => {
  it('small model (50×50mm) → 200mm', () => {
    // Model bbox in Three.js meters: 50mm = 0.05m
    const bbox = new THREE.Box3(
      new THREE.Vector3(-0.025, -0.025, 0),
      new THREE.Vector3(0.025, 0.025, 0.05),
    )
    expect(autoSelectBedSize(bbox, 1000)).toBeCloseTo(0.2)
  })

  it('Bambu X1C standard model (256mm) → 0.3 scene units (GLB meters)', () => {
    const bbox = new THREE.Box3(
      new THREE.Vector3(-0.128, -0.128, 0),
      new THREE.Vector3(0.128, 0.128, 0.1),
    )
    expect(autoSelectBedSize(bbox, 1000)).toBeCloseTo(0.3)
  })

  it('240mm model (GLB) → 0.3 scene units', () => {
    const bbox = new THREE.Box3(
      new THREE.Vector3(-0.12, -0.12, 0),
      new THREE.Vector3(0.12, 0.12, 0.05),
    )
    expect(autoSelectBedSize(bbox, 1000)).toBeCloseTo(0.3)
  })

  it('350mm model (GLB) → 0.5 scene units', () => {
    const bbox = new THREE.Box3(
      new THREE.Vector3(-0.175, -0.175, 0),
      new THREE.Vector3(0.175, 0.175, 0.05),
    )
    expect(autoSelectBedSize(bbox, 1000)).toBeCloseTo(0.5)
  })

  it('oversized model (GLB) → 1.0 scene units', () => {
    const bbox = new THREE.Box3(
      new THREE.Vector3(-0.5, -0.5, 0),
      new THREE.Vector3(0.5, 0.5, 0.1),
    )
    expect(autoSelectBedSize(bbox, 1000)).toBeCloseTo(1.0)
  })

  it('boundary: model 260mm (GLB) → 0.3 scene units', () => {
    const bbox = new THREE.Box3(
      new THREE.Vector3(-0.13, -0.13, 0),
      new THREE.Vector3(0.13, 0.13, 0.01),
    )
    expect(autoSelectBedSize(bbox, 1000)).toBeCloseTo(0.3)
  })

  it('3MF model 370mm (rawToMM=1) → 500 scene units', () => {
    const bbox = new THREE.Box3(
      new THREE.Vector3(-185, -86, 0),
      new THREE.Vector3(185, 86, 173),
    )
    expect(autoSelectBedSize(bbox, 1)).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// calculateGridStep
// ---------------------------------------------------------------------------

describe('calculateGridStep', () => {
  it('200mm → 10mm (20 cells)', () => {
    expect(calculateGridStep({ width: 200, depth: 200 })).toBe(10)
  })
  it('300mm → 10mm (30 cells)', () => {
    expect(calculateGridStep({ width: 300, depth: 300 })).toBe(10)
  })
  it('500mm → 20mm (25 cells)', () => {
    expect(calculateGridStep({ width: 500, depth: 500 })).toBe(20)
  })
  it('1000mm → 50mm (20 cells)', () => {
    expect(calculateGridStep({ width: 1000, depth: 1000 })).toBe(50)
  })
})

// ---------------------------------------------------------------------------
// generateGridLines (tested indirectly via Heatbed)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// calcZoomToBoundingBoxFactor
// ---------------------------------------------------------------------------

describe('calcZoomToBoundingBoxFactor', () => {
  it('300mm bed, 800×600 viewport, margin=2.0 → zoom > 0 and in reasonable range', () => {
    const camera = new THREE.PerspectiveCamera(45, 800 / 600)
    camera.position.set(300, -200, 300)
    camera.lookAt(0, 0, 0)

    const box = new THREE.Box3(
      new THREE.Vector3(-150, -150, 0),
      new THREE.Vector3(150, 150, 0),
    )
    const zoom = calcZoomToBoundingBoxFactor(
      camera, box, { width: 800, height: 600 }, 2.0,
    )
    expect(zoom).toBeGreaterThan(0)
    expect(zoom).toBeLessThan(10) // reasonable range
  })

  it('larger margin → smaller zoom (more whitespace)', () => {
    const camera = new THREE.PerspectiveCamera(45, 800 / 600)
    camera.position.set(300, -200, 300)
    camera.lookAt(0, 0, 0)
    const box = new THREE.Box3(
      new THREE.Vector3(-150, -150, 0),
      new THREE.Vector3(150, 150, 0),
    )

    const z2 = calcZoomToBoundingBoxFactor(camera, box, { width: 800, height: 600 }, 2.0)
    const z125 = calcZoomToBoundingBoxFactor(camera, box, { width: 800, height: 600 }, 1.25)
    expect(z2).toBeLessThan(z125) // margin=2.0 → more whitespace → smaller zoom
  })

  it('returns -1 for degenerate (zero-size) box', () => {
    const camera = new THREE.PerspectiveCamera(45, 800 / 600)
    camera.position.set(0, 0, 10)
    const box = new THREE.Box3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 0),
    )
    expect(calcZoomToBoundingBoxFactor(camera, box, { width: 800, height: 600 }, 2.0)).toBe(-1)
  })
})


// =============================================================================
// Component tests — Heatbed class
// =============================================================================

describe('Heatbed', () => {
  let heatbed: Heatbed

  beforeEach(() => {
    heatbed = new Heatbed({ dimensions: { width: 300, depth: 300 } })
  })

  afterEach(() => {
    heatbed.dispose()
  })

  // -------------------------------------------------------------------------
  // Construction
  // -------------------------------------------------------------------------

  it('creates a group named Heatbed', () => {
    expect(heatbed.group).toBeInstanceOf(THREE.Group)
    expect(heatbed.group.name).toBe('Heatbed')
  })

  it('creates a plane mesh and grid lines on construction', () => {
    expect(heatbed.group.children.length).toBe(2)
    expect(heatbed.group.children[0]).toBeInstanceOf(THREE.Mesh)
    expect(heatbed.group.children[1]).toBeInstanceOf(THREE.LineSegments)
  })

  it('plane uses MeshBasicMaterial with FrontSide and depthWrite:false', () => {
    const mesh = heatbed.group.children[0] as THREE.Mesh
    const mat = mesh.material as THREE.MeshBasicMaterial
    expect(mat).toBeInstanceOf(THREE.MeshBasicMaterial)
    expect(mat.side).toBe(THREE.FrontSide)
    expect(mat.depthWrite).toBe(false)
  })

  it('plane is at GROUND_Z (-0.001)', () => {
    const mesh = heatbed.group.children[0] as THREE.Mesh
    expect(mesh.position.z).toBeCloseTo(GROUND_Z)
  })

  it('grid lines use LineBasicMaterial with depthWrite:false', () => {
    const lines = heatbed.group.children[1] as THREE.LineSegments
    const mat = lines.material as THREE.LineBasicMaterial
    expect(mat).toBeInstanceOf(THREE.LineBasicMaterial)
    expect(mat.depthWrite).toBe(false)
  })

  it('grid lines are at GRIDLINE_Z (-0.002)', () => {
    const lines = heatbed.group.children[1] as THREE.LineSegments
    const pos = lines.geometry.getAttribute('position') as THREE.BufferAttribute
    for (let vi = 0; vi < pos.count; vi++) {
      expect(pos.getZ(vi)).toBeCloseTo(GRIDLINE_Z)
    }
  })

  it('default size is 300mm', () => {
    expect(heatbed.size).toBe(300)
  })

  it('uses default unselected colors', () => {
    const mesh = heatbed.group.children[0] as THREE.Mesh
    const mat = mesh.material as THREE.MeshBasicMaterial
    expect(mat.color.getHex()).toBe(DEFAULT_BED_COLORS.unselected.getHex())
  })

  // -------------------------------------------------------------------------
  // setVisible
  // -------------------------------------------------------------------------

  it('starts visible by default', () => {
    expect(heatbed.visible).toBe(true)
    expect(heatbed.group.visible).toBe(true)
  })

  it('setVisible(false) hides group', () => {
    heatbed.setVisible(false)
    expect(heatbed.visible).toBe(false)
    expect(heatbed.group.visible).toBe(false)
  })

  it('setVisible(true) shows group', () => {
    heatbed.setVisible(false)
    heatbed.setVisible(true)
    expect(heatbed.visible).toBe(true)
    expect(heatbed.group.visible).toBe(true)
  })

  // -------------------------------------------------------------------------
  // setConfig / setSize
  // -------------------------------------------------------------------------

  it('setConfig with new dimensions rebuilds geometry', () => {
    heatbed.setConfig({ dimensions: { width: 500, depth: 500 } })
    expect(heatbed.size).toBe(500)
  })

  it.each(SUPPORTED_BED_SIZES)('%i size → bbox correct', (size) => {
    heatbed.setConfig({ dimensions: { width: size, depth: size } })
    const box = heatbed.getBoundingBox()
    const h = size / 2
    expect(box.max.x).toBeCloseTo(h)
    expect(box.min.x).toBeCloseTo(-h)
    expect(box.max.y).toBeCloseTo(h)
    expect(box.min.y).toBeCloseTo(-h)
  })

  it('grid line count for 200mm/10mm: 21H + 21V + 4 contour = 46 segments', () => {
    heatbed.setConfig({ dimensions: { width: 200, depth: 200 } })
    const lines = heatbed.group.children[1] as THREE.LineSegments
    const pos = lines.geometry.getAttribute('position') as THREE.BufferAttribute
    // Each segment = 2 points × 3 components = 6 floats. 46 segments = 276 floats.
    expect(pos.count).toBe(46 * 2)
  })

  it('all grid line vertices for size 200 within [-100, 100]', () => {
    heatbed.setConfig({ dimensions: { width: 200, depth: 200 } })
    const lines = heatbed.group.children[1] as THREE.LineSegments
    const pos = lines.geometry.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      expect(x).toBeGreaterThanOrEqual(-101)
      expect(x).toBeLessThanOrEqual(101)
      expect(y).toBeGreaterThanOrEqual(-101)
      expect(y).toBeLessThanOrEqual(101)
    }
  })

  // -------------------------------------------------------------------------
  // setSelected
  // -------------------------------------------------------------------------

  it('setSelected(true) switches to selected colors', () => {
    heatbed.setSelected(true)
    const mesh = heatbed.group.children[0] as THREE.Mesh
    const mat = mesh.material as THREE.MeshBasicMaterial
    expect(mat.color.getHex()).toBe(DEFAULT_BED_COLORS.selected.getHex())

    const gridMat = (heatbed.group.children[1] as THREE.LineSegments)
      .material as THREE.LineBasicMaterial
    expect(gridMat.color.getHex()).toBe(DEFAULT_BED_COLORS.gridLineSelected.getHex())
  })

  it('setSelected(false) switches back to unselected colors', () => {
    heatbed.setSelected(true)
    heatbed.setSelected(false)
    const mesh = heatbed.group.children[0] as THREE.Mesh
    const mat = mesh.material as THREE.MeshBasicMaterial
    expect(mat.color.getHex()).toBe(DEFAULT_BED_COLORS.unselected.getHex())
  })

  // -------------------------------------------------------------------------
  // setDarkMode
  // -------------------------------------------------------------------------

  it('setDarkMode(true) switches to dark unselected color', () => {
    heatbed.setDarkMode(true)
    const mesh = heatbed.group.children[0] as THREE.Mesh
    const mat = mesh.material as THREE.MeshBasicMaterial
    expect(mat.color.getHex()).toBe(DEFAULT_BED_COLORS.unselectedDark.getHex())
  })

  it('dark mode + selected: selected color wins', () => {
    heatbed.setDarkMode(true)
    heatbed.setSelected(true)
    const mesh = heatbed.group.children[0] as THREE.Mesh
    const mat = mesh.material as THREE.MeshBasicMaterial
    expect(mat.color.getHex()).toBe(DEFAULT_BED_COLORS.selected.getHex())
  })

  // -------------------------------------------------------------------------
  // getBoundingBox
  // -------------------------------------------------------------------------

  it('getBoundingBox for size 300 returns [-150,-150,0] → [150,150,0]', () => {
    const box = heatbed.getBoundingBox()
    expect(box.min.x).toBeCloseTo(-150)
    expect(box.min.y).toBeCloseTo(-150)
    expect(box.min.z).toBe(0)
    expect(box.max.x).toBeCloseTo(150)
    expect(box.max.y).toBeCloseTo(150)
    expect(box.max.z).toBe(0)
  })

  // -------------------------------------------------------------------------
  // dispose
  // -------------------------------------------------------------------------

  it('dispose clears group children', () => {
    expect(heatbed.group.children.length).toBeGreaterThan(0)
    heatbed.dispose()
    expect(heatbed.group.children.length).toBe(0)
  })

  // -------------------------------------------------------------------------
  // setPosition
  // -------------------------------------------------------------------------

  it('setPosition moves group in XY plane', () => {
    heatbed.setPosition(100, 200)
    expect(heatbed.group.position.x).toBe(100)
    expect(heatbed.group.position.y).toBe(200)
    expect(heatbed.group.position.z).toBe(0)
  })

  // -------------------------------------------------------------------------
  // getWorldBoundingBox
  // -------------------------------------------------------------------------

  it('getWorldBoundingBox accounts for group position', () => {
    heatbed.setPosition(50, 50)
    const box = heatbed.getWorldBoundingBox()
    // size 300 → half = 150, offset by (50, 50)
    expect(box.min.x).toBeCloseTo(-150 + 50)
    expect(box.min.y).toBeCloseTo(-150 + 50)
    expect(box.max.x).toBeCloseTo(150 + 50)
    expect(box.max.y).toBeCloseTo(150 + 50)
  })

  // -------------------------------------------------------------------------
  // Rectangular bed
  // -------------------------------------------------------------------------

  it('rectangular bed: width ≠ depth', () => {
    const rect = new Heatbed({ dimensions: { width: 256, depth: 180 } })
    expect(rect.width).toBe(256)
    expect(rect.depth).toBe(180)
    expect(rect.size).toBe(256) // max of width/depth

    const box = rect.getBoundingBox()
    expect(box.max.x).toBeCloseTo(128)
    expect(box.min.x).toBeCloseTo(-128)
    expect(box.max.y).toBeCloseTo(90)
    expect(box.min.y).toBeCloseTo(-90)

    rect.dispose()
  })

  it('rectangular grid lines stay within boundary', () => {
    const rect = new Heatbed({ dimensions: { width: 256, depth: 180 } })
    const lines = rect.group.children[1] as THREE.LineSegments
    const pos = lines.geometry.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      expect(x).toBeGreaterThanOrEqual(-129)
      expect(x).toBeLessThanOrEqual(129)
      expect(y).toBeGreaterThanOrEqual(-91)
      expect(y).toBeLessThanOrEqual(91)
    }
    rect.dispose()
  })

  // -------------------------------------------------------------------------
  // setLabel (requires DOM — skip in node environment)
  // -------------------------------------------------------------------------

  const itDOM = typeof document !== 'undefined' ? it : it.skip

  itDOM('setLabel creates a flat label mesh at bottom-right', () => {
    heatbed.setLabel('200 × 200 mm')
    // Should have 3 children now: plane, grid lines, label mesh
    expect(heatbed.group.children.length).toBe(3)
    const label = heatbed.group.children[2]
    expect(label).toBeInstanceOf(THREE.Mesh)
    // Position should be near bottom-right (inside the plate)
    expect(label.position.x).toBeGreaterThan(0)
    expect(label.position.y).toBeLessThan(0)
    // Z should be near GROUND_Z (on the plate surface)
    expect(label.position.z).toBeCloseTo(-0.001, 2)
  })

  itDOM('setLabel with empty string removes the label', () => {
    heatbed.setLabel('200 × 200 mm')
    expect(heatbed.group.children.length).toBe(3)
    heatbed.setLabel('')
    expect(heatbed.group.children.length).toBe(2)
  })

  itDOM('setLabel replaces existing label', () => {
    heatbed.setLabel('200 × 200 mm')
    const firstLabel = heatbed.group.children[2]
    heatbed.setLabel('300 × 300 mm')
    // Should still have 3 children, but label replaced
    expect(heatbed.group.children.length).toBe(3)
    expect(heatbed.group.children[2]).not.toBe(firstLabel)
  })

  itDOM('setLabel on rectangular bed positions inside boundary', () => {
    const rect = new Heatbed({ dimensions: { width: 256, depth: 180 } })
    rect.setLabel('256 × 180 mm')
    const label = rect.group.children[2] as THREE.Mesh
    // Label should be inside the plate: x < width/2, y > -depth/2
    expect(label.position.x).toBeLessThan(128)
    expect(label.position.y).toBeGreaterThan(-90)
    rect.dispose()
  })
})

// =============================================================================
// squareBedDimensions
// =============================================================================

describe('squareBedDimensions', () => {
  it('creates square dimensions from a single number', () => {
    const dims = squareBedDimensions(300)
    expect(dims.width).toBe(300)
    expect(dims.depth).toBe(300)
  })
})

// =============================================================================
// computePlateLayout
// =============================================================================

describe('computePlateLayout', () => {
  it('single plate → centered at origin', () => {
    const plates = new Map<number, { width: number; depth: number }>()
    plates.set(1, { width: 256, depth: 256 })
    const layout = computePlateLayout(plates)
    expect(layout).toHaveLength(1)
    expect(layout[0].plateId).toBe(1)
    expect(layout[0].centerX).toBeCloseTo(0)
    expect(layout[0].centerY).toBeCloseTo(0)
  })

  it('two plates → side by side left-right', () => {
    const plates = new Map<number, { width: number; depth: number }>()
    plates.set(1, { width: 256, depth: 256 })
    plates.set(2, { width: 256, depth: 256 })
    const layout = computePlateLayout(plates)
    expect(layout).toHaveLength(2)
    // Plate 1: at -128 - 25 = -153... no wait
    // Two 256mm wide plates with 50mm spacing:
    // total width = 256 + 50 + 256 = 562, half = 281
    // centerX of plate 1 = -281 + 128 = -153
    // centerX of plate 2 = -153 + 256 + 50 = 153
    expect(layout[0].plateId).toBe(1)
    expect(layout[0].centerX).toBeCloseTo(-153)
    expect(layout[0].centerY).toBeCloseTo(0)
    expect(layout[1].plateId).toBe(2)
    expect(layout[1].centerX).toBeCloseTo(153)
    expect(layout[1].centerY).toBeCloseTo(0)
  })

  it('three plates → one row', () => {
    const plates = new Map<number, { width: number; depth: number }>()
    plates.set(1, { width: 200, depth: 200 })
    plates.set(2, { width: 200, depth: 200 })
    plates.set(3, { width: 200, depth: 200 })
    const layout = computePlateLayout(plates)
    expect(layout).toHaveLength(3)
    // All same Y
    expect(layout[0].centerY).toBe(0)
    expect(layout[1].centerY).toBe(0)
    expect(layout[2].centerY).toBe(0)
  })

  it('four plates → wrap to two rows (3 per row default)', () => {
    const plates = new Map<number, { width: number; depth: number }>()
    plates.set(1, { width: 200, depth: 200 })
    plates.set(2, { width: 200, depth: 200 })
    plates.set(3, { width: 200, depth: 200 })
    plates.set(4, { width: 200, depth: 200 })
    const layout = computePlateLayout(plates)
    expect(layout).toHaveLength(4)
    // Plates 1-3 in row 0, plate 4 in row 1
    const row0 = layout.slice(0, 3)
    const row1 = layout.slice(3)
    for (const e of row0) expect(e.centerY).toBe(0)
    for (const e of row1) expect(e.centerY).toBe(250) // 200 depth + 50 spacing
  })

  it('plates sorted by plateId', () => {
    const plates = new Map<number, { width: number; depth: number }>()
    plates.set(3, { width: 256, depth: 256 })
    plates.set(1, { width: 256, depth: 256 })
    plates.set(2, { width: 256, depth: 256 })
    const layout = computePlateLayout(plates)
    expect(layout.map(e => e.plateId)).toEqual([1, 2, 3])
  })

  it('empty map returns empty array', () => {
    const plates = new Map<number, { width: number; depth: number }>()
    expect(computePlateLayout(plates)).toEqual([])
  })
})
