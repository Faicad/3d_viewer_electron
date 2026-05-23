import * as THREE from 'three'

/**
 * An invisible plane that receives and displays shadows via `ShadowMaterial`.
 *
 * The plane is positioned just below the loaded model's bounding box and
 * scales with the model extent.  It is hidden by default — toggle via
 * `setEnabled()`.
 *
 * Usage:
 * ```ts
 * const floor = new ShadowFloor()
 * scene.add(floor.group)
 * floor.configure(bboxTuple, 'y')
 * floor.setEnabled(true)
 * ```
 */
export class ShadowFloor {
  private _group: THREE.Group
  private _plane: THREE.Mesh | null = null
  private _material: THREE.ShadowMaterial

  constructor() {
    this._material = new THREE.ShadowMaterial({
      opacity: 0.5,
      depthWrite: false,
      transparent: true,
    })

    this._group = new THREE.Group()
    this._group.name = 'shadowFloor'
    this._group.visible = false
  }

  /** The group to attach to the scene. */
  get group(): THREE.Group {
    return this._group
  }

  /**
   * (Re)create the plane geometry so it covers the model footprint.
   *
   * @param bbox  [minX, minY, minZ, maxX, maxY, maxZ]
   * @param upAxis  'y' (Three.js default) or 'z' (CAD)
   */
  configure(
    bbox: [number, number, number, number, number, number],
    upAxis: 'y' | 'z',
  ): void {
    const [minX, minY, minZ, maxX, maxY, maxZ] = bbox
    const extent = Math.max(
      maxX - minX,
      maxY - minY,
      maxZ - minZ,
    )
    const size = extent * 6
    const epsilon = Math.max(extent * 0.01, 0.015)

    // Remove existing plane
    if (this._plane) {
      this._plane.geometry.dispose()
      this._group.remove(this._plane)
    }

    const geo = new THREE.PlaneGeometry(size, size)
    const plane = new THREE.Mesh(geo, this._material)
    plane.receiveShadow = true

    if (upAxis === 'z') {
      // Z-up: plane is already horizontal in XY, position at lowest Z
      plane.position.set(
        (minX + maxX) / 2,
        (minY + maxY) / 2,
        minZ - epsilon,
      )
    } else {
      // Y-up: rotate plane to horizontal (XZ), position at lowest Y
      plane.rotation.x = -Math.PI / 2
      plane.position.set(
        (minX + maxX) / 2,
        minY - epsilon,
        (minZ + maxZ) / 2,
      )
    }

    this._plane = plane
    this._group.add(plane)
  }

  /** Show or hide the shadow floor. */
  setEnabled(enabled: boolean): void {
    this._group.visible = enabled
  }

  /** Adjust shadow opacity (0 = invisible, 1 = fully opaque dark). */
  setOpacity(opacity: number): void {
    this._material.opacity = Math.max(0, Math.min(1, opacity))
    this._material.needsUpdate = true
  }

  /** Release all GPU resources. */
  dispose(): void {
    if (this._plane) {
      this._plane.geometry.dispose()
    }
    this._material.dispose()
    this._group.clear()
    this._plane = null
  }
}
