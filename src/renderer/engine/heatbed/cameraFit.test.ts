import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { computeCameraFitTarget } from './cameraFit'

/** Create a minimal PerspectiveCamera for testing */
function makeCam(fov = 50): THREE.PerspectiveCamera {
  return new THREE.PerspectiveCamera(fov, 1)
}

/**
 * Compute the camera's screen-right direction in world space.
 * camera.right = normalize(lookDir × up)
 * If this is parallel to +X, the world X-axis is horizontal-right on screen.
 */
function cameraRightDirection(
  position: THREE.Vector3,
  target: THREE.Vector3,
  up: THREE.Vector3,
): THREE.Vector3 {
  const lookDir = new THREE.Vector3().subVectors(target, position).normalize()
  return new THREE.Vector3().crossVectors(lookDir, up).normalize()
}

describe('computeCameraFitTarget', () => {
  const box = new THREE.Box3(new THREE.Vector3(-10, -10, -10), new THREE.Vector3(10, 10, 10))
  const viewport = { width: 800, height: 600 }

  // ── Z-up ────────────────────────────────────────────────

  it('Z-up: camera is above target (z > target.z)', () => {
    const cam = makeCam()
    const r = computeCameraFitTarget(cam, box, viewport, 'model', 'z')
    expect(r).not.toBeNull()
    expect(r!.position.z).toBeGreaterThan(r!.target.z)
  })

  it('Z-up: camera is in front of target (y < target.y)', () => {
    const cam = makeCam()
    const r = computeCameraFitTarget(cam, box, viewport, 'model', 'z')
    expect(r).not.toBeNull()
    expect(r!.position.y).toBeLessThan(r!.target.y)
  })

  it('Z-up: no X offset (camera in YZ plane)', () => {
    const cam = makeCam()
    const r = computeCameraFitTarget(cam, box, viewport, 'model', 'z')
    expect(r).not.toBeNull()
    expect(r!.position.x).toBeCloseTo(r!.target.x, 5)
  })

  it('Z-up: camera.right points to +X → X-axis is horizontal-right on screen', () => {
    const cam = makeCam()
    const r = computeCameraFitTarget(cam, box, viewport, 'model', 'z')
    expect(r).not.toBeNull()
    const right = cameraRightDirection(r!.position, r!.target, new THREE.Vector3(0, 0, 1))
    // right should be (1, 0, 0) — purely +X
    expect(right.x).toBeCloseTo(1, 5)
    expect(Math.abs(right.y)).toBeLessThan(0.001)
    expect(Math.abs(right.z)).toBeLessThan(0.001)
  })

  // ── Y-up ────────────────────────────────────────────────

  it('Y-up: camera is above target (y > target.y)', () => {
    const cam = makeCam()
    const r = computeCameraFitTarget(cam, box, viewport, 'model', 'y')
    expect(r).not.toBeNull()
    expect(r!.position.y).toBeGreaterThan(r!.target.y)
  })

  it('Y-up: no X offset (camera in YZ plane)', () => {
    const cam = makeCam()
    const r = computeCameraFitTarget(cam, box, viewport, 'model', 'y')
    expect(r).not.toBeNull()
    expect(r!.position.x).toBeCloseTo(r!.target.x, 5)
  })

  it('Y-up: camera.right points to +X → X-axis is horizontal-right on screen', () => {
    const cam = makeCam()
    const r = computeCameraFitTarget(cam, box, viewport, 'model', 'y')
    expect(r).not.toBeNull()
    const right = cameraRightDirection(r!.position, r!.target, new THREE.Vector3(0, 1, 0))
    // right should be (1, 0, 0) — purely +X
    expect(right.x).toBeCloseTo(1, 5)
    expect(Math.abs(right.y)).toBeLessThan(0.001)
    expect(Math.abs(right.z)).toBeLessThan(0.001)
  })

  // ── Cross-mode consistency ──────────────────────────────

  it('Y-up position equals Z-up position rotated -π/2 around X', () => {
    const cam = makeCam()
    const rz = computeCameraFitTarget(cam, box, viewport, 'model', 'z')!
    const ry = computeCameraFitTarget(cam, box, viewport, 'model', 'y')!

    // UpAxisAnimator rotates Z-up camera by -π/2 around X to get Y-up.
    // (x, y, z) → (x, z, -y)
    const rotatedZUp = rz.position.clone().applyAxisAngle(
      new THREE.Vector3(1, 0, 0), -Math.PI / 2,
    )
    expect(ry.position.x).toBeCloseTo(rotatedZUp.x, 5)
    expect(ry.position.y).toBeCloseTo(rotatedZUp.y, 5)
    expect(ry.position.z).toBeCloseTo(rotatedZUp.z, 5)
  })

  it('Z-up and Y-up have same camera distance from target (zenith angle consistent)', () => {
    const cam = makeCam()
    const rz = computeCameraFitTarget(cam, box, viewport, 'model', 'z')
    const ry = computeCameraFitTarget(cam, box, viewport, 'model', 'y')
    expect(rz).not.toBeNull()
    expect(ry).not.toBeNull()
    const dz = rz!.position.distanceTo(rz!.target)
    const dy = ry!.position.distanceTo(ry!.target)
    expect(dz).toBeCloseTo(dy, 5)
  })

  it('Z-up and Y-up: zenith angle is ~45° (top-down)', () => {
    const cam = makeCam()
    for (const axis of ['z', 'y'] as const) {
      const r = computeCameraFitTarget(cam, box, viewport, 'model', axis)
      expect(r).not.toBeNull()
      // Angle between (camera-target) vector and the up-axis
      const offset = new THREE.Vector3().subVectors(r!.position, r!.target)
      const upVec = axis === 'y' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1)
      const angleRad = offset.angleTo(upVec)
      const angleDeg = THREE.MathUtils.radToDeg(angleRad)
      // should be ~45° (zenith angle from up-axis)
      expect(angleDeg).toBeCloseTo(45, 1)
    }
  })

  // ── Backward compat / edge cases ────────────────────────

  it('backward-compatible: default upAxis=z', () => {
    const cam = makeCam()
    const explicit = computeCameraFitTarget(cam, box, viewport, 'model', 'z')
    const implicit = computeCameraFitTarget(cam, box, viewport, 'model')
    expect(explicit).not.toBeNull()
    expect(implicit).not.toBeNull()
    expect(explicit!.position.x).toBeCloseTo(implicit!.position.x)
    expect(explicit!.position.y).toBeCloseTo(implicit!.position.y)
    expect(explicit!.position.z).toBeCloseTo(implicit!.position.z)
  })

  it('bed focus: collapses Z to 0 before computing', () => {
    const cam = makeCam()
    const r = computeCameraFitTarget(cam, box, viewport, 'bed', 'z')
    expect(r).not.toBeNull()
    expect(r!.target.z).toBe(0)
  })

  it('returns null for degenerate (zero-size) box', () => {
    const cam = makeCam()
    const point = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0))
    const r = computeCameraFitTarget(cam, point, viewport, 'model', 'z')
    expect(r).toBeNull()
  })
})
