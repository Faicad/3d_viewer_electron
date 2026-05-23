import * as THREE from 'three'
import {
  EffectComposer,
  RenderPass,
  EffectPass,
  SMAAEffect,
  ToneMappingEffect,
  ToneMappingMode,
} from 'postprocessing'

/**
 * Adaptive post-processing composer.
 *
 * Pass chain: RenderPass → EffectPass (ToneMapping + SMAA)
 *
 * Features:
 * - HalfFloat FBO for HDR tone mapping
 * - SMAA can be toggled at runtime
 */
export class AdaptiveComposer {
  private _composer: EffectComposer
  private _renderPass: RenderPass
  private _toneMapping: ToneMappingEffect
  private _smaa: SMAAEffect
  private _effectPass: EffectPass

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
  // Exposure
  // ---------------------------------------------------------------------------

  /** Direct exposure control (maps to renderer.toneMappingExposure). */
  setExposure(value: number): void {
    const renderer = this._composer.getRenderer()
    if (renderer) renderer.toneMappingExposure = value
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  render(deltaTime: number): void {
    this._composer.render(deltaTime)
  }

  setSize(width: number, height: number): void {
    this._composer.setSize(width, height)
  }

  dispose(): void {
    this._composer.dispose()
  }
}
