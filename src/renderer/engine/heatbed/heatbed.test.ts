import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import {
  autoSelectBedSize,
  calculateGridStep,
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
    expect(autoSelectBedSize(bbox)).toBe(200)
  })

  it('Bambu X1C standard model (256mm) → 300mm', () => {
    const bbox = new THREE.Box3(
      new THREE.Vector3(-0.128, -0.128, 0),
      new THREE.Vector3(0.128, 0.128, 0.1),
    )
    expect(autoSelectBedSize(bbox)).toBe(300)
  })

  it('model near but under 300mm threshold (240mm) → 300mm', () => {
    const bbox = new THREE.Box3(
      new THREE.Vector3(-0.12, -0.12, 0),
      new THREE.Vector3(0.12, 0.12, 0.05),
    )
    expect(autoSelectBedSize(bbox)).toBe(300)
  })

  it('350mm model → 500mm', () => {
    const bbox = new THREE.Box3(
      new THREE.Vector3(-0.175, -0.175, 0),
      new THREE.Vector3(0.175, 0.175, 0.05),
    )
    expect(autoSelectBedSize(bbox)).toBe(500)
  })

  it('oversized model → 1000mm fallback', () => {
    const bbox = new THREE.Box3(
      new THREE.Vector3(-0.5, -0.5, 0),
      new THREE.Vector3(0.5, 0.5, 0.1),
    )
    expect(autoSelectBedSize(bbox)).toBe(1000)
  })

  it('boundary: model 260mm (300-20pad×2) → 300mm', () => {
    const bbox = new THREE.Box3(
      new THREE.Vector3(-0.13, -0.13, 0),
      new THREE.Vector3(0.13, 0.13, 0.01),
    )
    expect(autoSelectBedSize(bbox)).toBe(300)
  })
})

// ---------------------------------------------------------------------------
// calculateGridStep
// ---------------------------------------------------------------------------

describe('calculateGridStep', () => {
  it('200mm → 10mm (20 cells)', () => {
    expect(calculateGridStep(200)).toBe(10)
  })
  it('300mm → 10mm (30 cells)', () => {
    expect(calculateGridStep(300)).toBe(10)
  })
  it('500mm → 20mm (25 cells)', () => {
    expect(calculateGridStep(500)).toBe(20)
  })
  it('1000mm → 50mm (20 cells)', () => {
    expect(calculateGridStep(1000)).toBe(50)
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
    heatbed = new Heatbed({ size: 300 })
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

  it('setConfig with new size rebuilds geometry', () => {
    heatbed.setConfig({ size: 500 })
    expect(heatbed.size).toBe(500)
  })

  it.each(SUPPORTED_BED_SIZES)('%imm size → bounding box correct (in meters)', (size) => {
    heatbed.setConfig({ size })
    const box = heatbed.getBoundingBox()
    const h = size / 2000  // mm → meters, then /2
    expect(box.max.x).toBeCloseTo(h)
    expect(box.min.x).toBeCloseTo(-h)
    expect(box.max.y).toBeCloseTo(h)
    expect(box.min.y).toBeCloseTo(-h)
  })

  it('grid line count for 200mm/10mm: 21H + 21V + 4 contour = 46 segments', () => {
    heatbed.setConfig({ size: 200 })
    const lines = heatbed.group.children[1] as THREE.LineSegments
    const pos = lines.geometry.getAttribute('position') as THREE.BufferAttribute
    // Each segment = 2 points × 3 components = 6 floats. 46 segments = 276 floats.
    expect(pos.count).toBe(46 * 2)
  })

  it('all grid line vertices for 200mm within [-0.1, 0.1] (meters)', () => {
    heatbed.setConfig({ size: 200 })
    const lines = heatbed.group.children[1] as THREE.LineSegments
    const pos = lines.geometry.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      expect(x).toBeGreaterThanOrEqual(-0.11)  // fp tolerance
      expect(x).toBeLessThanOrEqual(0.11)
      expect(y).toBeGreaterThanOrEqual(-0.11)
      expect(y).toBeLessThanOrEqual(0.11)
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

  it('getBoundingBox for 300mm returns [-0.15,-0.15,0] → [0.15,0.15,0]', () => {
    const box = heatbed.getBoundingBox()
    expect(box.min.x).toBeCloseTo(-0.15)
    expect(box.min.y).toBeCloseTo(-0.15)
    expect(box.min.z).toBe(0)
    expect(box.max.x).toBeCloseTo(0.15)
    expect(box.max.y).toBeCloseTo(0.15)
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
})
