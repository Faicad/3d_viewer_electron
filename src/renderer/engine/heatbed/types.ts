import * as THREE from 'three'

/** Supported bed sizes (mm), square only */
export const SUPPORTED_BED_SIZES = [200, 300, 500, 1000] as const
export type BedSize = (typeof SUPPORTED_BED_SIZES)[number]

/** Default bed size */
export const DEFAULT_BED_SIZE: BedSize = 300

/** Bed configuration */
export interface BedConfig {
  /** Bed side length (mm), square bed. Must be one of the supported values. */
  size: BedSize
  /** Grid origin offset (mm), default (0, 0) */
  origin?: { x: number; y: number }
  /** Grid spacing (mm), null = auto-calculate */
  gridStep?: number | null
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
 * Auto-calculate grid step for each of the 4 size tiers.
 *   200mm → 10mm (20 cells)
 *   300mm → 10mm (30 cells)
 *   500mm → 20mm (25 cells)
 *  1000mm → 50mm (20 cells)
 */
export function calculateGridStep(size: BedSize): number {
  switch (size) {
    case 200:  return 10
    case 300:  return 10
    case 500:  return 20
    case 1000: return 50
  }
}

/**
 * Auto-select bed size based on model bounding box.
 * Model bbox is in Three.js units (meters), bed sizes are in mm.
 * Convert to mm for comparison and apply 20mm margin.
 */
export function autoSelectBedSize(modelBBox: THREE.Box3): BedSize {
  const pad = 20
  // Model bbox in meters → convert to mm
  const modelExtentMM = Math.max(
    modelBBox.max.x - modelBBox.min.x,
    modelBBox.max.y - modelBBox.min.y,
  ) * 1000
  const needed = modelExtentMM + pad * 2

  for (const size of SUPPORTED_BED_SIZES) {
    if (size >= needed) return size
  }
  return 1000 // fallback to largest
}

/** Format IDs that default to showHeatbed=true */
export const HEATBED_DEFAULT_FORMATS: ReadonlySet<string> = new Set([
  'stl', '3mf', 'amf', 'step',
])
