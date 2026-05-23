import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { ShadowFloor } from './ShadowFloor'

describe('ShadowFloor', () => {
  let floor: ShadowFloor

  beforeEach(() => {
    floor = new ShadowFloor()
  })

  afterEach(() => {
    floor.dispose()
  })

  // ---------------------------------------------------------------------------
  // Construction
  // ---------------------------------------------------------------------------

  it('creates a group named shadowFloor', () => {
    expect(floor.group).toBeInstanceOf(THREE.Group)
    expect(floor.group.name).toBe('shadowFloor')
  })

  it('starts hidden by default', () => {
    expect(floor.group.visible).toBe(false)
  })

  it('uses ShadowMaterial with correct defaults', () => {
    // Configure to create the plane
    floor.configure([-1, -1, -1, 1, 1, 1], 'y')
    const children = floor.group.children
    expect(children.length).toBe(1)
    const mat = (children[0] as THREE.Mesh).material as THREE.ShadowMaterial
    expect(mat).toBeInstanceOf(THREE.ShadowMaterial)
    expect(mat.depthWrite).toBe(false)
    expect(mat.transparent).toBe(true)
    expect(mat.opacity).toBe(0.5)
  })

  // ---------------------------------------------------------------------------
  // configure
  // ---------------------------------------------------------------------------

  it('creates a plane for Y-up orientation', () => {
    floor.configure([-2, -1, -3, 2, 1, 3], 'y')
    const plane = floor.group.children[0] as THREE.Mesh
    expect(plane).toBeInstanceOf(THREE.Mesh)
    expect(plane.geometry).toBeInstanceOf(THREE.PlaneGeometry)
    expect(plane.receiveShadow).toBe(true)
    // Plane should be rotated to horizontal for Y-up
    expect(plane.rotation.x).toBeCloseTo(-Math.PI / 2)
    // Centered in XZ, at lowest Y minus epsilon
    expect(plane.position.x).toBeCloseTo(0)
    expect(plane.position.z).toBeCloseTo(0)
    // Lowest Y is -1, with epsilon offset
    expect(plane.position.y).toBeLessThan(-1)
    expect(plane.position.y).toBeGreaterThan(-1.1)
  })

  it('creates a plane for Z-up orientation', () => {
    floor.configure([-2, -3, -1, 2, 3, 1], 'z')
    const plane = floor.group.children[0] as THREE.Mesh
    expect(plane).toBeInstanceOf(THREE.Mesh)
    // Plane is horizontal in XY for Z-up (no rotation needed)
    expect(plane.rotation.x).toBe(0)
    // Centered in XY, at lowest Z minus epsilon
    expect(plane.position.x).toBeCloseTo(0)
    expect(plane.position.y).toBeCloseTo(0)
    // Lowest Z is -1, with epsilon offset
    expect(plane.position.z).toBeLessThan(-1)
    expect(plane.position.z).toBeGreaterThan(-1.1)
  })

  it('plane size is 6x the model extent', () => {
    // extent = max(4, 6, 2) = 6
    floor.configure([-2, -3, -1, 2, 3, 1], 'y')
    const plane = floor.group.children[0] as THREE.Mesh
    const geo = plane.geometry as THREE.PlaneGeometry
    // PlaneGeometry parameters are (width, height) = (6*6, 6*6) = (36, 36)
    expect(geo.parameters.width).toBe(36)
    expect(geo.parameters.height).toBe(36)
  })

  it('replaces old plane on re-configure', () => {
    floor.configure([-1, -1, -1, 1, 1, 1], 'y')
    const first = floor.group.children[0] as THREE.Mesh
    expect(floor.group.children.length).toBe(1)

    floor.configure([-2, -2, -2, 2, 2, 2], 'y')
    expect(floor.group.children.length).toBe(1)
    expect(floor.group.children[0]).not.toBe(first)
  })

  // ---------------------------------------------------------------------------
  // setEnabled
  // ---------------------------------------------------------------------------

  it('setEnabled toggles group visibility', () => {
    expect(floor.group.visible).toBe(false)
    floor.setEnabled(true)
    expect(floor.group.visible).toBe(true)
    floor.setEnabled(false)
    expect(floor.group.visible).toBe(false)
  })

  // ---------------------------------------------------------------------------
  // setOpacity
  // ---------------------------------------------------------------------------

  it('setOpacity updates ShadowMaterial opacity', () => {
    floor.configure([-1, -1, -1, 1, 1, 1], 'y')
    floor.setOpacity(0.75)
    const mat = (floor.group.children[0] as THREE.Mesh).material as THREE.ShadowMaterial
    expect(mat.opacity).toBe(0.75)
  })

  it('setOpacity clamps to [0, 1]', () => {
    floor.configure([-1, -1, -1, 1, 1, 1], 'y')
    floor.setOpacity(-0.5)
    const mat = (floor.group.children[0] as THREE.Mesh).material as THREE.ShadowMaterial
    expect(mat.opacity).toBe(0)

    floor.setOpacity(1.5)
    expect(mat.opacity).toBe(1)
  })

  // ---------------------------------------------------------------------------
  // dispose
  // ---------------------------------------------------------------------------

  it('dispose clears geometry and children', () => {
    floor.configure([-1, -1, -1, 1, 1, 1], 'y')
    expect(floor.group.children.length).toBe(1)

    floor.dispose()
    expect(floor.group.children.length).toBe(0)
  })
})
