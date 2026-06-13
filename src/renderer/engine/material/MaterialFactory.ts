import * as THREE from 'three'
import type { MaterialAppearance, AlphaMode } from './types'
import { TextureCache, getMapColorSpace, TEXTURE_MAP_KEYS } from './TextureCache'
import { applyAllScalars } from './property-map'

const SRGB = THREE.SRGBColorSpace

// ---- Shared singletons ----

let _instance: MaterialFactory | null = null
let _textureCacheInstance: TextureCache | null = null

export function getSharedMaterialFactory(): MaterialFactory {
  if (!_instance) {
    _instance = new MaterialFactory()
    _instance.setTextureCache(getSharedTextureCache())
  }
  return _instance
}

export function getSharedTextureCache(): TextureCache {
  if (!_textureCacheInstance) _textureCacheInstance = new TextureCache()
  return _textureCacheInstance
}

export function disposeSharedMaterialFactory(): void {
  _instance?.dispose()
  _instance = null
  _textureCacheInstance?.dispose()
  _textureCacheInstance = null
}

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
    // ── Unlit branch ──
    if (a.unlit) {
      return this._buildBasicMaterial(a)
    }

    const mat = new THREE.MeshPhysicalMaterial()

    // Colour — always sRGB
    if (a.color) {
      const [r, g, b] = a.color
      mat.color.setRGB(r, g, b, SRGB)
    }

    // Transmission (glass / acrylic) — special: forces opacity to 1.0
    if (a.transmission !== undefined && a.transmission > 0) {
      mat.transmission = a.transmission
      mat.opacity = 1.0
      mat.transparent = a.alphaMode !== 'OPAQUE' || a.transmission > 0
    }

    // Emissive — special: skips when black
    if (a.emissive) {
      const [r, g, b] = a.emissive
      mat.emissive = new THREE.Color(r, g, b)
      if (a.emissiveIntensity !== undefined) {
        mat.emissiveIntensity = a.emissiveIntensity
      }
    }

    // All mapped scalar properties — single call replaces the manual
    // per-property blocks for: roughness, metalness, clearcoat, sheen,
    // anisotropy, specular, attenuation, normalScale, aoMapIntensity, etc.
    applyAllScalars(mat, a)

    // Alpha — multi-field logic
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

  /**
   * Build a MeshBasicMaterial for unlit materials.
   * Only applies properties relevant to Basic materials (color, map, alpha).
   */
  private _buildBasicMaterial(a: MaterialAppearance): THREE.MeshBasicMaterial {
    const mat = new THREE.MeshBasicMaterial()

    if (a.color) {
      const [r, g, b] = a.color
      mat.color.setRGB(r, g, b, SRGB)
    }

    mat.side = a.doubleSided ? THREE.DoubleSide : THREE.FrontSide

    // Alpha
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
        mat.transparent = false
        if (alpha !== undefined && alpha < 1.0) {
          mat.transparent = true
          mat.opacity = alpha
        }
        break
    }

    // Apply cached textures that are relevant for Basic materials
    const tc = this._textureCache
    if (tc) {
      for (const slot of ['map', 'alphaMap'] as const) {
        const url = (a as Record<string, unknown>)[slot]
        if (typeof url === 'string' && url.length > 0) {
          const tex = tc.get(url)
          if (tex) {
            ;(mat as Record<string, unknown>)[slot] = tex
          }
        }
      }
    }

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
