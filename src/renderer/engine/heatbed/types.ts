import * as THREE from 'three'

/** Supported bed sizes (mm), square only — used by single-bed fallback path */
export const SUPPORTED_BED_SIZES = [200, 300, 500, 1000] as const
export type BedSize = (typeof SUPPORTED_BED_SIZES)[number]

/** Default bed size (square fallback) */
export const DEFAULT_BED_SIZE: BedSize = 300

/** Rectangular bed dimensions in scene units */
export interface BedDimensions {
  width: number
  depth: number
}

/** Create square BedDimensions from a single side length (backward compat). */
export function squareBedDimensions(size: number): BedDimensions {
  return { width: size, depth: size }
}

/** Bed configuration */
export interface BedConfig {
  /** Bed dimensions in scene units (width × depth, may be non-square) */
  dimensions: BedDimensions
  /** Grid origin offset in scene units, default (0, 0) */
  origin?: { x: number; y: number }
  /** Grid spacing in scene units, null = auto-calculate */
  gridStep?: number | null
}

/** Per-plate heatbed config used by the engine store */
export interface PlateBedConfig {
  plateId: number
  plateName: string
  dimensions: BedDimensions
  selected: boolean
}

/** Computed layout entry — world-space center of a plate */
export interface PlateLayoutEntry {
  plateId: number
  centerX: number
  centerY: number
}

/**
 * Compute world-space positions for multiple plates.
 * Arranged left-to-right, wrapping after maxColumns, centered at origin.
 *
 * @param plates    - Map of plateId → { width, depth } in scene units
 * @param maxColumns - Max plates per row (default 3)
 * @param spacing   - Gap between plates in scene units (default 50)
 */
export function computePlateLayout(
  plates: Map<number, { width: number; depth: number }>,
  maxColumns: number = 3,
  spacing: number = 50,
): PlateLayoutEntry[] {
  const entries = Array.from(plates.entries()).sort(([a], [b]) => a - b)
  if (entries.length === 0) return []

  // Partition into rows
  const rows: { plateId: number; width: number; depth: number }[][] = []
  for (let i = 0; i < entries.length; i += maxColumns) {
    rows.push(
      entries.slice(i, i + maxColumns).map(([id, dims]) => ({
        plateId: id,
        width: dims.width,
        depth: dims.depth,
      })),
    )
  }

  const result: PlateLayoutEntry[] = []
  let yOffset = 0

  for (const row of rows) {
    const maxDepthInRow = Math.max(...row.map(r => r.depth))
    // Center this row horizontally
    const totalRowWidth =
      row.reduce((sum, r) => sum + r.width, 0) +
      (row.length - 1) * spacing
    let xOffset = -totalRowWidth / 2

    for (const plate of row) {
      result.push({
        plateId: plate.plateId,
        centerX: xOffset + plate.width / 2,
        centerY: yOffset,
      })
      xOffset += plate.width + spacing
    }

    yOffset += maxDepthInRow + spacing
  }

  return result
}

/** Grid line segment */
export interface Line {
  start: { x: number; y: number }
  end: { x: number; y: number }
}

/** Bed appearance colors */
export interface BedColors {
  /** Unselected background color */
  unselected: THREE.Color
  /** Unselected background color (dark mode) */
  unselectedDark: THREE.Color
  /** Selected background color */
  selected: THREE.Color
  /** Grid line color */
  gridLine: THREE.Color
  /** Grid line color (selected) */
  gridLineSelected: THREE.Color
}

/** Default colors matching OrcaSlicer's PartPlate values */
export const DEFAULT_BED_COLORS: BedColors = {
  unselected: new THREE.Color(0xD1D1D1),         // ~0.82, 0.82, 0.82
  unselectedDark: new THREE.Color(0x626269),       // ~0.384, 0.384, 0.412
  selected: new THREE.Color(0x474747),             // ~0.267, 0.278, 0.278
  gridLine: new THREE.Color(0xE3E3E3),            // ~0.89, 0.89, 0.89
  gridLineSelected: new THREE.Color(0x878B88),     // ~0.529, 0.545, 0.533
}

/** Z-layer constants in raw coordinate space */
export const GROUND_Z = -0.001   // bed plane ~1mm below surface
export const GRIDLINE_Z = -0.002 // grid lines ~2mm below surface

/** Camera margin factors matching OrcaSlicer */
export const MARGIN_BED = 2.00
export const MARGIN_MODEL = 1.25

/**
 * Auto-calculate grid step based on the smaller bed dimension.
 *    ≤200mm → 10mm (≥20 cells)
 *    ≤300mm → 10mm (≥30 cells)
 *    ≤500mm → 20mm (≥25 cells)
 *     >500mm → 50mm
 * @param dims - bed dimensions in mm (physical)
 */
export function calculateGridStep(dims: BedDimensions): number {
  const minDim = Math.min(dims.width, dims.depth)
  if (minDim <= 200) return 10
  if (minDim <= 300) return 10
  if (minDim <= 500) return 20
  return 50 // >500mm
}

/**
 * Auto-select bed size based on model bounding box.
 * @param modelBBox - model bounding box in raw coordinate units
 * @param rawToMM - factor to convert raw coords to mm for comparison
 *        (GLB/glTF: 1000 because raw=meters; 3MF/STL: 1 because raw=mm)
 * @returns bed size in raw coordinate units
 */
export function autoSelectBedSize(modelBBox: THREE.Box3, rawToMM: number): number {
  const pad = 20 // mm
  const modelExtentMM = Math.max(
    modelBBox.max.x - modelBBox.min.x,
    modelBBox.max.y - modelBBox.min.y,
  ) * rawToMM
  const neededMM = modelExtentMM + pad * 2

  for (const sizeMM of SUPPORTED_BED_SIZES) {
    if (sizeMM >= neededMM) return sizeMM / rawToMM
  }
  return 1000 / rawToMM // fallback to largest
}

/** Format IDs that default to showHeatbed=true */
export const HEATBED_DEFAULT_FORMATS: ReadonlySet<string> = new Set([
  'stl', '3mf', 'amf', 'step',
])
