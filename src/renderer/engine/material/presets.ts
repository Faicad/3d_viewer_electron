import type { MaterialAppearance } from './types'

/**
 * 29 built-in PBR material presets organised by category.
 *
 * Colour values are sRGB [R, G, B] or [R, G, B, A] in the 0–1 range.
 * The `alphaMode` field uses the glTF convention (OPAQUE / MASK / BLEND).
 */

// ---------------------------------------------------------------------------
// Polished metals (6)
// ---------------------------------------------------------------------------

const chrome: MaterialAppearance = {
  name: 'Chrome',
  color: [0.95, 0.95, 0.96],
  metalness: 1.0,
  roughness: 0.02,
}

const polishedSteel: MaterialAppearance = {
  name: 'Polished Steel',
  color: [0.65, 0.67, 0.70],
  metalness: 1.0,
  roughness: 0.08,
}

const gold: MaterialAppearance = {
  name: 'Gold',
  color: [1.0, 0.84, 0.0],
  metalness: 1.0,
  roughness: 0.1,
}

const copper: MaterialAppearance = {
  name: 'Copper',
  color: [0.72, 0.45, 0.20],
  metalness: 1.0,
  roughness: 0.15,
}

const brass: MaterialAppearance = {
  name: 'Brass',
  color: [0.71, 0.65, 0.26],
  metalness: 1.0,
  roughness: 0.12,
}

const polishedAluminum: MaterialAppearance = {
  name: 'Polished Aluminum',
  color: [0.88, 0.89, 0.91],
  metalness: 1.0,
  roughness: 0.06,
}

// ---------------------------------------------------------------------------
// Brushed / satin metals (5)
// ---------------------------------------------------------------------------

const stainlessSteel: MaterialAppearance = {
  name: 'Stainless Steel',
  color: [0.62, 0.64, 0.67],
  metalness: 0.92,
  roughness: 0.28,
  anisotropy: 0.4,
  anisotropyRotation: 0,
}

const brushedAluminum: MaterialAppearance = {
  name: 'Brushed Aluminum',
  color: [0.82, 0.84, 0.86],
  metalness: 0.9,
  roughness: 0.32,
  anisotropy: 0.5,
  anisotropyRotation: 0,
}

const castIron: MaterialAppearance = {
  name: 'Cast Iron',
  color: [0.22, 0.22, 0.24],
  metalness: 0.85,
  roughness: 0.65,
}

const titanium: MaterialAppearance = {
  name: 'Titanium',
  color: [0.52, 0.50, 0.53],
  metalness: 0.8,
  roughness: 0.35,
  anisotropy: 0.3,
}

const weatheredSteel: MaterialAppearance = {
  name: 'Weathered Steel',
  color: [0.45, 0.35, 0.25],
  metalness: 0.88,
  roughness: 0.7,
}

// ---------------------------------------------------------------------------
// Plastics (5)
// ---------------------------------------------------------------------------

const glossyPlastic: MaterialAppearance = {
  name: 'Glossy Plastic',
  color: [0.94, 0.94, 0.95],
  metalness: 0.0,
  roughness: 0.1,
}

const mattePlastic: MaterialAppearance = {
  name: 'Matte Plastic',
  color: [0.90, 0.90, 0.91],
  metalness: 0.0,
  roughness: 0.5,
}

const absBlack: MaterialAppearance = {
  name: 'ABS Black',
  color: [0.08, 0.08, 0.09],
  metalness: 0.0,
  roughness: 0.4,
}

const nylon: MaterialAppearance = {
  name: 'Nylon',
  color: [0.92, 0.90, 0.86],
  metalness: 0.0,
  roughness: 0.55,
}

const acrylicClear: MaterialAppearance = {
  name: 'Acrylic Clear',
  color: [0.98, 0.98, 0.99, 1.0],
  metalness: 0.0,
  roughness: 0.05,
  transmission: 0.95,
  ior: 1.49,
  thickness: 2.0,
}

// ---------------------------------------------------------------------------
// Glass / transparent (3)
// ---------------------------------------------------------------------------

const clearGlass: MaterialAppearance = {
  name: 'Clear Glass',
  color: [0.99, 0.99, 1.0, 1.0],
  metalness: 0.0,
  roughness: 0.0,
  transmission: 1.0,
  ior: 1.5,
  thickness: 3.0,
}

const tintedGlass: MaterialAppearance = {
  name: 'Tinted Glass',
  color: [0.80, 0.88, 0.92, 1.0],
  metalness: 0.0,
  roughness: 0.02,
  transmission: 0.9,
  ior: 1.52,
  thickness: 3.0,
  attenuationColor: [0.80, 0.88, 0.92],
  attenuationDistance: 2.0,
}

const frostedGlass: MaterialAppearance = {
  name: 'Frosted Glass',
  color: [0.95, 0.96, 0.98, 1.0],
  metalness: 0.0,
  roughness: 0.35,
  transmission: 0.85,
  ior: 1.5,
  thickness: 2.5,
}

// ---------------------------------------------------------------------------
// Rubber (3)
// ---------------------------------------------------------------------------

const blackRubber: MaterialAppearance = {
  name: 'Black Rubber',
  color: [0.06, 0.06, 0.07],
  metalness: 0.0,
  roughness: 0.88,
}

const grayRubber: MaterialAppearance = {
  name: 'Gray Rubber',
  color: [0.35, 0.35, 0.37],
  metalness: 0.0,
  roughness: 0.82,
}

const redRubber: MaterialAppearance = {
  name: 'Red Rubber',
  color: [0.75, 0.12, 0.08],
  metalness: 0.0,
  roughness: 0.8,
}

// ---------------------------------------------------------------------------
// Paints (4)
// ---------------------------------------------------------------------------

const mattePaint: MaterialAppearance = {
  name: 'Matte Paint',
  color: [0.85, 0.20, 0.15],
  metalness: 0.0,
  roughness: 0.6,
}

const glossyPaint: MaterialAppearance = {
  name: 'Glossy Paint',
  color: [0.90, 0.15, 0.10],
  metalness: 0.0,
  roughness: 0.2,
  clearcoat: 0.3,
  clearcoatRoughness: 0.15,
}

const metallicPaint: MaterialAppearance = {
  name: 'Metallic Paint',
  color: [0.20, 0.30, 0.85],
  metalness: 0.5,
  roughness: 0.25,
  clearcoat: 0.5,
  clearcoatRoughness: 0.1,
}

const carPaint: MaterialAppearance = {
  name: 'Car Paint',
  color: [0.85, 0.10, 0.10],
  metalness: 0.3,
  roughness: 0.15,
  clearcoat: 1.0,
  clearcoatRoughness: 0.08,
}

// ---------------------------------------------------------------------------
// Natural / other (3)
// ---------------------------------------------------------------------------

const ceramicWhite: MaterialAppearance = {
  name: 'Ceramic White',
  color: [0.96, 0.95, 0.93],
  metalness: 0.0,
  roughness: 0.25,
}

const carbonFiber: MaterialAppearance = {
  name: 'Carbon Fiber',
  color: [0.10, 0.10, 0.12],
  metalness: 0.15,
  roughness: 0.4,
  anisotropy: 0.6,
  anisotropyRotation: 0,
}

const concrete: MaterialAppearance = {
  name: 'Concrete',
  color: [0.72, 0.70, 0.68],
  metalness: 0.0,
  roughness: 0.92,
}

// ---------------------------------------------------------------------------
// Aggregated exports
// ---------------------------------------------------------------------------

export const MATERIAL_PRESETS: Record<string, MaterialAppearance> = {
  chrome,
  polishedSteel,
  gold,
  copper,
  brass,
  polishedAluminum,
  stainlessSteel,
  brushedAluminum,
  castIron,
  titanium,
  weatheredSteel,
  glossyPlastic,
  mattePlastic,
  absBlack,
  nylon,
  acrylicClear,
  clearGlass,
  tintedGlass,
  frostedGlass,
  blackRubber,
  grayRubber,
  redRubber,
  mattePaint,
  glossyPaint,
  metallicPaint,
  carPaint,
  ceramicWhite,
  carbonFiber,
  concrete,
}

export const MATERIAL_PRESET_NAMES: string[] = Object.keys(MATERIAL_PRESETS)

/** Look up a preset by id. Returns undefined for unknown ids. */
export function getPreset(id: string): MaterialAppearance | undefined {
  return MATERIAL_PRESETS[id]
}
