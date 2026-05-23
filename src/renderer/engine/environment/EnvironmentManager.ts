import * as THREE from 'three'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import { CleanRoomEnvironment } from './CleanRoomEnvironment'
import { HDR_PRESETS, getPresetUrl } from './hdrPresets'

export type BackgroundMode =
  | 'grey'
  | 'darkgrey'
  | 'white'
  | 'gradient'
  | 'environment'
  | 'transparent'

const LOAD_TIMEOUT_MS = 30_000
const CLEANROOM_KEY = '__cleanroom__'

/**
 * Three-tier environment manager for PBR image-based lighting.
 *
 * Tier 1 — CleanRoomEnvironment (procedural, always available)
 * Tier 2 — Poly Haven HDR presets from CDN (with fallback to Tier 1)
 * Tier 3 — User-provided HDR URL (with fallback to Tier 1)
 *
 * PMREM textures are cached and inflight requests are deduplicated so
 * that concurrent calls for the same source only trigger one load.
 */
export class EnvironmentManager {
  private _renderer: THREE.WebGLRenderer
  private _pmrem: THREE.PMREMGenerator
  private _cache = new Map<string, THREE.Texture>()
  /** Caches equirectangular textures for background display (keyed by source). */
  private _bgCache = new Map<string, THREE.Texture>()
  private _inflight = new Map<string, Promise<THREE.Texture>>()
  private _cleanRoomTex: THREE.Texture | null = null
  private _currentTex: THREE.Texture | null = null
  /** Original equirectangular texture kept for background display. */
  private _currentBgTex: THREE.Texture | null = null
  private _backgroundMode: BackgroundMode = 'grey'
  private _rgbeLoader: RGBELoader | null = null

  constructor(renderer: THREE.WebGLRenderer) {
    this._renderer = renderer
    this._pmrem = new THREE.PMREMGenerator(renderer)
  }

  /** The currently active PMREM environment texture. */
  get currentTexture(): THREE.Texture | null {
    return this._currentTex
  }

  /** The original equirectangular texture for background display, or null. */
  get backgroundTexture(): THREE.Texture | null {
    return this._currentBgTex
  }

  get backgroundMode(): BackgroundMode {
    return this._backgroundMode
  }

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  /** Build Tier-1 CleanRoom and set it as the active environment. */
  initDefault(): void {
    this._currentTex = this._getOrCreateCleanRoom()
  }

  // ---------------------------------------------------------------------------
  // Environment loading
  // ---------------------------------------------------------------------------

  /**
   * Load an environment by preset name, HDR URL, or the special
   * `"__cleanroom__"` / `"studio"` keys that force Tier 1.
   *
   * Returns the PMREM texture that was applied (or the fallback on error).
   */
  async setEnvironment(source: string, use4k = false): Promise<THREE.Texture> {
    // Tier 1 sentinel
    if (source === CLEANROOM_KEY || source === 'studio') {
      this._currentTex = this._getOrCreateCleanRoom()
      this._currentBgTex = null
      return this._currentTex
    }

    // Resolve preset ID → CDN URL (or use source as raw URL if not a known preset)
    const url = this._resolveSource(source, use4k)

    // Cache hit — restore both PMREM and equirectangular background
    const cached = this._cache.get(source)
    if (cached) {
      this._currentTex = cached
      const cachedBg = this._bgCache.get(source)
      if (cachedBg) this._currentBgTex = cachedBg
      return cached
    }

    // Inflight dedup — wait for the existing promise
    const inflight = this._inflight.get(source)
    if (inflight) {
      try {
        this._currentTex = await inflight
        return this._currentTex
      } catch {
        return this._fallbackToCleanRoom()
      }
    }

    // Kick off a new load
    const promise = this._loadWithTimeout(url)
    this._inflight.set(source, promise)

    try {
      const tex = await promise
      this._cache.set(source, tex)
      if (this._currentBgTex) {
        this._bgCache.set(source, this._currentBgTex)
      }
      this._currentTex = tex
      return tex
    } catch {
      return this._fallbackToCleanRoom()
    } finally {
      this._inflight.delete(source)
    }
  }

  /** Convert a preset ID to its CDN URL, or return the input unchanged if it's a raw URL. */
  _resolveSource(source: string, use4k = false): string {
    const preset = HDR_PRESETS.find((p) => p.id === source && p.slug)
    if (preset) return getPresetUrl(preset, use4k)
    return source
  }

  // ---------------------------------------------------------------------------
  // Background
  // ---------------------------------------------------------------------------

  /**
   * Apply the current background mode to *scene*.
   * Call this whenever the mode or the active environment changes.
   *
   * Only replaces `scene.background` when the texture/mode actually changes.
   * Rotation-only updates should use `setBackgroundRotation` instead.
   */
  applyBackground(scene: THREE.Scene, envRotation: number): void {
    switch (this._backgroundMode) {
      case 'grey':
        scene.background = new THREE.Color(0x888888)
        break
      case 'darkgrey':
        scene.background = new THREE.Color(0x444444)
        break
      case 'white':
        scene.background = new THREE.Color(0xffffff)
        break
      case 'gradient':
        scene.background = this._createGradientBg()
        break
      case 'environment':
        if (this._currentBgTex) {
          scene.background = this._currentBgTex
          scene.backgroundRotation.set(0, envRotation, 0, 'YXZ')
        } else {
          // CleanRoom has no equirect source — fall back to gradient
          scene.background = this._createGradientBg()
        }
        break
      case 'transparent':
        scene.background = null
        break
    }
  }

  /** Update only the background rotation without replacing the texture. */
  setBackgroundRotation(scene: THREE.Scene, envRotation: number): void {
    if (this._backgroundMode === 'environment' && scene.background instanceof THREE.Texture) {
      scene.backgroundRotation.set(0, envRotation, 0, 'YXZ')
    }
  }

  setBackgroundMode(mode: BackgroundMode): void {
    this._backgroundMode = mode
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  dispose(): void {
    for (const tex of this._cache.values()) tex.dispose()
    this._cache.clear()
    for (const tex of this._bgCache.values()) tex.dispose()
    this._bgCache.clear()
    this._inflight.clear()
    this._pmrem.dispose()
    this._cleanRoomTex = null
    this._currentTex = null
    this._currentBgTex = null
    this._rgbeLoader = null
  }

  // ---------------------------------------------------------------------------
  // Private — Tier 1
  // ---------------------------------------------------------------------------

  private _getOrCreateCleanRoom(): THREE.Texture {
    if (!this._cleanRoomTex) {
      const room = new CleanRoomEnvironment()
      const rt = this._pmrem.fromScene(room.scene, 0.04)
      this._cleanRoomTex = rt.texture
      this._cache.set(CLEANROOM_KEY, this._cleanRoomTex)
      room.dispose()
    }
    return this._cleanRoomTex
  }

  private _fallbackToCleanRoom(): THREE.Texture {
    console.warn('[EnvironmentManager] Falling back to CleanRoom environment')
    this._currentTex = this._getOrCreateCleanRoom()
    return this._currentTex
  }

  // ---------------------------------------------------------------------------
  // Private — HDR loading
  // ---------------------------------------------------------------------------

  private async _loadWithTimeout(url: string): Promise<THREE.Texture> {
    const equirectTex = await Promise.race([
      this._loadEquirect(url),
      new Promise<THREE.Texture>((_, reject) =>
        setTimeout(() => reject(new Error(`HDR load timeout: ${url}`)), LOAD_TIMEOUT_MS),
      ),
    ])

    const rt = this._pmrem.fromEquirectangular(equirectTex)
    // The equirectangular source is kept for background display (cached in _bgCache).
    // PMREM result (rt.texture) is used for IBL lighting only.
    this._currentBgTex = equirectTex
    return rt.texture
  }

  private _loadEquirect(url: string): Promise<THREE.Texture> {
    if (!this._rgbeLoader) {
      this._rgbeLoader = new RGBELoader()
      this._rgbeLoader.setDataType(THREE.HalfFloatType)
    }
    return this._rgbeLoader.loadAsync(url).then((tex) => {
      // HDRLoader does not set mapping — must be set explicitly for 360° background
      tex.mapping = THREE.EquirectangularReflectionMapping
      return tex
    })
  }

  // ---------------------------------------------------------------------------
  // Private — background
  // ---------------------------------------------------------------------------

  private _createGradientBg(): THREE.Texture {
    // 2×64-pixel vertical gradient from a mid-grey to a lighter grey
    const size = 64
    const canvas = document.createElement('canvas')
    canvas.width = 2
    canvas.height = size
    const ctx = canvas.getContext('2d')!
    const gradient = ctx.createLinearGradient(0, 0, 0, size)
    gradient.addColorStop(0, '#b0b5ba')
    gradient.addColorStop(1, '#d5d8dc')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 2, size)

    const tex = new THREE.CanvasTexture(canvas)
    tex.mapping = THREE.EquirectangularReflectionMapping
    tex.minFilter = THREE.LinearFilter
    tex.magFilter = THREE.LinearFilter
    tex.generateMipmaps = false
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }
}
