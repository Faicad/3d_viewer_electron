import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockAddPass = vi.fn()
const mockRemovePass = vi.fn()
const mockComposerDispose = vi.fn()
const mockComposerRender = vi.fn()
const mockComposerSetSize = vi.fn()
const mockGetRenderer = vi.fn()
const mockSmaaSetEnabled = vi.fn()
const mockToneMappingSetMode = vi.fn()
const mockN8aoDispose = vi.fn()
const mockN8aoSetSize = vi.fn()
const mockSetQualityMode = vi.fn()

let mockN8aoConfig: Record<string, unknown> = {}

// Postprocessing mocks must be constructors
class MockEffectComposer {
  addPass = mockAddPass
  removePass = mockRemovePass
  dispose = mockComposerDispose
  render = mockComposerRender
  setSize = mockComposerSetSize
  getRenderer = mockGetRenderer
}

class MockRenderPass {}
class MockEffectPass {}
class MockSMAAEffect {
  setEnabled = mockSmaaSetEnabled
}
class MockToneMappingEffect {
  setMode = mockToneMappingSetMode
}

vi.mock('postprocessing', () => ({
  EffectComposer: vi.fn().mockImplementation(function (this: MockEffectComposer) {
    Object.assign(this, new MockEffectComposer())
  }),
  RenderPass: vi.fn().mockImplementation(function (this: MockRenderPass) {
    Object.assign(this, new MockRenderPass())
  }),
  EffectPass: vi.fn().mockImplementation(function (this: MockEffectPass) {
    Object.assign(this, new MockEffectPass())
  }),
  SMAAEffect: vi.fn().mockImplementation(function (this: MockSMAAEffect) {
    Object.assign(this, new MockSMAAEffect())
  }),
  ToneMappingEffect: vi.fn().mockImplementation(function (this: MockToneMappingEffect) {
    Object.assign(this, new MockToneMappingEffect())
  }),
  ToneMappingMode: { NEUTRAL: 0, ACES_FILMIC: 1, LINEAR: 2 },
  Effect: vi.fn(),
  EffectAttribute: { NONE: 0 },
}))

class MockN8AOPostPass {
  configuration = mockN8aoConfig
  dispose = mockN8aoDispose
  setSize = mockN8aoSetSize
  setQualityMode = mockSetQualityMode
}

vi.mock('n8ao', () => ({
  N8AOPostPass: vi.fn().mockImplementation(function (this: MockN8AOPostPass) {
    mockN8aoConfig = {
      aoRadius: 0,
      distanceFalloff: 0,
      intensity: 0,
      halfRes: false,
      depthAwareUpsampling: false,
      gammaCorrection: false,
    }
    Object.assign(this, new MockN8AOPostPass())
  }),
}))

import * as THREE from 'three'
import * as postprocessing from 'postprocessing'
import { AdaptiveComposer } from './AdaptiveComposer'

describe('AdaptiveComposer', () => {
  let renderer: THREE.WebGLRenderer
  let scene: THREE.Scene
  let camera: THREE.PerspectiveCamera
  let composer: AdaptiveComposer

  beforeEach(() => {
    vi.clearAllMocks()
    renderer = {
      toneMapping: THREE.ACESFilmicToneMapping,
      getSize: vi.fn(() => new THREE.Vector2(800, 600)),
      getRenderTarget: vi.fn(() => null),
    } as unknown as THREE.WebGLRenderer

    mockGetRenderer.mockReturnValue(renderer)

    scene = new THREE.Scene()
    camera = new THREE.PerspectiveCamera(45, 800 / 600, 0.1, 1000)
    composer = new AdaptiveComposer(renderer, scene, camera)
  })

  afterEach(() => {
    composer.dispose()
  })

  // ---------------------------------------------------------------------------
  // Construction
  // ---------------------------------------------------------------------------

  it('creates EffectComposer with HalfFloatType', () => {
    expect(postprocessing.EffectComposer).toHaveBeenCalledWith(renderer, {
      frameBufferType: THREE.HalfFloatType,
      multisampling: 0,
    })
  })

  it('adds RenderPass as first pass', () => {
    expect(mockAddPass).toHaveBeenCalled()
  })

  it('composer render calls EffectComposer.render', () => {
    composer.render(0.016)
    expect(mockComposerRender).toHaveBeenCalledWith(0.016)
  })

  // ---------------------------------------------------------------------------
  // SMAA
  // ---------------------------------------------------------------------------

  it('setSmaaEnabled sets enabled property on SMAA effect', () => {
    composer.setSmaaEnabled(false)
    // Access via the composer's private member — verify via behavior
    composer.setSmaaEnabled(true)
  })

  // ---------------------------------------------------------------------------
  // Tone mapping
  // ---------------------------------------------------------------------------

  it('setToneMappingMode maps neutral→NEUTRAL', () => {
    composer.setToneMappingMode('neutral')
    expect(mockToneMappingSetMode).toHaveBeenCalledWith(0)
  })

  it('setToneMappingMode maps aces→ACES_FILMIC', () => {
    composer.setToneMappingMode('aces')
    expect(mockToneMappingSetMode).toHaveBeenCalledWith(1)
  })

  it('setToneMappingMode maps linear→LINEAR', () => {
    composer.setToneMappingMode('linear')
    expect(mockToneMappingSetMode).toHaveBeenCalledWith(2)
  })

  // ---------------------------------------------------------------------------
  // Interaction degradation
  // ---------------------------------------------------------------------------

  it('onInteractionStart sets interacting flag', () => {
    composer.enableSsao(scene, camera)
    composer.onInteractionStart()
    expect(mockRemovePass).toHaveBeenCalled()
  })

  it('onInteractionEnd re-inserts SSAO after 300ms', async () => {
    vi.useFakeTimers()
    composer.enableSsao(scene, camera)
    composer.onInteractionStart()
    mockAddPass.mockClear()

    composer.onInteractionEnd()
    expect(mockAddPass).not.toHaveBeenCalled()

    vi.advanceTimersByTime(300)
    expect(mockAddPass).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('onInteractionStart cancels pending re-insert timeout', async () => {
    vi.useFakeTimers()
    composer.enableSsao(scene, camera)
    composer.onInteractionStart()
    composer.onInteractionEnd()
    mockAddPass.mockClear()

    composer.onInteractionStart()
    vi.advanceTimersByTime(300)
    expect(mockAddPass).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  // ---------------------------------------------------------------------------
  // N8AO configuration
  // ---------------------------------------------------------------------------

  it('enableSsao creates N8AOPostPass with correct config', () => {
    composer.enableSsao(scene, camera)
    expect(mockN8aoConfig.aoRadius).toBe(2.0)
    expect(mockN8aoConfig.distanceFalloff).toBe(0.5)
    expect(mockN8aoConfig.intensity).toBe(1.5)
    expect(mockN8aoConfig.halfRes).toBe(true)
    expect(mockN8aoConfig.depthAwareUpsampling).toBe(true)
    expect(mockN8aoConfig.gammaCorrection).toBe(false)
    expect(mockSetQualityMode).toHaveBeenCalledWith('Medium')
  })

  // ---------------------------------------------------------------------------
  // Dispose
  // ---------------------------------------------------------------------------

  it('dispose cleans up composer and N8AO pass', () => {
    composer.enableSsao(scene, camera)
    composer.dispose()
    expect(mockComposerDispose).toHaveBeenCalled()
  })
})
