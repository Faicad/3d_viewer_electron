import * as THREE from 'three'

const ROOM_SIZE = 10
const ROOM_HEIGHT = 8
const COVE_RADIUS = 1.5

/**
 * Procedural studio environment for PMREM-based IBL.
 *
 * Builds an inside-out room scene with emissive area lights and infinity-cove
 * floor-wall transitions.  The resulting scene is fed to
 * `PMREMGenerator.fromScene()` to produce diffuse + specular environment maps.
 */
export class CleanRoomEnvironment {
  readonly scene: THREE.Scene

  constructor() {
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0xeeeeee)

    this._buildRoom()
    this._buildAreaLights()
    this._buildInfinityCoves()

    // Rotate 45° so the cleanest wall-floor edge faces the default camera
    this.scene.rotation.y = Math.PI / 4
  }

  dispose(): void {
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose()
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose())
        } else {
          obj.material?.dispose()
        }
      }
    })
  }

  // ---------------------------------------------------------------------------
  // Internal builders
  // ---------------------------------------------------------------------------

  /**
   * Inside-out room box.  `THREE.BackSide` means the camera (sitting inside)
   * sees the interior walls.  Floor colour is slightly warmer than walls/ceiling
   * to simulate a studio cove floor.
   */
  private _buildRoom(): void {
    const geom = new THREE.BoxGeometry(ROOM_SIZE, ROOM_HEIGHT, ROOM_SIZE)
    // Emissive is REQUIRED for PMREM baking — without scene lights, only
    // emissive contributes to the cubemap. Non-emissive walls render black.
    const wall = (color: number, roughness: number, ei: number) =>
      new THREE.MeshStandardMaterial({ color, emissive: new THREE.Color(color), emissiveIntensity: ei, roughness, side: THREE.BackSide })
    const materials: THREE.MeshStandardMaterial[] = [
      wall(0xf0f0f0, 0.85, 0.8),  // +X right wall
      wall(0xf0f0f0, 0.85, 0.8),  // -X left wall
      wall(0xfafafa, 0.9,  1.2),  // +Y ceiling — brighter
      wall(0xe8e4e0, 0.8,  0.6),  // -Y floor — warmer, dimmer
      wall(0xf0f0f0, 0.85, 0.8),  // +Z back wall
      wall(0xf0f0f0, 0.85, 0.8),  // -Z front wall
    ]
    const mesh = new THREE.Mesh(geom, materials)
    mesh.name = 'roomBox'
    this.scene.add(mesh)
  }

  /**
   * Six rectangular emissive quads simulating photo-studio softboxes.
   * They are positioned close to the walls / ceiling and provide the
   * directional high-frequency detail that gets baked into the PMREM.
   */
  private _buildAreaLights(): void {
    const half = ROOM_SIZE / 2 - 0.2
    const top = ROOM_HEIGHT / 2 - 0.3

    const lights: { pos: [number, number, number]; rot: [number, number, number]; size: [number, number]; color: number; intensity: number }[] = [
      // Ceiling — large soft source
      { pos: [0, top, 0], rot: [-Math.PI / 2, 0, 0], size: [5, 4], color: 0xffffff, intensity: 2.5 },
      // Right wall — key softbox
      { pos: [half, 1.5, 1.5], rot: [0, -Math.PI / 2, 0], size: [3, 2.5], color: 0xfff8f0, intensity: 2.0 },
      // Left wall — fill softbox
      { pos: [-half, 1.2, -1], rot: [0, Math.PI / 2, 0], size: [3, 2.5], color: 0xf0f4ff, intensity: 1.5 },
      // Back wall — rim
      { pos: [0, 2, half], rot: [0, Math.PI, 0], size: [3.5, 2.5], color: 0xf0ffff, intensity: 1.2 },
      // Front wall — subtle fill
      { pos: [0, 1.8, -half], rot: [0, 0, 0], size: [3.5, 2.5], color: 0xfffaf5, intensity: 1.0 },
      // Floor bounce — warm
      { pos: [0, -half + 0.15, 0], rot: [Math.PI / 2, 0, 0], size: [4, 3], color: 0xfff0e0, intensity: 0.6 },
    ]

    for (const l of lights) {
      const geom = new THREE.PlaneGeometry(l.size[0], l.size[1])
      const mat = new THREE.MeshStandardMaterial({
        color: l.color,
        emissive: l.color,
        emissiveIntensity: l.intensity,
        roughness: 1.0,
        metalness: 0.0,
        side: THREE.DoubleSide,
      })
      const mesh = new THREE.Mesh(geom, mat)
      mesh.name = 'areaLight'
      mesh.position.set(...l.pos)
      mesh.rotation.set(...l.rot)
      this.scene.add(mesh)
    }
  }

  /**
   * Quarter-cylinder sweeps along the four floor-wall edges.
   *
   * CylinderGeometry creates a pipe along Y with cross-section in XZ.
   * For edges that run along Z (+X / -X walls): RotX(+π/2) orients the
   * pipe so it runs along Z with the quarter-arc in the XY plane.
   * For edges that run along X (+Z / -Z walls): RotZ(+π/2) orients the
   * pipe so it runs along X with the quarter-arc in the YZ plane.
   *
   * thetaStart / thetaLength select which quadrant of the cylinder
   * produces the cove, ensuring the arc faces the correct wall-to-floor
   * corner.
   */
  private _buildInfinityCoves(): void {
    const half = ROOM_SIZE / 2
    const bottom = -ROOM_HEIGHT / 2
    const h = ROOM_SIZE
    const segs = 32

    const coveMat = new THREE.MeshStandardMaterial({
      color: 0xf2f0ec,
      roughness: 0.75,
      metalness: 0.0,
    })

    // +X edge — arc from +X (wall) to -Y (floor), axis along Z
    this.scene.add(this._makeCove(
      new THREE.CylinderGeometry(COVE_RADIUS, COVE_RADIUS, h, segs, 1, true, 0, Math.PI / 2),
      [Math.PI / 2, 0, 0],
      [half - COVE_RADIUS, bottom + COVE_RADIUS, 0],
      coveMat,
    ))

    // -X edge — arc from -Y (floor) to -X (wall), axis along Z
    this.scene.add(this._makeCove(
      new THREE.CylinderGeometry(COVE_RADIUS, COVE_RADIUS, h, segs, 1, true, Math.PI / 2, Math.PI / 2),
      [Math.PI / 2, 0, 0],
      [-half + COVE_RADIUS, bottom + COVE_RADIUS, 0],
      coveMat,
    ))

    // +Z edge — arc from -Y (floor) to +Z (wall), axis along X
    this.scene.add(this._makeCove(
      new THREE.CylinderGeometry(COVE_RADIUS, COVE_RADIUS, h, segs, 1, true, 0, Math.PI / 2),
      [0, 0, Math.PI / 2],
      [0, bottom + COVE_RADIUS, half - COVE_RADIUS],
      coveMat,
    ))

    // -Z edge — arc from -Z (wall) to -Y (floor), axis along X
    this.scene.add(this._makeCove(
      new THREE.CylinderGeometry(COVE_RADIUS, COVE_RADIUS, h, segs, 1, true, -Math.PI / 2, Math.PI / 2),
      [0, 0, Math.PI / 2],
      [0, bottom + COVE_RADIUS, -half + COVE_RADIUS],
      coveMat,
    ))
  }

  private _makeCove(
    geom: THREE.CylinderGeometry,
    rotation: [number, number, number],
    position: [number, number, number],
    mat: THREE.MeshStandardMaterial,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(geom, mat)
    mesh.name = 'infinityCove'
    mesh.rotation.set(...rotation)
    mesh.position.set(...position)
    return mesh
  }
}
