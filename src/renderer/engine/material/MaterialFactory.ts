import * as THREE from 'three'
import type { MaterialAppearance, AlphaMode } from './types'
import { TextureCache, getMapColorSpace, TEXTURE_MAP_KEYS } from './TextureCache'

const SRGB = THREE.SRGBColorSpace

/**
 * Builds `MeshPhysicalMaterial` instances from `MaterialAppearance` descriptors.
 *
 * Features:
 * - sRGB colour-space-correct color assignment
 * - Transmission materials get opacity forced to 1.0 (alpha is handled via
 *   the transmission channel, not the legacy opacity blend)
 * - Sheen / anisotropy are only set when non-zero (avoids GPU cost on
 *   materials that don't need them)
 * - `polygonOffset` is always applied (CAD face overlap prevention)
 * - Material cache keyed by a stable `sharingKey` derived from the appearance
 */
export class MaterialFactory {
  private _cache = new Map<string, THREE.MeshPhysicalMaterial>()
  private _textureCache: TextureCache | null = null

  /**
   * Create (or return a cached) material for *appearance*.
   *
   * @param appearance  Full material descriptor
   * @param sharingKey  Optional override for the cache key (defaults to
   *                    a stable JSON snapshot of the appearance)
   */
  createMaterial(
    appearance: MaterialAppearance,
    sharingKey?: string,
  ): THREE.MeshPhysicalMaterial {
    const key = sharingKey ?? this._buildKey(appearance)
    const cached = this._cache.get(key)
    if (cached) return cached

    const mat = this._buildMaterial(appearance)
    this._cache.set(key, mat)
    return mat
  }

  /** Release all cached materials (GPU resources freed elsewhere). */
  dispose(): void {
    for (const mat of this._cache.values()) mat.dispose()
    this._cache.clear()
  }

  /** Attach a texture cache for lazy map loading. */
  setTextureCache(cache: TextureCache | null): void {
    this._textureCache = cache
  }

  /**
   * Asynchronously load all texture maps referenced in `appearance` and apply
   * them to `material`.  No-op when no texture cache is attached.
   */
  async loadAndApplyTextures(
    mat: THREE.MeshPhysicalMaterial,
    appearance: MaterialAppearance,
  ): Promise<void> {
    const tc = this._textureCache
    if (!tc) return

    const tasks: Promise<void>[] = []

    for (const key of TEXTURE_MAP_KEYS) {
      const url = (appearance as Record<string, unknown>)[key]
      if (typeof url !== 'string' || url.length === 0) continue

      const cs = getMapColorSpace(key)
      tasks.push(
        tc.load(url, cs).then((tex) => {
          ;(mat as Record<string, unknown>)[key] = tex
        }),
      )
    }

    if (tasks.length > 0) {
      await Promise.all(tasks)
      mat.needsUpdate = true
    }
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private _buildMaterial(a: MaterialAppearance): THREE.MeshPhysicalMaterial {
    const mat = new THREE.MeshPhysicalMaterial()

    // Colour — always sRGB
    if (a.color) {
      const [r, g, b] = a.color
      mat.color.setRGB(r, g, b, SRGB)
    }

    // Base PBR
    if (a.metalness !== undefined) mat.metalness = a.metalness
    if (a.roughness !== undefined) mat.roughness = a.roughness

    // Transmission (glass / acrylic)
    if (a.transmission !== undefined && a.transmission > 0) {
      mat.transmission = a.transmission
      mat.opacity = 1.0
      mat.transparent = a.alphaMode !== 'OPAQUE' || a.transmission > 0
    }

    if (a.thickness !== undefined) mat.thickness = a.thickness
    if (a.ior !== undefined) mat.ior = a.ior

    if (a.attenuationColor) {
      const [r, g, b] = a.attenuationColor
      mat.attenuationColor = new THREE.Color(r, g, b)
    }
    if (a.attenuationDistance !== undefined) {
      mat.attenuationDistance = a.attenuationDistance
    }

    // Clearcoat (car paint)
    if (a.clearcoat !== undefined && a.clearcoat > 0) {
      mat.clearcoat = a.clearcoat
    }
    if (a.clearcoatRoughness !== undefined && a.clearcoatRoughness > 0) {
      mat.clearcoatRoughness = a.clearcoatRoughness
    }

    // Sheen (fabric / velvet)
    if (a.sheen !== undefined && a.sheen > 0) {
      mat.sheen = a.sheen
    }
    if (a.sheenColor) {
      const [r, g, b] = a.sheenColor
      mat.sheenColor = new THREE.Color(r, g, b)
    }
    if (a.sheenRoughness !== undefined && a.sheenRoughness > 0) {
      mat.sheenRoughness = a.sheenRoughness
    }

    // Anisotropy (brushed metal)
    if (a.anisotropy !== undefined && a.anisotropy > 0) {
      mat.anisotropy = a.anisotropy
    }
    if (a.anisotropyRotation !== undefined && a.anisotropyRotation !== 0) {
      mat.anisotropyRotation = a.anisotropyRotation
    }

    // Specular workflow
    if (a.specularIntensity !== undefined && a.specularIntensity > 0) {
      mat.specularIntensity = a.specularIntensity
    }
    if (a.specularColor) {
      const [r, g, b] = a.specularColor
      mat.specularColor = new THREE.Color(r, g, b)
    }

    // Emissive
    if (a.emissive) {
      const [r, g, b] = a.emissive
      mat.emissive = new THREE.Color(r, g, b)
      if (a.emissiveIntensity !== undefined) {
        mat.emissiveIntensity = a.emissiveIntensity
      }
    }

    // Normal scale
    if (a.normalScale !== undefined) {
      mat.normalScale = new THREE.Vector2(a.normalScale, a.normalScale)
    }

    // AO
    if (a.aoMapIntensity !== undefined) {
      mat.aoMapIntensity = a.aoMapIntensity
    }

    // Alpha
    this._applyAlpha(mat, a)

    // Sidedness
    mat.side = a.doubleSided ? THREE.DoubleSide : THREE.FrontSide

    // Polygon offset (CAD face overlap prevention)
    mat.polygonOffset = true
    mat.polygonOffsetFactor = -1
    mat.polygonOffsetUnits = -1

    // Synchronously apply any already-cached textures
    this._applyCachedTextures(mat, a)

    mat.needsUpdate = true
    return mat
  }

  private _applyCachedTextures(
    mat: THREE.MeshPhysicalMaterial,
    a: MaterialAppearance,
  ): void {
    const tc = this._textureCache
    if (!tc) return

    for (const key of TEXTURE_MAP_KEYS) {
      const url = (a as Record<string, unknown>)[key]
      if (typeof url !== 'string' || url.length === 0) continue

      const tex = tc.get(url)
      if (tex) {
        ;(mat as Record<string, unknown>)[key] = tex
      }
    }
  }

  private _applyAlpha(mat: THREE.MeshPhysicalMaterial, a: MaterialAppearance): void {
    const alpha = a.color?.[3]
    const mode: AlphaMode = a.alphaMode ?? 'OPAQUE'

    switch (mode) {
      case 'BLEND':
        mat.transparent = true
        mat.opacity = alpha ?? 1.0
        mat.depthWrite = true
        break
      case 'MASK':
        mat.transparent = false
        mat.alphaTest = a.alphaCutoff ?? 0.5
        mat.opacity = alpha ?? 1.0
        break
      case 'OPAQUE':
      default:
        if (a.transmission !== undefined && a.transmission > 0) {
          // Transmission already set opacity to 1.0 above
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

  private _buildKey(a: MaterialAppearance): string {
    // Stable JSON key — sort keys for deterministic hashing
    return JSON.stringify(a, Object.keys(a).sort())
  }
}
