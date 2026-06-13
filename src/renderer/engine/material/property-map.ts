/**
 * Declarative property mapping — the SINGLE source of truth for all material
 * properties in the "Three.js ↔ MaterialAppearance" bridge.
 *
 * Adding a property here automatically enables:
 * - MaterialProxy get/set/reset
 * - materialToAppearance() extraction
 * - MaterialFactory._buildMaterial() application
 * - Completeness tests (verify every prop roundtrips)
 */

import * as THREE from 'three'
import type { MaterialAppearance } from './types'

// ---------------------------------------------------------------------------
// Scalar property mapping
// ---------------------------------------------------------------------------

export interface ScalarPropMapping {
  /** Key in MaterialAppearance interface */
  appearanceKey: keyof MaterialAppearance

  /** Property path on THREE.Material */
  threeKey: string

  /** Which material class(es) have this property natively */
  materialKind: 'Standard' | 'Physical' | 'All'

  /** THREE material value → MaterialAppearance value */
  serialize: (v: any) => any

  /** MaterialAppearance value → THREE material value */
  deserialize: (v: any) => any

  /** Skip serialization when the raw value equals this */
  zeroValue: any

  /** Description for documentation / test output */
  description: string
}

// ---- Serialization helpers ----

function identity(v: any): any {
  return v
}

function serializeColor(v: THREE.Color): [number, number, number] {
  return [v.r, v.g, v.b]
}

function deserializeColor(v: [number, number, number]): THREE.Color {
  return new THREE.Color(v[0], v[1], v[2])
}

function serializeVector2(v: THREE.Vector2): number {
  // Three.js normalScale.x and normalScale.y are typically equal
  // MaterialAppearance stores a single number (uniform scale)
  return v.x
}

function deserializeVector2(v: number): THREE.Vector2 {
  return new THREE.Vector2(v, v)
}

// ---------------------------------------------------------------------------
// The master list
// ---------------------------------------------------------------------------

/**
 * Every scalar material property that participates in the roundtrip pipeline.
 *
 * NOTE: `color`, `emissive`, `alphaMode`, `doubleSided`, and `unlit` are
 * handled by dedicated code in MaterialProxy / materialToAppearance /
 * MaterialFactory because they involve multi-field logic (color channels +
 * opacity, transparent/alphaTest flags, side enum, material type selection).
 * They are NOT in this list — they have their own explicit handling.
 */
export const SCALAR_PROPS: ScalarPropMapping[] = [
  // ---- Base PBR (MeshStandardMaterial + MeshPhysicalMaterial) ----
  {
    appearanceKey: 'roughness',
    threeKey: 'roughness',
    materialKind: 'Standard',
    serialize: identity,
    deserialize: identity,
    zeroValue: undefined,
    description: 'Surface roughness (0 = mirror, 1 = diffuse)',
  },
  {
    appearanceKey: 'metalness',
    threeKey: 'metalness',
    materialKind: 'Standard',
    serialize: identity,
    deserialize: identity,
    zeroValue: undefined,
    description: 'Metalness factor (0 = dielectric, 1 = metal)',
  },

  // ---- Normal map scale ----
  {
    appearanceKey: 'normalScale',
    threeKey: 'normalScale',
    materialKind: 'Standard',
    serialize: serializeVector2,
    deserialize: deserializeVector2,
    zeroValue: undefined,
    description: 'Normal map intensity (uniform scale applied to x and y)',
  },

  // ---- AO map intensity ----
  {
    appearanceKey: 'aoMapIntensity',
    threeKey: 'aoMapIntensity',
    materialKind: 'Standard',
    serialize: identity,
    deserialize: identity,
    zeroValue: undefined,
    description: 'Ambient occlusion map intensity',
  },

  // ---- Transmission / Volume (MeshPhysicalMaterial only) ----
  {
    appearanceKey: 'transmission',
    threeKey: 'transmission',
    materialKind: 'Physical',
    serialize: identity,
    deserialize: identity,
    zeroValue: 0,
    description: 'Transmission factor (0 = opaque, 1 = fully transmissive)',
  },
  {
    appearanceKey: 'thickness',
    threeKey: 'thickness',
    materialKind: 'Physical',
    serialize: identity,
    deserialize: identity,
    zeroValue: undefined,
    description: 'Volume thickness in world units',
  },
  {
    appearanceKey: 'ior',
    threeKey: 'ior',
    materialKind: 'Physical',
    serialize: identity,
    deserialize: identity,
    zeroValue: undefined,  // 1.5 is the default but also meaningful for glass
    description: 'Index of refraction',
  },
  {
    appearanceKey: 'attenuationColor',
    threeKey: 'attenuationColor',
    materialKind: 'Physical',
    serialize: serializeColor,
    deserialize: deserializeColor,
    zeroValue: undefined,
    description: 'Volume attenuation color (sRGB)',
  },
  {
    appearanceKey: 'attenuationDistance',
    threeKey: 'attenuationDistance',
    materialKind: 'Physical',
    serialize: identity,
    deserialize: identity,
    zeroValue: undefined,
    description: 'Volume attenuation distance',
  },

  // ---- Clearcoat (MeshPhysicalMaterial only) ----
  {
    appearanceKey: 'clearcoat',
    threeKey: 'clearcoat',
    materialKind: 'Physical',
    serialize: identity,
    deserialize: identity,
    zeroValue: 0,
    description: 'Clearcoat factor (0 = none, 1 = full)',
  },
  {
    appearanceKey: 'clearcoatRoughness',
    threeKey: 'clearcoatRoughness',
    materialKind: 'Physical',
    serialize: identity,
    deserialize: identity,
    zeroValue: 0,
    description: 'Clearcoat roughness',
  },

  // ---- Sheen (MeshPhysicalMaterial only) ----
  {
    appearanceKey: 'sheen',
    threeKey: 'sheen',
    materialKind: 'Physical',
    serialize: identity,
    deserialize: identity,
    zeroValue: 0,
    description: 'Sheen factor (0 = none, 1 = full fabric/velvet)',
  },
  {
    appearanceKey: 'sheenColor',
    threeKey: 'sheenColor',
    materialKind: 'Physical',
    serialize: serializeColor,
    deserialize: deserializeColor,
    zeroValue: undefined,
    description: 'Sheen tint color (sRGB)',
  },
  {
    appearanceKey: 'sheenRoughness',
    threeKey: 'sheenRoughness',
    materialKind: 'Physical',
    serialize: identity,
    deserialize: identity,
    zeroValue: 0,
    description: 'Sheen roughness',
  },

  // ---- Anisotropy (MeshPhysicalMaterial only) ----
  {
    appearanceKey: 'anisotropy',
    threeKey: 'anisotropy',
    materialKind: 'Physical',
    serialize: identity,
    deserialize: identity,
    zeroValue: 0,
    description: 'Anisotropy strength (brushed metal effect)',
  },
  {
    appearanceKey: 'anisotropyRotation',
    threeKey: 'anisotropyRotation',
    materialKind: 'Physical',
    serialize: identity,
    deserialize: identity,
    zeroValue: 0,
    description: 'Anisotropy rotation in radians',
  },

  // ---- Specular (MeshPhysicalMaterial only, KHR_materials_specular) ----
  {
    appearanceKey: 'specularIntensity',
    threeKey: 'specularIntensity',
    materialKind: 'Physical',
    serialize: identity,
    deserialize: identity,
    zeroValue: undefined,
    description: 'Specular intensity (replaces metalness workflow)',
  },
  {
    appearanceKey: 'specularColor',
    threeKey: 'specularColor',
    materialKind: 'Physical',
    serialize: serializeColor,
    deserialize: deserializeColor,
    zeroValue: undefined,
    description: 'Specular color (sRGB, replaces metalness workflow)',
  },

  // ---- Emissive intensity (color handled separately) ----
  {
    appearanceKey: 'emissiveIntensity',
    threeKey: 'emissiveIntensity',
    materialKind: 'Standard',
    serialize: identity,
    deserialize: identity,
    zeroValue: undefined,
    description: 'Emissive light intensity multiplier',
  },

  // ---- Alpha cutoff (for MASK mode) ----
  {
    appearanceKey: 'alphaCutoff',
    threeKey: 'alphaTest',
    materialKind: 'All',
    serialize: identity,
    deserialize: identity,
    zeroValue: 0,
    description: 'Alpha test threshold for MASK alpha mode',
  },
]

// ---------------------------------------------------------------------------
// Pre-built index for fast lookup
// ---------------------------------------------------------------------------

const _byAppearanceKey = new Map<keyof MaterialAppearance, ScalarPropMapping>()
const _byThreeKey = new Map<string, ScalarPropMapping>()

for (const p of SCALAR_PROPS) {
  _byAppearanceKey.set(p.appearanceKey, p)
  _byThreeKey.set(p.threeKey, p)
}

/** O(1) lookup of a scalar property mapping by appearance key. */
export function getScalarByAppearanceKey(
  key: keyof MaterialAppearance,
): ScalarPropMapping | undefined {
  return _byAppearanceKey.get(key)
}

/** O(1) lookup of a scalar property mapping by Three.js property name. */
export function getScalarByThreeKey(
  key: string,
): ScalarPropMapping | undefined {
  return _byThreeKey.get(key)
}

/** All appearance keys that have a scalar property mapping. */
export const MAPPED_SCALAR_KEYS = new Set(
  SCALAR_PROPS.map((p) => p.appearanceKey),
)

// ---------------------------------------------------------------------------
// Texture property set
// ---------------------------------------------------------------------------

/**
 * THE single source of truth for all texture map slots.
 *
 * Used by:
 * - MaterialProxy (get/set texture references)
 * - materialToAppearance() (extract texture data URIs)
 * - MaterialFactory (load and apply textures)
 * - ModelGroup (pre-cache texture data URIs for alpha-mode survival)
 * - TextureCache (color space determination via getMapColorSpace)
 */
export const TEXTURE_PROPS = [
  'map',
  'metalnessMap',
  'roughnessMap',
  'normalMap',
  'aoMap',
  'emissiveMap',
  'transmissionMap',
  'thicknessMap',
  'clearcoatMap',
  'clearcoatNormalMap',
  'alphaMap',
] as const

export type TextureSlot = (typeof TEXTURE_PROPS)[number]

/** Runtime set for O(1) membership checks. */
export const TEXTURE_PROP_SET = new Set<string>(TEXTURE_PROPS)

// ---------------------------------------------------------------------------
// Generic read / write helpers
// ---------------------------------------------------------------------------

/**
 * Read a single scalar value from a THREE.Material using the property mapping.
 *
 * Returns `undefined` when:
 * - The property has no mapping entry
 * - The raw value is null/undefined
 * - The raw value equals the declared zeroValue
 */
export function readScalarFromMaterial(
  mat: THREE.Material,
  appearanceKey: keyof MaterialAppearance,
): any {
  const mapping = _byAppearanceKey.get(appearanceKey)
  if (!mapping) return undefined

  const raw = (mat as Record<string, unknown>)[mapping.threeKey]
  if (raw === undefined || raw === null) return undefined
  if (mapping.zeroValue !== undefined && raw === mapping.zeroValue) return undefined

  return mapping.serialize(raw)
}

/**
 * Write a single MaterialAppearance value to a THREE.Material.
 * No-op when the property has no mapping entry or the value is undefined/null.
 */
export function writeScalarToMaterial(
  mat: THREE.Material,
  appearanceKey: keyof MaterialAppearance,
  value: any,
): void {
  const mapping = _byAppearanceKey.get(appearanceKey)
  if (!mapping) return
  if (value === undefined || value === null) return

  const deserialized = mapping.deserialize(value)
  if (deserialized !== undefined) {
    ;(mat as Record<string, unknown>)[mapping.threeKey] = deserialized
  }
}

/**
 * Read ALL mapped scalar properties from a THREE.Material into an appearance
 * fragment.  Used by materialToAppearance().
 *
 * Skips properties whose value is undefined or equals zeroValue.
 */
export function extractAllScalars(mat: THREE.Material): Partial<MaterialAppearance> {
  const result: Partial<MaterialAppearance> = {}

  for (const prop of SCALAR_PROPS) {
    // Check material kind
    if (prop.materialKind === 'Physical' && !(mat instanceof THREE.MeshPhysicalMaterial)) {
      continue
    }
    if (prop.materialKind === 'Standard' || prop.materialKind === 'All') {
      // MeshPhysicalMaterial extends MeshStandardMaterial, so both match
      const isStandard =
        mat instanceof THREE.MeshStandardMaterial ||
        mat instanceof THREE.MeshPhysicalMaterial
      if (!isStandard) continue
    }

    const value = readScalarFromMaterial(mat, prop.appearanceKey)
    if (value !== undefined) {
      ;(result as Record<string, unknown>)[prop.appearanceKey] = value
    }
  }

  return result
}

/**
 * Write ALL mapped scalar properties from a MaterialAppearance fragment to a
 * THREE.Material.  Used by MaterialFactory.
 *
 * Only sets properties that are explicitly present in the appearance (no
 * defaults applied).
 */
export function applyAllScalars(
  mat: THREE.Material,
  appearance: Partial<MaterialAppearance>,
): void {
  for (const prop of SCALAR_PROPS) {
    // Check material kind compatibility
    if (prop.materialKind === 'Physical' && !(mat instanceof THREE.MeshPhysicalMaterial)) {
      continue
    }
    if (prop.materialKind === 'Standard' || prop.materialKind === 'All') {
      const isStandard =
        mat instanceof THREE.MeshStandardMaterial ||
        mat instanceof THREE.MeshPhysicalMaterial
      if (!isStandard) continue
    }

    const value = (appearance as Record<string, unknown>)[prop.appearanceKey]
    if (value !== undefined) {
      writeScalarToMaterial(mat, prop.appearanceKey, value)
    }
  }
}
