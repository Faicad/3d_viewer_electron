import * as THREE from 'three'

const SRGB = THREE.SRGBColorSpace
const LINEAR = THREE.LinearSRGBColorSpace

/** Map keys that store sRGB colour data. */
const SRGB_MAP_KEYS = new Set([
  'map',
  'emissiveMap',
  'sheenColorTexture',
  'specularColorTexture',
])

/**
 * Lazy-loading texture cache with in-flight deduplication.
 *
 * Usage:
 * ```ts
 * const cache = new TextureCache()
 * const tex = await cache.load(url, 'sRGB')
 * // later:
 * const sameTex = cache.get(url) // cached
 * ```
 */
export class TextureCache {
  private _cache = new Map<string, THREE.Texture>()
  private _inflight = new Map<string, Promise<THREE.Texture>>()
  private _loader: THREE.TextureLoader | null = null
  maxAnisotropy = 16

  private _getLoader(): THREE.TextureLoader {
    if (!this._loader) this._loader = new THREE.TextureLoader()
    return this._loader
  }

  /**
   * Load a texture from `url` (supports http/https, data: URIs, and local file
   * paths). If the URL is already cached or in-flight, reuses the existing
   * promise / texture.
   */
  async load(url: string, colorSpace: 'sRGB' | 'linear'): Promise<THREE.Texture> {
    const cached = this._cache.get(url)
    if (cached) return cached

    const inflight = this._inflight.get(url)
    if (inflight) return inflight

    const promise = new Promise<THREE.Texture>((resolve, reject) => {
      this._getLoader().load(
        url,
        (tex) => {
          tex.colorSpace = colorSpace === 'sRGB' ? SRGB : LINEAR
          if (tex.anisotropy !== undefined) {
            tex.anisotropy = this.maxAnisotropy
          }
          tex.needsUpdate = true
          resolve(tex)
        },
        undefined,
        (err) => reject(err),
      )
    })

    this._inflight.set(url, promise)
    try {
      const tex = await promise
      this._cache.set(url, tex)
      return tex
    } finally {
      this._inflight.delete(url)
    }
  }

  /** Synchronously retrieve a cached texture, or `undefined`. */
  get(url: string): THREE.Texture | undefined {
    return this._cache.get(url)
  }

  /** Whether a texture URL is already cached. */
  has(url: string): boolean {
    return this._cache.has(url)
  }

  /** Number of cached textures. */
  cacheCount(): number {
    return this._cache.size
  }

  /** Dispose all cached textures and clear in-flight requests. */
  dispose(): void {
    for (const tex of this._cache.values()) tex.dispose()
    this._cache.clear()
    this._inflight.clear()
  }

  /** Full teardown — dispose textures and release the loader. */
  disposeFull(): void {
    this.dispose()
    this._loader = null
  }
}

/**
 * Return the appropriate Three.js colour space for a texture map key.
 *
 * - sRGB: base colour, emissive, sheen colour, specular colour
 * - Linear: normals, roughness, metalness, AO, transmission, displacement, etc.
 */
export function getMapColorSpace(mapKey: string): 'sRGB' | 'linear' {
  return SRGB_MAP_KEYS.has(mapKey) ? 'sRGB' : 'linear'
}

/** Map keys that reference textures on `MaterialAppearance`. */
export const TEXTURE_MAP_KEYS = [
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
] as const
