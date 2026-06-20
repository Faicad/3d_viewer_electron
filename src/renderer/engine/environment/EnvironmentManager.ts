import * as THREE from 'three'
import { CleanRoomEnvironment } from './CleanRoomEnvironment'
import { HDR_PRESETS, getPresetUrl } from './hdrPresets'
import gsap from 'gsap'

function isCustomEnvId(source: string): boolean {
  return source.startsWith('custom_')
}

export type BackgroundMode =
  | 'grey'
  | 'darkgrey'
  | 'white'
  | 'gradient'
  | 'environment'
  | 'transparent'

const LOAD_TIMEOUT_MS = 30_000
const CLEANROOM_KEY = '__cleanroom__'
const INIT_PMREM_SIZE = 64

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
  private _rgbeLoader: any | null = null
  private _pmremSize: number
  /** GSAP tween for the current fade animation, or null if idle. */
  private _fadeTween: gsap.core.Tween | null = null
  /** Resources of the in-progress overlay to allow cleanup on cancel. */
  private _overlayScene: THREE.Scene | null = null
  private _overlayMesh: THREE.Mesh | null = null
  private _overlayMat: THREE.MeshBasicMaterial | null = null
  private _overlayRT: THREE.WebGLRenderTarget | null = null

  constructor(renderer: THREE.WebGLRenderer) {
    this._renderer = renderer
    this._pmrem = new THREE.PMREMGenerator(renderer)
    this._pmremSize = (typeof window !== 'undefined' && (window as any).__isSoftwareGpu) ? 128 : 2048
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
  // Procedural studio — dynamic floor height
  // ---------------------------------------------------------------------------

  /**
   * Re-bake the clean-room cubemap so the floor sits at a height adapted to
   * the model size.  Returns the new PMREM texture.
   *
   * @param bbox  Model bounding box [minX, minY, minZ, maxX, maxY, maxZ]
   *              in Z‑up scene coordinates.
   */
  adaptStudioToModel(bbox: [number, number, number, number, number, number]): THREE.Texture {
    const extent = Math.max(
      bbox[3] - bbox[0],
      bbox[4] - bbox[1],
      bbox[5] - bbox[2],
    )

    // Internal floor offset inside the Y‑up room (room-center to floor)
    const INTERNAL_FLOOR_Y = -0.9335

    // Target: floor at model bottom minus 15 % of model extent
    const targetFloorZ = bbox[2] - extent * 0.15
    // Convert scene‑Z target back to room position.y
    //   sceneZ = INTERNAL_FLOOR_Y + position.y  ⇒  position.y = sceneZ - INTERNAL_FLOOR_Y
    let positionY = targetFloorZ - INTERNAL_FLOOR_Y

    // Keep the floor at least 0.15 units below the capture point so it is
    // never clipped by the PMREM near plane (0.01).
    //   floorY = INTERNAL_FLOOR_Y + positionY  <  -0.15
    //   positionY  <  -0.15 - INTERNAL_FLOOR_Y  =  -0.15 + 0.9335  =  0.7835
    positionY = Math.max(-2, Math.min(0.78, positionY))

    // Dispose previous clean-room texture
    if (this._cleanRoomTex) {
      this._cleanRoomTex.dispose()
    }

    const room = new CleanRoomEnvironment()
    room.position.y = positionY
    const rt = this._pmrem.fromScene(room, 0, 0.01, 100, { size: this._pmremSize })
    this._cleanRoomTex = rt.texture
    this._cache.set(CLEANROOM_KEY, this._cleanRoomTex)
    this._currentTex = this._cleanRoomTex
    this._currentBgTex = null
    room.dispose()

    return this._cleanRoomTex
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
  async setEnvironment(source: string): Promise<THREE.Texture> {
    // Tier 1 sentinel
    if (source === CLEANROOM_KEY || source === 'studio') {
      this._currentTex = this._getOrCreateCleanRoom()
      this._currentBgTex = null
      return this._currentTex
    }

    // Custom env — restore from cache if previously loaded
    if (isCustomEnvId(source)) {
      const cached = this._cache.get(source)
      if (cached) {
        this._currentTex = cached
        this._currentBgTex = this._bgCache.get(source) ?? null
        return cached
      }
      return this._fallbackToCleanRoom()
    }

    // Resolve preset ID → CDN URL (or use source as raw URL if not a known preset)
    const url = this._resolveSource(source)

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

  /**
   * Load an environment from a local file buffer (HDR or EXR).
   * Caches under the given id so it can be restored later via setEnvironment(id).
   */
  async setEnvironmentFromFile(id: string, name: string, data: ArrayBuffer): Promise<THREE.Texture> {
    // Dispose previous textures for this id
    const prevTex = this._cache.get(id)
    if (prevTex) prevTex.dispose()
    this._cache.delete(id)
    const prevBg = this._bgCache.get(id)
    if (prevBg) prevBg.dispose()
    this._bgCache.delete(id)

    const ext = name.split('.').pop()?.toLowerCase()

    let texData: { width: number; height: number; data: Float32Array | Uint16Array; format?: THREE.PixelFormat; colorSpace?: string; type?: THREE.TextureDataType }

    if (ext === 'exr') {
      const { EXRLoader } = await import('three/examples/jsm/loaders/EXRLoader.js')
      const loader = new EXRLoader()
      loader.setDataType(THREE.HalfFloatType)
      texData = loader.parse(data)
    } else {
      const { HDRLoader } = await import('three/examples/jsm/loaders/HDRLoader.js')
      const loader = new HDRLoader()
      loader.setDataType(THREE.HalfFloatType)
      texData = loader.parse(data)
    }

    // Build DataTexture from TexData (parse() returns descriptor, not Texture)
    const equirectTex = new THREE.DataTexture(
      texData.data,
      texData.width,
      texData.height,
      texData.format,
      texData.type,
    )
    equirectTex.wrapS = THREE.ClampToEdgeWrapping
    equirectTex.wrapT = THREE.ClampToEdgeWrapping
    equirectTex.magFilter = THREE.LinearFilter
    equirectTex.minFilter = THREE.LinearFilter
    if (texData.colorSpace) equirectTex.colorSpace = texData.colorSpace as THREE.ColorSpace
    // HDRLoader writes scanlines top-to-bottom; WebGL expects bottom-to-top
    if (texData.flipY !== undefined) equirectTex.flipY = texData.flipY
    else if (ext !== 'exr') equirectTex.flipY = true
    equirectTex.mapping = THREE.EquirectangularReflectionMapping
    equirectTex.needsUpdate = true
    this._currentBgTex = equirectTex

    const rt = this._pmrem.fromEquirectangular(equirectTex)
    this._currentTex = rt.texture
    this._cache.set(id, this._currentTex)
    this._bgCache.set(id, equirectTex)

    return this._currentTex
  }

  /** Convert a preset ID to its CDN URL, or return the input unchanged if it's a raw URL. */
  _resolveSource(source: string): string {
    const preset = HDR_PRESETS.find((p) => p.id === source && p.slug)
    if (preset) return getPresetUrl(preset)
    return source
  }

  // ---------------------------------------------------------------------------
  // Fade transition
  // ---------------------------------------------------------------------------

  /** Cancel any in-progress fade animation and dispose overlay resources. */
  private _cancelFade(): void {
    if (this._fadeTween) {
      this._fadeTween.kill()
      this._fadeTween = null
    }
    this._disposeOverlay()
  }

  /** Dispose the overlay quad and render target if they exist. */
  private _disposeOverlay(): void {
    const { _overlayScene: scene, _overlayMesh: mesh, _overlayMat: mat, _overlayRT: rt } = this
    if (scene && mesh) scene.remove(mesh)
    if (mat) mat.dispose()
    if (mesh) mesh.geometry.dispose()
    if (rt) rt.dispose()
    this._overlayScene = null
    this._overlayMesh = null
    this._overlayMat = null
    this._overlayRT = null
  }

  /** Whether a fade animation is currently running. */
  isFading(): boolean {
    return this._fadeTween !== null
  }

  /**
   * Smoothly cross-fade the background image by capturing the current frame
   * as a fullscreen overlay, swapping textures underneath, then fading the
   * overlay out to reveal the new background.
   *
   * Fade animation is only performed in movie mode. In normal mode the
   * swapCallback is called directly without any animation.
   *
   * Model PBR lighting (`scene.environmentIntensity`) is NOT touched.
   *
   * @param scene            The Three.js scene.
   * @param camera           The active camera (used to render the capture).
   * @param duration         Total cross-fade duration in ms (default 1000).
   * @param swapCallback     Called immediately to swap `scene.background`
   *                         and `scene.environment` (invisible under overlay).
   * @param movieMode        If false, swap directly without animation.
   */
  async fadeEnvironment(
    scene: THREE.Scene,
    camera: THREE.Camera,
    duration: number = 1000,
    swapCallback: () => Promise<void>,
    movieMode: boolean = false,
  ): Promise<void> {
    if (!movieMode) {
      await swapCallback()
      return
    }

    this._cancelFade()

    const rect = this._renderer.domElement.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) {
      // Canvas not visible — skip animation, just swap
      await swapCallback()
      return
    }

    const pr = this._renderer.getPixelRatio()
    const rt = new THREE.WebGLRenderTarget(
      Math.floor(rect.width * pr),
      Math.floor(rect.height * pr),
    )

    // Capture the current frame (old background + current lighting)
    this._renderer.setRenderTarget(rt)
    this._renderer.render(scene, camera)
    this._renderer.setRenderTarget(null)

    // Fullscreen quad overlay showing the frozen frame
    const quadMat = new THREE.MeshBasicMaterial({
      map: rt.texture,
      transparent: true,
      opacity: 1,
      depthTest: false,
      depthWrite: false,
    })
    const quadMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), quadMat)
    quadMesh.renderOrder = 999
    quadMesh.frustumCulled = false
    this._positionOverlayQuad(quadMesh, camera)
    scene.add(quadMesh)

    // Track overlay resources for cleanup on cancel/dispose
    this._overlayScene = scene
    this._overlayMesh = quadMesh
    this._overlayMat = quadMat
    this._overlayRT = rt

    // Swap textures immediately (hidden under the overlay)
    try {
      await swapCallback()
    } catch (err) {
      console.warn('[EnvironmentManager] Fade swap failed, restoring:', err)
      scene.remove(quadMesh)
      quadMat.dispose()
      quadMesh.geometry.dispose()
      rt.dispose()
      this._overlayScene = null
      this._overlayMesh = null
      this._overlayMat = null
      this._overlayRT = null
      return
    }

    // Fade out the overlay → reveals new background underneath
    await this._fadeOutOverlay(scene, quadMesh, quadMat, camera, rt, duration)
  }

  /** Position and scale a PlaneGeometry(1,1) to fill the view of a camera. */
  private _positionOverlayQuad(mesh: THREE.Mesh, camera: THREE.Camera): void {
    const dist = 0.5
    const dir = new THREE.Vector3()
    camera.getWorldDirection(dir)
    mesh.position.copy(camera.position).add(dir.clone().multiplyScalar(dist))
    mesh.lookAt(camera.position)

    if (camera instanceof THREE.PerspectiveCamera) {
      const vFov = (camera.fov * Math.PI) / 180
      const height = 2 * Math.tan(vFov / 2) * dist
      const aspect =
        this._renderer.domElement.width / this._renderer.domElement.height
      mesh.scale.set(height * aspect, height, 1)
    }
  }

  /**
   * GSAP fade-out of the overlay quad, updating its screen-space position
   * each frame so it tracks the camera during the transition.
   */
  private _fadeOutOverlay(
    scene: THREE.Scene,
    mesh: THREE.Mesh,
    material: THREE.MeshBasicMaterial,
    camera: THREE.Camera,
    rt: THREE.WebGLRenderTarget,
    duration: number,
  ): Promise<void> {
    return new Promise((resolve) => {
      this._fadeTween = gsap.to(material, {
        opacity: 0,
        duration: duration / 1000,
        ease: 'sine.inOut',
        onUpdate: () => this._positionOverlayQuad(mesh, camera),
        onComplete: () => {
          scene.remove(mesh)
          material.dispose()
          mesh.geometry.dispose()
          rt.dispose()
          this._fadeTween = null
          this._overlayScene = null
          this._overlayMesh = null
          this._overlayMat = null
          this._overlayRT = null
          resolve()
        },
      })
    })
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
  applyBackground(scene: THREE.Scene, envRotation: number, upAxis: 'y' | 'z' = 'z'): void {
    const envXRot = upAxis === 'y' ? 0 : Math.PI / 2
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
          scene.backgroundRotation.set(envXRot, 0, envRotation, 'YXZ')
        } else if (this._currentTex) {
          // Procedural studio: use the PMREM cubemap (CubeUVReflectionMapping)
          // directly as background. Three.js r184 routes CubeUVReflectionMapping
          // textures through the cubemap skybox path, which supports
          // backgroundRotation correctly (unlike the equirect flat-plane path).
          scene.background = this._currentTex
          scene.backgroundRotation.set(envXRot, 0, envRotation, 'YXZ')
        } else {
          scene.background = this._createGradientBg()
        }
        break
      case 'transparent':
        scene.background = null
        break
    }
  }

  /** Update only the background rotation without replacing the texture. */
  setBackgroundRotation(scene: THREE.Scene, envRotation: number, upAxis: 'y' | 'z' = 'z'): void {
    if (this._backgroundMode === 'environment' && scene.background instanceof THREE.Texture) {
      const envXRot = upAxis === 'y' ? 0 : Math.PI / 2
      scene.backgroundRotation.set(envXRot, 0, envRotation, 'YXZ')
    }
  }

  setBackgroundMode(mode: BackgroundMode): void {
    this._backgroundMode = mode
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  dispose(): void {
    this._cancelFade()
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
      const rt = this._pmrem.fromScene(room, 0, 0.01, 100, { size: INIT_PMREM_SIZE })
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

  private async _loadEquirect(url: string): Promise<THREE.Texture> {
    if (!this._rgbeLoader) {
      const { RGBELoader } = await import('three/examples/jsm/loaders/RGBELoader.js')
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
