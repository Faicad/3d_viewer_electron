import * as THREE from 'three'
import {
  EffectComposer,
  RenderPass,
  EffectPass,
  SMAAEffect,
  ToneMappingEffect,
  ToneMappingMode,
} from 'postprocessing'
import { N8AOPostPass } from 'n8ao'

/**
 * Adaptive post-processing composer.
 *
 * Pass chain: RenderPass → N8AOPostPass (SSAO) → EffectPass (ToneMapping + SMAA)
 *
 * Features:
 * - HalfFloat FBO for HDR tone mapping
 * - SSAO pauses during camera interaction, resumes 300 ms after idle
 * - SMAA and SSAO can be toggled at runtime
 */
export class AdaptiveComposer {
  private _composer: EffectComposer
  private _renderPass: RenderPass
  private _n8aoPass: N8AOPostPass | null = null
  private _toneMapping: ToneMappingEffect
  private _smaa: SMAAEffect
  private _effectPass: EffectPass

  private _interactionTimeout: ReturnType<typeof setTimeout> | null = null
  private _interacting = false

  private _ssaoEnabled = true
  private _smaaEnabled = true

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ) {
    // Composer with HalfFloat FBO
    this._composer = new EffectComposer(renderer, {
      frameBufferType: THREE.HalfFloatType,
      multisampling: 0,
    })

    this._renderPass = new RenderPass(scene, camera)
    this._composer.addPass(this._renderPass)

    // Tone mapping — always enabled
    this._toneMapping = new ToneMappingEffect({
      mode: ToneMappingMode.NEUTRAL,
    })

    // SMAA
    this._smaa = new SMAAEffect()

    // Effect pass: tone mapping → SMAA
    this._effectPass = new EffectPass(camera, this._toneMapping, this._smaa)
    this._composer.addPass(this._effectPass)

  }

  // ---------------------------------------------------------------------------
  // SSAO
  // ---------------------------------------------------------------------------

  /** Enable / disable SSAO at runtime. */
  setSsaoEnabled(enabled: boolean): void {
    if (enabled === this._ssaoEnabled) return
    this._ssaoEnabled = enabled

    if (enabled && this._n8aoPass) {
      if (!this._interacting) {
        this._composer.addPass(this._n8aoPass, 1)
      }
    } else if (!enabled && this._n8aoPass) {
      this._composer.removePass(this._n8aoPass)
    }
  }

  /** Create the N8AO pass lazily (needs scene + camera). */
  enableSsao(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    if (this._n8aoPass) return
    const renderer = this._composer.getRenderer()
    if (!renderer) return

    const size = renderer.getSize(new THREE.Vector2())
    this._n8aoPass = new N8AOPostPass(scene, camera, size.x, size.y)

    this._n8aoPass.configuration.aoRadius = 2.0
    this._n8aoPass.configuration.distanceFalloff = 0.5
    this._n8aoPass.configuration.intensity = 1.5
    this._n8aoPass.configuration.halfRes = true
    this._n8aoPass.configuration.depthAwareUpsampling = true
    this._n8aoPass.configuration.gammaCorrection = false
    this._n8aoPass.setQualityMode('Medium')

    if (this._ssaoEnabled && !this._interacting) {
      this._composer.addPass(this._n8aoPass, 1)
    }
  }

  // ---------------------------------------------------------------------------
  // SMAA
  // ---------------------------------------------------------------------------

  setSmaaEnabled(enabled: boolean): void {
    this._smaaEnabled = enabled
    this._smaa.enabled = enabled
  }

  // ---------------------------------------------------------------------------
  // Tone mapping
  // ---------------------------------------------------------------------------

  setToneMappingMode(mode: 'neutral' | 'aces' | 'linear'): void {
    switch (mode) {
      case 'neutral':
        this._toneMapping.setMode(ToneMappingMode.NEUTRAL)
        break
      case 'aces':
        this._toneMapping.setMode(ToneMappingMode.ACES_FILMIC)
        break
      case 'linear':
        this._toneMapping.setMode(ToneMappingMode.LINEAR)
        break
    }
  }

  // ---------------------------------------------------------------------------
  // AO intensity
  // ---------------------------------------------------------------------------

  setAoIntensity(intensity: number): void {
    if (this._n8aoPass) {
      this._n8aoPass.configuration.intensity = intensity
    }
  }

  /** Direct exposure control (maps to renderer.toneMappingExposure). */
  setExposure(value: number): void {
    const renderer = this._composer.getRenderer()
    if (renderer) renderer.toneMappingExposure = value
  }

  // ---------------------------------------------------------------------------
  // Interaction degradation
  // ---------------------------------------------------------------------------

  /** Call when the user starts rotating / panning / zooming. */
  onInteractionStart(): void {
    this._interacting = true
    if (this._interactionTimeout) {
      clearTimeout(this._interactionTimeout)
      this._interactionTimeout = null
    }
    if (this._n8aoPass && this._ssaoEnabled) {
      this._composer.removePass(this._n8aoPass)
    }
  }

  /** Call when the user stops interacting. SSAO resumes after 300 ms. */
  onInteractionEnd(): void {
    this._interactionTimeout = setTimeout(() => {
      this._interacting = false
      if (this._n8aoPass && this._ssaoEnabled) {
        this._composer.addPass(this._n8aoPass, 1)
      }
      this._interactionTimeout = null
    }, 300)
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  render(deltaTime: number): void {
    this._composer.render(deltaTime)
  }

  setSize(width: number, height: number): void {
    this._composer.setSize(width, height)
    if (this._n8aoPass) {
      this._n8aoPass.setSize(width, height)
    }
  }

  dispose(): void {
    if (this._interactionTimeout) clearTimeout(this._interactionTimeout)
    if (this._n8aoPass) {
      this._n8aoPass.dispose()
      this._n8aoPass = null
    }
    this._composer.dispose()
  }
}
