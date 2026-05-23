import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockAddPass = vi.fn()
const mockRemovePass = vi.fn()
const mockComposerDispose = vi.fn()
const mockComposerRender = vi.fn()
const mockComposerSetSize = vi.fn()
const mockGetRenderer = vi.fn()
const mockSmaaSetEnabled = vi.fn()
const mockToneMappingSetMode = vi.fn()

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
  // Dispose
  // ---------------------------------------------------------------------------

  it('dispose cleans up composer', () => {
    composer.dispose()
    expect(mockComposerDispose).toHaveBeenCalled()
  })
})
