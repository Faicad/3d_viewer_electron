import * as THREE from 'three'
import type { BedSize, BedConfig, BedColors, Line } from './types'
import {
  DEFAULT_BED_SIZE, DEFAULT_BED_COLORS,
  calculateGridStep, GROUND_Z, GRIDLINE_Z,
} from './types'

/** Convert mm (user-facing) to raw coordinate space */
const MM_TO_RAW = 1 / 1000

/**
 * Create a square bed plane geometry (2 triangles, no triangulation library needed).
 * @param size - bed side length in mm
 */
function createBedPlaneGeometry(size: number): THREE.BufferGeometry {
  const hw = size * MM_TO_RAW / 2
  const vertices = new Float32Array([
    -hw, -hw, 0,   hw, -hw, 0,   hw,  hw, 0,   -hw,  hw, 0,
  ])
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
  geometry.setIndex([0, 1, 2, 0, 2, 3])
  geometry.computeVertexNormals()
  return geometry
}

/**
 * Generate grid lines within a square bed boundary (no Clipper2 clipping needed).
 */
function generateGridLines(
  size: number, origin: { x: number; y: number }, step: number,
): Line[] {
  const lines: Line[] = []
  const sizeM = size * MM_TO_RAW
  const stepM = step * MM_TO_RAW
  const h = sizeM / 2
  const minX = -h, maxX = h, minY = -h, maxY = h
  const ox = origin.x * MM_TO_RAW
  const oy = origin.y * MM_TO_RAW

  // Horizontal lines
  for (let y = oy; y >= minY; y -= stepM)
    lines.push({ start: { x: minX, y }, end: { x: maxX, y } })
  for (let y = oy + stepM; y <= maxY; y += stepM)
    lines.push({ start: { x: minX, y }, end: { x: maxX, y } })

  // Vertical lines
  for (let x = ox; x >= minX; x -= stepM)
    lines.push({ start: { x, y: minY }, end: { x, y: maxY } })
  for (let x = ox + stepM; x <= maxX; x += stepM)
    lines.push({ start: { x, y: minY }, end: { x, y: maxY } })

  // Rectangle contour (4 edges)
  lines.push(
    { start: { x: minX, y: minY }, end: { x: maxX, y: minY } },
    { start: { x: maxX, y: minY }, end: { x: maxX, y: maxY } },
    { start: { x: maxX, y: maxY }, end: { x: minX, y: maxY } },
    { start: { x: minX, y: maxY }, end: { x: minX, y: minY } },
  )
  return lines
}

/**
 * Build a single LineSegments from all grid lines (one draw call).
 */
function createGridLineSegments(
  lines: Line[], z: number, color: THREE.Color, opacity: number,
): THREE.LineSegments {
  const positions: number[] = []
  for (const line of lines) {
    positions.push(line.start.x, line.start.y, z)
    positions.push(line.end.x, line.end.y, z)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3))
  const material = new THREE.LineBasicMaterial({
    color,
    depthTest: true,
    depthWrite: false,
    transparent: true,
    opacity,
  })
  return new THREE.LineSegments(geometry, material)
}

/**
 * Programmatic heatbed for 3D model viewing.
 *
 * Renders a square bed plane (2 triangles) with grid lines (1 draw call) and a
 * rectangular contour. Supports selected/unselected and light/dark color modes.
 *
 * Usage pattern follows ShadowFloor: instantiate, add `.group` to scene, call
 * methods to update state. Dispose when done.
 */
export class Heatbed {
  readonly group: THREE.Group
  private config: BedConfig
  private _visible: boolean = true
  private _selected: boolean = false
  private _darkMode: boolean = false
  private colors: BedColors

  private planeMesh: THREE.Mesh
  private planeMaterial: THREE.MeshBasicMaterial
  private gridLines: THREE.LineSegments

  constructor(config?: Partial<BedConfig>, colors?: Partial<BedColors>) {
    this.config = {
      size: config?.size ?? DEFAULT_BED_SIZE,
      origin: config?.origin ?? { x: 0, y: 0 },
      gridStep: config?.gridStep ?? null,
    }
    this.colors = { ...DEFAULT_BED_COLORS, ...colors }

    this.group = new THREE.Group()
    this.group.name = 'Heatbed'

    // Bed plane at groundZ + offset
    const geometry = createBedPlaneGeometry(this.config.size)
    this.planeMaterial = new THREE.MeshBasicMaterial({
      color: this.colors.unselected,
      side: THREE.FrontSide,
      depthWrite: false,
      transparent: true,
    })
    this.planeMesh = new THREE.Mesh(geometry, this.planeMaterial)
    this.planeMesh.position.z = GROUND_Z
    this.planeMesh.renderOrder = -1
    this.group.add(this.planeMesh)

    // Grid lines at groundZ + offset
    const step = this.config.gridStep ?? calculateGridStep(this.config.size)
    const lines = generateGridLines(this.config.size, this.config.origin, step)
    this.gridLines = createGridLineSegments(
      lines, GRIDLINE_Z, this.colors.gridLine, 1.0,
    )
    this.gridLines.renderOrder = 0
    this.group.add(this.gridLines)
  }

  /** Full configuration update (rebuilds geometry and grid lines). */
  setConfig(config: Partial<BedConfig>): void {
    const oldSize = this.config.size
    this.config = { ...this.config, ...config }

    if (this.config.size !== oldSize || config.origin || config.gridStep !== undefined) {
      this.rebuildGeometry()
      this.rebuildGridLines()
    }
  }

  get size(): BedSize {
    return this.config.size
  }

  get visible(): boolean {
    return this._visible
  }

  setVisible(v: boolean): void {
    this._visible = v
    this.group.visible = v
  }

  get selected(): boolean {
    return this._selected
  }

  setSelected(v: boolean): void {
    this._selected = v
    this.updateColors()
  }

  setDarkMode(v: boolean): void {
    this._darkMode = v
    this.updateColors()
  }

  /** Get the XY bounding box of the bed (Z = 0). */
  getBoundingBox(): THREE.Box3 {
    const h = this.config.size * MM_TO_RAW / 2
    return new THREE.Box3(
      new THREE.Vector3(-h, -h, 0),
      new THREE.Vector3(h, h, 0),
    )
  }

  /** Clean up GPU resources */
  dispose(): void {
    this.planeMesh.geometry.dispose()
    this.planeMaterial.dispose()
    this.gridLines.geometry.dispose()
    ;(this.gridLines.material as THREE.Material).dispose()
    this.group.clear()
  }

  private rebuildGeometry(): void {
    this.planeMesh.geometry.dispose()
    this.planeMesh.geometry = createBedPlaneGeometry(this.config.size)
  }

  private rebuildGridLines(): void {
    this.gridLines.geometry.dispose()
    const step = this.config.gridStep ?? calculateGridStep(this.config.size)
    const lines = generateGridLines(this.config.size, this.config.origin, step)
    const gz = GRIDLINE_Z
    const positions: number[] = []
    for (const line of lines) {
      positions.push(line.start.x, line.start.y, gz)
      positions.push(line.end.x, line.end.y, gz)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3))
    this.gridLines.geometry = geometry
  }

  private updateColors(): void {
    const bgColor = this._selected
      ? this.colors.selected
      : this._darkMode
        ? this.colors.unselectedDark
        : this.colors.unselected
    this.planeMaterial.color.copy(bgColor)

    const gridColor = this._selected
      ? this.colors.gridLineSelected
      : this.colors.gridLine
    ;(this.gridLines.material as THREE.LineBasicMaterial).color.copy(gridColor)
  }
}
