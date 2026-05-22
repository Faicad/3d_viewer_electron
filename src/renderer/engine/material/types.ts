/**
 * Material appearance descriptor — serialisable, framework-agnostic.
 *
 * Used by presets, user overrides, and the `.faimat` file format.
 * Colour components are sRGB RGBA in the 0–1 range.
 */

export type AlphaMode = 'OPAQUE' | 'MASK' | 'BLEND'

export interface MaterialAppearance {
  /** Display name shown in the UI */
  name: string

  // -----------------------------------------------------------------------
  // Base
  // -----------------------------------------------------------------------
  color?: [number, number, number, number]    // sRGB RGBA 0–1
  map?: string                                 // texture URL / data-URI
  metalness?: number
  roughness?: number
  metalnessMap?: string
  roughnessMap?: string
  normalMap?: string
  normalScale?: number
  aoMap?: string
  aoMapIntensity?: number

  // -----------------------------------------------------------------------
  // Emissive
  // -----------------------------------------------------------------------
  emissive?: [number, number, number]
  emissiveMap?: string
  emissiveIntensity?: number

  // -----------------------------------------------------------------------
  // Transmission / glass
  // -----------------------------------------------------------------------
  transmission?: number
  transmissionMap?: string
  thickness?: number
  thicknessMap?: string
  ior?: number
  attenuationColor?: [number, number, number]
  attenuationDistance?: number

  // -----------------------------------------------------------------------
  // Clearcoat
  // -----------------------------------------------------------------------
  clearcoat?: number
  clearcoatRoughness?: number
  clearcoatMap?: string
  clearcoatNormalMap?: string

  // -----------------------------------------------------------------------
  // Sheen (fabric / velvet)
  // -----------------------------------------------------------------------
  sheen?: number
  sheenColor?: [number, number, number]
  sheenRoughness?: number

  // -----------------------------------------------------------------------
  // Anisotropy (brushed metal)
  // -----------------------------------------------------------------------
  anisotropy?: number
  anisotropyRotation?: number

  // -----------------------------------------------------------------------
  // Specular (replaces metalness workflow)
  // -----------------------------------------------------------------------
  specularIntensity?: number
  specularColor?: [number, number, number]

  // -----------------------------------------------------------------------
  // Misc
  // -----------------------------------------------------------------------
  alphaMode?: AlphaMode
  alphaCutoff?: number
  doubleSided?: boolean
  unlit?: boolean
}
