import * as THREE from 'three'

export type ShadowFrustum = {
  left: number
  right: number
  top: number
  bottom: number
  near: number
  far: number
}

/** Compute tight shadow camera frustum and near/far for a model bounding box. */
export function computeShadowFrustum(
  bbox: [number, number, number, number, number, number],
  lightPosition: THREE.Vector3,
): ShadowFrustum {
  const extent = Math.max(
    bbox[3] - bbox[0],
    bbox[4] - bbox[1],
    bbox[5] - bbox[2],
  )

  const half = Math.max(extent * 4, 3)

  // Tighten near/far so the shadow map depth range is not wasted on empty space.
  // The old static near=0.5 / far=500 (ratio 1000:1) destroyed depth precision
  // for tiny models whose shadow depth span was < 1 texel.
  const center = new THREE.Vector3(
    (bbox[0] + bbox[3]) / 2,
    (bbox[1] + bbox[4]) / 2,
    (bbox[2] + bbox[5]) / 2,
  )
  const distToCenter = lightPosition.distanceTo(center)

  // Depth margin must cover the model's depth span (extent) plus the shadow
  // floor below the model. Scale with extent, not frustum half, so the
  // depth range stays proportional to what the model actually occupies.
  const depthMargin = Math.max(extent * 2 + 5, 5)

  // Keep far/near ratio ≤ ~30 for good shadow map depth precision.
  // near is at least depthMargin / 20 so it doesn't get too close to zero
  // relative to the depth range.
  const near = Math.max(distToCenter - depthMargin, depthMargin / 20, 0.05)
  const far = Math.max(near + 0.1, distToCenter + depthMargin)

  return { left: -half, right: half, top: half, bottom: -half, near, far }
}
