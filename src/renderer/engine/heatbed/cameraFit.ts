import * as THREE from 'three'
import { MARGIN_BED, MARGIN_MODEL } from './types'

/**
 * OrcaSlicer Camera::calc_zoom_to_bounding_box_factor() — ported to Three.js.
 *
 * Projects the 8 corners of a bounding box onto the camera's view plane,
 * then computes the zoom factor that makes the box exactly fill the viewport.
 * Larger zoom = object appears larger on screen.
 *
 * @param camera   - Three.js PerspectiveCamera
 * @param box      - World-space bounding box
 * @param viewport - Viewport pixel dimensions { width, height }
 * @param marginFactor - Margin factor (bed=2.0, model=1.25)
 * @returns zoom factor (>0), or -1 if box is degenerate
 */
export function calcZoomToBoundingBoxFactor(
  camera: THREE.PerspectiveCamera,
  box: THREE.Box3,
  viewport: { width: number; height: number },
  marginFactor: number,
): number {
  // 1. Max dimension of the bounding box
  const boxSize = new THREE.Vector3()
  box.getSize(boxSize)
  const maxBoxSize = Math.max(boxSize.x, boxSize.y, boxSize.z)
  if (maxBoxSize === 0) return -1

  // 2. Camera local coordinate axes
  const forward = new THREE.Vector3()
  camera.getWorldDirection(forward)  // view direction

  const right = new THREE.Vector3()
  right.crossVectors(forward, camera.up).normalize()  // right = forward × up

  const up = new THREE.Vector3()
  up.crossVectors(right, forward).normalize()  // up = right × forward

  // 3. Bounding box center
  const boxCenter = new THREE.Vector3()
  box.getCenter(boxCenter)

  // 4. 8 corners of the box
  const vertices: THREE.Vector3[] = [
    box.min.clone(),
    new THREE.Vector3(box.max.x, box.min.y, box.min.z),
    new THREE.Vector3(box.max.x, box.max.y, box.min.z),
    new THREE.Vector3(box.min.x, box.max.y, box.min.z),
    new THREE.Vector3(box.min.x, box.min.y, box.max.z),
    new THREE.Vector3(box.max.x, box.min.y, box.max.z),
    box.max.clone(),
    new THREE.Vector3(box.min.x, box.max.y, box.max.z),
  ]

  // 5. Project onto plane perpendicular to view direction
  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity

  for (const v of vertices) {
    // pos = v - center (relative vector)
    const pos = v.clone().sub(boxCenter)
    // Project onto plane perpendicular to forward:
    //   proj = pos - (pos·forward) * forward
    const dotForward = pos.dot(forward)
    const projOnPlane = pos.clone().addScaledVector(forward, -dotForward)
    // Screen-space coordinates
    const screenX = projOnPlane.dot(right)
    const screenY = projOnPlane.dot(up)
    minX = Math.min(minX, screenX)
    maxX = Math.max(maxX, screenX)
    minY = Math.min(minY, screenY)
    maxY = Math.max(maxY, screenY)
  }

  // 6. Apply margin
  const dx = (maxX - minX) * marginFactor
  const dy = (maxY - minY) * marginFactor

  // 7. zoom = min(viewport_w / dx, viewport_h / dy)
  const zoomX = viewport.width / dx
  const zoomY = viewport.height / dy
  return Math.min(zoomX, zoomY)
}

/**
 * OrcaSlicer Camera::zoom_to_box() + set_default_orientation() — ported to Three.js.
 *
 * Computes the camera position and target for a top-front view (45° zenith, 45° azimuth)
 * calculated to fit the target box in view with the given margin.
 * Does NOT mutate the camera — caller decides how to apply.
 *
 * @param camera      - Three.js PerspectiveCamera (read for fov, not mutated)
 * @param targetBox   - World-space bounding box to focus on
 * @param viewport    - Viewport pixel dimensions
 * @param focusTarget - 'bed' or 'model' (controls margin factor)
 * @returns {{ position: THREE.Vector3, target: THREE.Vector3 }} computed camera position and lookAt target
 */
export function computeCameraFitTarget(
  camera: THREE.PerspectiveCamera,
  targetBox: THREE.Box3,
  viewport: { width: number; height: number },
  focusTarget: 'bed' | 'model',
): { position: THREE.Vector3; target: THREE.Vector3 } | null {
  const marginFactor = focusTarget === 'bed' ? MARGIN_BED : MARGIN_MODEL

  // For bed focus, collapse Z range to 0 (we only care about XY plane)
  const box = targetBox.clone()
  if (focusTarget === 'bed') {
    box.min.z = 0
    box.max.z = 0
  }

  // Step 1: compute zoom factor
  const zoom = calcZoomToBoundingBoxFactor(camera, box, viewport, marginFactor)
  if (zoom <= 0) return null

  // Step 2: target = box center
  const target = new THREE.Vector3()
  box.getCenter(target)

  // Step 3: compute camera distance from zoom factor.
  // OrcaSlicer: visible world-width at m_distance = viewport_w / m_zoom.
  // Three.js: visible world-width at distance d = 2 * d * tan(fov/2).
  // Equating: viewport_w / zoom = 2 * d * tan(fov/2) → d = viewport_w / (2 * zoom * tan(fov/2))
  const fovRad = THREE.MathUtils.degToRad(camera.fov)
  const distance = Math.max(
    viewport.width / (2 * zoom * Math.tan(fovRad / 2)),
    camera.near * 10,  // minimum safe distance
  )

  // Step 4: top-front orientation (OrcaSlicer default)
  //   theta = -45° (zenith), phi = 45° (azimuth)
  const DEFAULT_ZENIT_DEG = 45
  const DEFAULT_PHI_DEG = 45
  const theta = THREE.MathUtils.degToRad(-DEFAULT_ZENIT_DEG)
  const phi = THREE.MathUtils.degToRad(DEFAULT_PHI_DEG)
  const sinTheta = Math.sin(theta)
  const cosTheta = Math.cos(theta)

  const position = new THREE.Vector3(
    target.x + distance * sinTheta * Math.sin(phi),
    target.y + distance * sinTheta * Math.cos(phi),
    target.z + distance * cosTheta,
  )

  return { position, target }
}

/**
 * OrcaSlicer Camera::zoom_to_box() + set_default_orientation() — ported to Three.js.
 *
 * Sets the camera to a top-front view (45° zenith, 45° azimuth) at a distance
 * calculated to fit the target box in view with the given margin.
 * Mutates camera.position and calls camera.lookAt().
 *
 * @param camera      - Three.js PerspectiveCamera
 * @param targetBox   - World-space bounding box to focus on
 * @param viewport    - Viewport pixel dimensions
 * @param focusTarget - 'bed' or 'model' (controls margin factor)
 */
export function fitCameraToTarget(
  camera: THREE.PerspectiveCamera,
  targetBox: THREE.Box3,
  viewport: { width: number; height: number },
  focusTarget: 'bed' | 'model',
): void {
  const result = computeCameraFitTarget(camera, targetBox, viewport, focusTarget)
  if (!result) return
  camera.position.copy(result.position)
  camera.lookAt(result.target)
}
