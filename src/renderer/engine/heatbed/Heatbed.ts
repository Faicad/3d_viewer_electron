import * as THREE from 'three'
import type { BedConfig, BedColors, Line, BedDimensions } from './types'
import {
  DEFAULT_BED_SIZE, DEFAULT_BED_COLORS,
  calculateGridStep, squareBedDimensions, GROUND_Z, GRIDLINE_Z,
} from './types'

/**
 * Create a rectangular bed plane geometry (2 triangles, no triangulation library needed).
 * @param width  - bed width in scene units
 * @param depth  - bed depth in scene units
 */
function createBedPlaneGeometry(width: number, depth: number): THREE.BufferGeometry {
  const hw = width / 2
  const hd = depth / 2
  const vertices = new Float32Array([
    -hw, -hd, 0,   hw, -hd, 0,   hw,  hd, 0,   -hw,  hd, 0,
  ])
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
  geometry.setIndex([0, 1, 2, 0, 2, 3])
  geometry.computeVertexNormals()
  return geometry
}

/**
 * Generate grid lines within a rectangular bed boundary.
 */
function generateGridLines(
  width: number, depth: number,
  origin: { x: number; y: number }, step: number,
): Line[] {
  const lines: Line[] = []
  const hw = width / 2
  const hd = depth / 2
  const minX = -hw, maxX = hw, minY = -hd, maxY = hd

  // Horizontal lines
  for (let y = origin.y; y >= minY; y -= step)
    lines.push({ start: { x: minX, y }, end: { x: maxX, y } })
  for (let y = origin.y + step; y <= maxY; y += step)
    lines.push({ start: { x: minX, y }, end: { x: maxX, y } })

  // Vertical lines
  for (let x = origin.x; x >= minX; x -= step)
    lines.push({ start: { x, y: minY }, end: { x, y: maxY } })
  for (let x = origin.x + step; x <= maxX; x += step)
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

/** Font metrics for label sprites */
const LABEL_FONT_SIZE = 48
const LABEL_FONT = `${LABEL_FONT_SIZE}px ui-monospace, SFMono-Regular, "Cascadia Code", Consolas, monospace`
const LABEL_PADDING_X = 14
const LABEL_PADDING_Y = 8
const LABEL_COLOR = '#878B88'
const LABEL_BG = 'rgba(0, 0, 0, 0.45)'

/**
 * Create a canvas texture with the given text for use as a THREE.Sprite texture.
 * Returns the texture and the ideal aspect ratio (width/height) of the sprite.
 */
function createLabelTexture(text: string): { texture: THREE.CanvasTexture; width: number; height: number } | null {
  // Guard against environments without DOM (e.g. vitest node)
  if (typeof document === 'undefined') return null

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  ctx.font = LABEL_FONT
  const metrics = ctx.measureText(text)
  const textWidth = metrics.width
  const textHeight = LABEL_FONT_SIZE  // approximate; actualTextBoundingBoxAscent + descent would be better

  const canvasWidth = Math.ceil(textWidth + LABEL_PADDING_X * 2)
  const canvasHeight = Math.ceil(textHeight + LABEL_PADDING_Y * 2)
  canvas.width = canvasWidth
  canvas.height = canvasHeight

  // Re-set font after resize (resize clears context)
  ctx.font = LABEL_FONT

  // Background pill
  const radius = canvasHeight / 2
  ctx.fillStyle = LABEL_BG
  ctx.beginPath()
  ctx.moveTo(radius, 0)
  ctx.lineTo(canvasWidth - radius, 0)
  ctx.arcTo(canvasWidth, 0, canvasWidth, radius, radius)
  ctx.arcTo(canvasWidth, canvasHeight, canvasWidth - radius, canvasHeight, radius)
  ctx.lineTo(radius, canvasHeight)
  ctx.arcTo(0, canvasHeight, 0, canvasHeight - radius, radius)
  ctx.arcTo(0, 0, radius, 0, radius)
  ctx.closePath()
  ctx.fill()

  // Text
  ctx.fillStyle = LABEL_COLOR
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, LABEL_PADDING_X, canvasHeight / 2)

  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.colorSpace = THREE.SRGBColorSpace
  return { texture, width: canvasWidth, height: canvasHeight }
}

/**
 * Programmatic heatbed for 3D model viewing.
 *
 * Renders a rectangular bed plane (2 triangles) with grid lines (1 draw call) and a
 * rectangular contour. Supports selected/unselected and light/dark color modes.
 * Can display an optional size label at the bottom-right corner.
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
  private labelMesh: THREE.Mesh | null = null

  constructor(config?: Partial<BedConfig>, colors?: Partial<BedColors>) {
    const dims = config?.dimensions ?? squareBedDimensions(DEFAULT_BED_SIZE)
    this.config = {
      dimensions: dims,
      origin: config?.origin ?? { x: 0, y: 0 },
      gridStep: config?.gridStep ?? null,
    }
    this.colors = { ...DEFAULT_BED_COLORS, ...colors }

    this.group = new THREE.Group()
    this.group.name = 'Heatbed'

    // Bed plane at groundZ + offset
    const geometry = createBedPlaneGeometry(dims.width, dims.depth)
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
    const step = this.config.gridStep ?? calculateGridStep(this.config.dimensions)
    const lines = generateGridLines(dims.width, dims.depth, this.config.origin, step)
    this.gridLines = createGridLineSegments(
      lines, GRIDLINE_Z, this.colors.gridLine, 1.0,
    )
    this.gridLines.renderOrder = 0
    this.group.add(this.gridLines)
  }

  /** Full configuration update (rebuilds geometry and grid lines). */
  setConfig(config: Partial<BedConfig>): void {
    const oldDims = this.config.dimensions
    this.config = { ...this.config, ...config }

    const newDims = this.config.dimensions
    if (newDims.width !== oldDims.width ||
        newDims.depth !== oldDims.depth ||
        config.origin ||
        config.gridStep !== undefined) {
      this.rebuildGeometry()
      this.rebuildGridLines()
    }
  }

  /** Backward-compat: returns the larger side (square fallback). */
  get size(): number {
    return Math.max(this.config.dimensions.width, this.config.dimensions.depth)
  }

  get width(): number {
    return this.config.dimensions.width
  }

  get depth(): number {
    return this.config.dimensions.depth
  }

  get dimensions(): BedDimensions {
    return { ...this.config.dimensions }
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

  /**
   * Set or update the size label at the bottom-right corner of this plate.
   * Renders as a flat textured quad on the plate surface (OrcaSlicer style).
   * Pass empty string to remove.
   */
  setLabel(text: string): void {
    // Remove existing
    if (this.labelMesh) {
      this.labelMesh.material.map?.dispose()
      this.labelMesh.material.dispose()
      this.labelMesh.geometry.dispose()
      this.group.remove(this.labelMesh)
      this.labelMesh = null
    }

    if (!text) return

    const result = createLabelTexture(text)
    if (!result) return  // no DOM available (e.g. test environment)
    const { texture, width, height } = result

    // Scale relative to plate size (OrcaSlicer: factor * icon_sz)
    const minDim = Math.min(this.width, this.depth)
    const factor = minDim / 200  // normalize to 200mm reference
    const quadHeight = factor * LABEL_FONT_SIZE * 0.125
    const quadWidth = quadHeight * (width / height)

    // Flat quad on the plate surface at bottom-right corner
    const geometry = new THREE.PlaneGeometry(quadWidth, quadHeight)
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false,
      transparent: true,
    })

    const mesh = new THREE.Mesh(geometry, material)

    // Position at bottom-right corner, inset from edges
    const marginX = minDim * 0.03
    const marginY = minDim * 0.03
    // PlaneGeometry creates XY plane; quad center is at origin.
    // Place quad so its right edge is at width/2 - marginX
    // and its bottom edge is at -depth/2 + marginY
    mesh.position.set(
      this.width / 2 - quadWidth / 2 - marginX,
      -this.depth / 2 + quadHeight / 2 + marginY,
      GROUND_Z + 0.001,  // just above plate surface to avoid z-fighting
    )
    // Default PlaneGeometry faces Z+; the plate is in XY plane, so this is correct
    // (the quad lies flat on the plate surface)

    this.group.add(mesh)
    this.labelMesh = mesh
  }

  /** Move the heatbed group in the XY plane (used for multi-plate layout). */
  setPosition(x: number, y: number): void {
    this.group.position.set(x, y, 0)
  }

  /** Get the XY bounding box of the bed (Z = 0, in world space). */
  getBoundingBox(): THREE.Box3 {
    const hw = this.width / 2
    const hd = this.depth / 2
    return new THREE.Box3(
      new THREE.Vector3(-hw, -hd, 0),
      new THREE.Vector3(hw, hd, 0),
    )
  }

  /** Get world-space bounding box accounting for group position. */
  getWorldBoundingBox(): THREE.Box3 {
    const local = this.getBoundingBox()
    const pos = this.group.position
    return new THREE.Box3(
      new THREE.Vector3(local.min.x + pos.x, local.min.y + pos.y, 0),
      new THREE.Vector3(local.max.x + pos.x, local.max.y + pos.y, 0),
    )
  }

  /** Clean up GPU resources */
  dispose(): void {
    this.planeMesh.geometry.dispose()
    this.planeMaterial.dispose()
    this.gridLines.geometry.dispose()
    ;(this.gridLines.material as THREE.Material).dispose()
    if (this.labelMesh) {
      this.labelMesh.material.map?.dispose()
      this.labelMesh.material.dispose()
      this.labelMesh.geometry.dispose()
    }
    this.group.clear()
  }

  private rebuildGeometry(): void {
    this.planeMesh.geometry.dispose()
    this.planeMesh.geometry = createBedPlaneGeometry(this.width, this.depth)
  }

  private rebuildGridLines(): void {
    this.gridLines.geometry.dispose()
    const step = this.config.gridStep ?? calculateGridStep(this.config.dimensions)
    const lines = generateGridLines(this.width, this.depth, this.config.origin, step)
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
