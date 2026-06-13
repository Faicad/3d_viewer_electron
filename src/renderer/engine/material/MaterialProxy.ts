/**
 * MaterialProxy — live material wrapper that applies user overrides as a delta
 * on top of a source (original) material.
 *
 * Key guarantees:
 * - `_source` is NEVER mutated — it's the reference for reset
 * - `_current` is the live material attached to the mesh for rendering
 * - `_overrides` stores ONLY user-modified properties (Partial MaterialAppearance)
 * - Any property not in `_overrides` falls through to the source material value
 *
 * Properties added to Three.js in the future are automatically preserved
 * because they are never read into the override set unless the user actively
 * edits them.
 */

import * as THREE from 'three'
import type { MaterialAppearance, AlphaMode } from './types'
import {
  SCALAR_PROPS,
  TEXTURE_PROPS,
  readScalarFromMaterial,
  writeScalarToMaterial,
} from './property-map'

// ---- Texture serialization (same logic as cloneMaterial.ts) ----

function textureImageToDataUri(
  image: HTMLImageElement | HTMLCanvasElement | ImageBitmap,
  mimeType = 'image/png',
  quality?: number,
): string | undefined {
  try {
    const canvas = document.createElement('canvas')
    const w =
      'naturalWidth' in image
        ? (image as HTMLImageElement).naturalWidth
        : image.width
    const h =
      'naturalHeight' in image
        ? (image as HTMLImageElement).naturalHeight
        : image.height
    if (!w || !h) return undefined
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined
    ctx.drawImage(image as CanvasImageSource, 0, 0)
    return canvas.toDataURL(mimeType, quality)
  } catch {
    return undefined
  }
}

// ---------------------------------------------------------------------------
// MaterialProxy
// ---------------------------------------------------------------------------

export class MaterialProxy {
  // ---- Immutable state ----
  private _source: THREE.Material

  // ---- Mutable state ----
  private _current: THREE.Material
  private _overrides: Partial<MaterialAppearance> = {}

  // ---- Identity ----
  readonly sourceType: 'MeshPhysicalMaterial' | 'MeshBasicMaterial' | 'other'
  readonly key: string

  constructor(source: THREE.Material, key: string) {
    this._source = source
    this.key = key

    if (source instanceof THREE.MeshBasicMaterial) {
      this.sourceType = 'MeshBasicMaterial'
    } else if (source instanceof THREE.MeshPhysicalMaterial) {
      this.sourceType = 'MeshPhysicalMaterial'
    } else {
      this.sourceType = 'other'
    }

    // Clone the source as the initial live material
    this._current = source.clone() as THREE.Material
    this._current.userData._proxyManaged = true

    // Apply polygon offset for CAD face overlap prevention (matching
    // cloneAndConvertMaterial behavior)
    if (
      this._current instanceof THREE.MeshStandardMaterial ||
      this._current instanceof THREE.MeshPhysicalMaterial
    ) {
      ;(this._current as THREE.MeshStandardMaterial).polygonOffset = true
      ;(this._current as THREE.MeshStandardMaterial).polygonOffsetFactor = -1
      ;(this._current as THREE.MeshStandardMaterial).polygonOffsetUnits = -1
    }
  }

  // ---- Public accessors ----

  /** The material to use for rendering (Three.js compatible). */
  get current(): THREE.Material {
    return this._current
  }

  /** The original material (immutable, for reset reference). */
  get source(): THREE.Material {
    return this._source
  }

  /** The partial overrides (serializable, for store persistence). */
  get overrides(): Partial<MaterialAppearance> {
    return { ...this._overrides }
  }

  /** Whether the user has made any edits. */
  get hasOverrides(): boolean {
    return Object.keys(this._overrides).length > 0
  }

  // ---- Property read --------------------------------------------------

  /**
   * Read the effective value of a material property.
   * Prefers override, falls back to source material.
   */
  get<K extends keyof MaterialAppearance>(key: K): MaterialAppearance[K] | undefined {
    // Override takes priority
    if (key in this._overrides) {
      return (this._overrides as Record<string, unknown>)[key] as any
    }

    // Fall back to source material
    switch (key) {
      case 'color': {
        if ('color' in this._source && this._source.color instanceof THREE.Color) {
          const c = this._source.color
          return [c.r, c.g, c.b, this._source.opacity] as any
        }
        return undefined
      }
      case 'emissive': {
        if ('emissive' in this._source && this._source.emissive instanceof THREE.Color) {
          const e = this._source.emissive
          if (e.r === 0 && e.g === 0 && e.b === 0) return undefined
          return [e.r, e.g, e.b] as any
        }
        return undefined
      }
      case 'alphaMode': {
        const alphaMode = this._detectAlphaMode(this._source)
        return alphaMode as any
      }
      case 'doubleSided': {
        return (this._source.side === THREE.DoubleSide) as any
      }
      case 'unlit': {
        return (this._source instanceof THREE.MeshBasicMaterial) as any
      }
      default: {
        // Check if it's a scalar prop
        const scalar = readScalarFromMaterial(this._source, key)
        if (scalar !== undefined) return scalar
        return undefined
      }
    }
  }

  // ---- Property write -------------------------------------------------

  /**
   * Set a single material property override.
   * Immediately applies to the live material AND stores in overrides.
   */
  set<K extends keyof MaterialAppearance>(
    key: K,
    value: MaterialAppearance[K],
  ): void {
    ;(this._overrides as Record<string, unknown>)[key] = value
    this._applyProperty(key, value)
  }

  /**
   * Apply a batch of overrides at once (e.g., preset selection).
   * Only fires needsUpdate once.
   */
  applyBatch(updates: Partial<MaterialAppearance>): void {
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined || value === null) continue
      ;(this._overrides as Record<string, unknown>)[key] = value
      this._applyProperty(key as keyof MaterialAppearance, value)
    }
  }

  // ---- Reset ----------------------------------------------------------

  /**
   * Reset one or all overrides to source values.
   * @param key If omitted, resets ALL overrides.
   */
  reset(key?: keyof MaterialAppearance): void {
    if (key) {
      delete (this._overrides as Record<string, unknown>)[key]
      // Restore this property from source
      this._restorePropertyFromSource(key)
    } else {
      // Full reset: clear all overrides and clone source fresh
      this._overrides = {}
      this._current.dispose()
      this._current = this._source.clone() as THREE.Material
      this._current.userData._proxyManaged = true
    }
  }

  // ---- Snapshot -------------------------------------------------------

  /**
   * Produce a FULL MaterialAppearance snapshot of the current effective state.
   * Used for .faimat file export.
   *
   * This reads ALL properties (source + overrides merged) into a complete
   * serializable descriptor.
   */
  toAppearance(name: string): MaterialAppearance {
    const a: MaterialAppearance = { name }

    // Color
    if ('color' in this._current && this._current.color instanceof THREE.Color) {
      const c = this._current.color
      a.color = [c.r, c.g, c.b, this._current.opacity]
    }

    // Emissive
    if ('emissive' in this._current && this._current.emissive instanceof THREE.Color) {
      const e = this._current.emissive
      if (e.r !== 0 || e.g !== 0 || e.b !== 0) {
        a.emissive = [e.r, e.g, e.b]
      }
    }
    if ('emissiveIntensity' in this._current) {
      a.emissiveIntensity = (this._current as any).emissiveIntensity
    }

    // Scalar props
    for (const prop of SCALAR_PROPS) {
      const val = this.get(prop.appearanceKey as keyof MaterialAppearance)
      if (val !== undefined) {
        ;(a as Record<string, unknown>)[prop.appearanceKey] = val
      }
    }

    // Alpha
    a.alphaMode = this.get('alphaMode') ?? 'OPAQUE'
    a.alphaCutoff = this.get('alphaCutoff') as number | undefined
    a.doubleSided = this.get('doubleSided') ?? false
    a.unlit = this.get('unlit') ?? false

    // Texture data URIs
    for (const slot of TEXTURE_PROPS) {
      const tex = (this._current as Record<string, unknown>)[slot]
      if (tex instanceof THREE.Texture && tex.image) {
        const dataUri = textureImageToDataUri(
          tex.image as HTMLImageElement | HTMLCanvasElement | ImageBitmap,
          'image/jpeg',
          0.85,
        )
        if (dataUri) {
          ;(a as Record<string, unknown>)[slot] = dataUri
        }
      }
    }

    return a
  }

  // ---- Cleanup --------------------------------------------------------

  dispose(): void {
    if (this._current !== this._source) {
      this._current.dispose()
    }
  }

  // ---- Internal helpers -----------------------------------------------

  private _applyProperty(
    key: keyof MaterialAppearance,
    value: any,
  ): void {
    switch (key) {
      case 'color': {
        if (Array.isArray(value) && value.length >= 3) {
          const mat = this._current as THREE.MeshStandardMaterial
          mat.color.setRGB(value[0], value[1], value[2], THREE.SRGBColorSpace)
          if (value.length >= 4) mat.opacity = value[3]
        }
        return
      }
      case 'emissive': {
        if (Array.isArray(value) && value.length >= 3) {
          const mat = this._current as THREE.MeshStandardMaterial
          mat.emissive = new THREE.Color(value[0], value[1], value[2])
        }
        return
      }
      case 'emissiveIntensity': {
        if (typeof value === 'number' && 'emissiveIntensity' in this._current) {
          ;(this._current as any).emissiveIntensity = value
        }
        return
      }
      case 'alphaMode': {
        this._applyAlphaMode(value as AlphaMode)
        return
      }
      case 'alphaCutoff': {
        if (typeof value === 'number') {
          ;(this._current as THREE.MeshStandardMaterial).alphaTest = value
        }
        return
      }
      case 'doubleSided': {
        this._current.side = value ? THREE.DoubleSide : THREE.FrontSide
        return
      }
      case 'unlit': {
        this._applyUnlit(value as boolean)
        return
      }
      case 'name':
      case 'map':
      case 'metalnessMap':
      case 'roughnessMap':
      case 'normalMap':
      case 'aoMap':
      case 'emissiveMap':
      case 'transmissionMap':
      case 'thicknessMap':
      case 'clearcoatMap':
      case 'clearcoatNormalMap':
      case 'alphaMap':
        // Texture slots — stored in overrides but not directly applied
        // to _current via this path (handled by texture loading pipeline)
        return
      default: {
        // Scalar property — use mapping
        writeScalarToMaterial(this._current, key, value)
        return
      }
    }
  }

  private _restorePropertyFromSource(key: keyof MaterialAppearance): void {
    switch (key) {
      case 'color': {
        if ('color' in this._source && this._source.color instanceof THREE.Color) {
          const mat = this._current as THREE.MeshStandardMaterial
          mat.color.copy(this._source.color)
          mat.opacity = this._source.opacity
        }
        return
      }
      case 'emissive': {
        if ('emissive' in this._source && this._source.emissive instanceof THREE.Color) {
          ;(this._current as THREE.MeshStandardMaterial).emissive.copy(
            this._source.emissive,
          )
        }
        return
      }
      case 'emissiveIntensity': {
        if ('emissiveIntensity' in this._source) {
          ;(this._current as any).emissiveIntensity = (
            this._source as any
          ).emissiveIntensity
        }
        return
      }
      case 'alphaMode': {
        this._applyAlphaMode(this._detectAlphaMode(this._source))
        return
      }
      case 'alphaCutoff': {
        this._current.alphaTest = this._source.alphaTest
        return
      }
      case 'doubleSided': {
        this._current.side = this._source.side
        return
      }
      case 'unlit': {
        // Reset unlit — this may require material type swap back
        this._applyUnlit(this._source instanceof THREE.MeshBasicMaterial)
        return
      }
      case 'name':
      case 'map':
      case 'metalnessMap':
      case 'roughnessMap':
      case 'normalMap':
      case 'aoMap':
      case 'emissiveMap':
      case 'transmissionMap':
      case 'thicknessMap':
      case 'clearcoatMap':
      case 'clearcoatNormalMap':
      case 'alphaMap':
        return
      default: {
        // Scalar — read from source and write to current
        const sourceVal = readScalarFromMaterial(this._source, key)
        if (sourceVal !== undefined) {
          writeScalarToMaterial(this._current, key, sourceVal)
        }
        return
      }
    }
  }

  private _detectAlphaMode(mat: THREE.Material): AlphaMode {
    const alphaTest = (mat as THREE.MeshStandardMaterial).alphaTest ?? 0
    if (mat.transparent) {
      if (alphaTest > 0) return 'MASK'
      return 'BLEND'
    }
    if (alphaTest > 0) return 'MASK'
    return 'OPAQUE'
  }

  private _applyAlphaMode(mode: AlphaMode): void {
    const mat = this._current as THREE.MeshStandardMaterial
    const colorAlpha = this.get('color')
    const alpha =
      Array.isArray(colorAlpha) && colorAlpha.length >= 4
        ? colorAlpha[3]
        : 1.0

    switch (mode) {
      case 'BLEND':
        mat.transparent = true
        mat.opacity = alpha
        mat.depthWrite = true
        break
      case 'MASK':
        mat.transparent = false
        mat.alphaTest =
          (this._overrides as Record<string, unknown>).alphaCutoff as number ?? 0.5
        mat.opacity = alpha
        break
      case 'OPAQUE':
      default:
        if (
          this._overrides.transmission !== undefined &&
          this._overrides.transmission > 0
        ) {
          break
        }
        mat.transparent = false
        if (alpha !== undefined && alpha < 1.0) {
          mat.transparent = true
          mat.opacity = alpha
        }
        break
    }
  }

  /**
   * Toggle unlit rendering.
   *
   * When unlit=true and source is MeshPhysicalMaterial:
   *   Create a MeshBasicMaterial from current state, replace _current.
   * When unlit=false and source is MeshPhysicalMaterial:
   *   Recreate MeshPhysicalMaterial from overrides + source.
   */
  private _applyUnlit(unlit: boolean): void {
    if (unlit && this.sourceType !== 'MeshBasicMaterial') {
      // Convert to MeshBasicMaterial
      const basic = new THREE.MeshBasicMaterial()
      this._copyCommonToBasic(basic)
      this._current.dispose()
      this._current = basic
      this._current.userData._proxyManaged = true
    } else if (!unlit && this.sourceType === 'MeshBasicMaterial') {
      // Source was originally Basic → override is removing unlit
      // Need to create a Physical material
      const physical = new THREE.MeshPhysicalMaterial()
      this._copyCommonToPhysical(physical)
      this._current.dispose()
      this._current = physical
      this._current.userData._proxyManaged = true
    } else if (unlit && this._current instanceof THREE.MeshPhysicalMaterial) {
      // Current is physical but should be basic
      const basic = new THREE.MeshBasicMaterial()
      this._copyCommonToBasic(basic)
      this._current.dispose()
      this._current = basic
      this._current.userData._proxyManaged = true
    } else if (!unlit && this._current instanceof THREE.MeshBasicMaterial) {
      // Current is basic but should be physical
      const physical = new THREE.MeshPhysicalMaterial()
      this._copyCommonToPhysical(physical)
      this._current.dispose()
      this._current = physical
      this._current.userData._proxyManaged = true
    }
  }

  private _copyCommonToBasic(dst: THREE.MeshBasicMaterial): void {
    const src = this._current as THREE.MeshStandardMaterial
    if (src.color) dst.color.copy(src.color)
    dst.map = src.map ?? null
    dst.alphaMap = (src as any).alphaMap ?? null
    dst.transparent = src.transparent
    dst.opacity = src.opacity
    dst.side = src.side
    dst.alphaTest = src.alphaTest
  }

  private _copyCommonToPhysical(dst: THREE.MeshPhysicalMaterial): void {
    const src = this._current as THREE.MeshStandardMaterial
    if (src.color) dst.color.copy(src.color)
    dst.map = src.map ?? null
    dst.alphaMap = (src as any).alphaMap ?? null
    dst.transparent = src.transparent
    dst.opacity = src.opacity
    dst.side = src.side
    dst.alphaTest = src.alphaTest

    // Read Physical-only properties from _source (not _current, which
    // may be a MeshBasicMaterial without these properties).
    const physSource = this._source as THREE.MeshPhysicalMaterial
    dst.roughness = physSource.roughness ?? 1.0
    dst.metalness = physSource.metalness ?? 0.0
    dst.clearcoat = physSource.clearcoat
    dst.clearcoatRoughness = physSource.clearcoatRoughness
    dst.sheen = physSource.sheen
    if (physSource.sheenColor) dst.sheenColor = physSource.sheenColor
    dst.anisotropy = physSource.anisotropy
    dst.anisotropyRotation = physSource.anisotropyRotation
    dst.transmission = physSource.transmission
    dst.thickness = physSource.thickness
    dst.ior = physSource.ior
    dst.specularIntensity = physSource.specularIntensity
    if (physSource.specularColor) dst.specularColor = physSource.specularColor
    if (physSource.attenuationColor) dst.attenuationColor = physSource.attenuationColor
    dst.attenuationDistance = physSource.attenuationDistance
    dst.polygonOffset = true
    dst.polygonOffsetFactor = -1
    dst.polygonOffsetUnits = -1
  }
}
