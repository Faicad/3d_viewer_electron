// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { createRoot } from 'react-dom/client'
import * as THREE from 'three'
import { useEngineStore } from '@/stores/engine-store'

const {
  mockComposerDispose,
  mockComposerRender,
  mockComposerSetSize,
  mockComposerSetSmaa,
  mockComposerSetTone,
  mockGlState,
  mockShadowMap,
} = vi.hoisted(() => {
  const gState = {
    toneMapping: 0,
    autoClear: false,
    localClippingEnabled: false,
    outputColorSpace: '',
  }
  const sMap = { enabled: true }

  return {
    mockComposerDispose: vi.fn(),
    mockComposerRender: vi.fn(),
    mockComposerSetSize: vi.fn(),
    mockComposerSetSmaa: vi.fn(),
    mockComposerSetTone: vi.fn(),
    mockGlState: gState,
    mockShadowMap: sMap,
  }
})

vi.mock('@react-three/fiber', () => ({
  useThree: () => {
    const gl = {
      get toneMapping() { return mockGlState.toneMapping },
      set toneMapping(v: number) { mockGlState.toneMapping = v },
      get autoClear() { return mockGlState.autoClear },
      set autoClear(v: boolean) { mockGlState.autoClear = v },
      get localClippingEnabled() { return mockGlState.localClippingEnabled },
      set localClippingEnabled(v: boolean) { mockGlState.localClippingEnabled = v },
      get outputColorSpace() { return mockGlState.outputColorSpace },
      set outputColorSpace(v: string) { mockGlState.outputColorSpace = v },
      get shadowMap() { return mockShadowMap },
      set shadowMap(_v: unknown) {},
    }
    return {
      gl,
      scene: new THREE.Scene(),
      camera: new THREE.PerspectiveCamera(),
      size: { width: 800, height: 600 },
    }
  },
  useFrame: vi.fn(),
}))

vi.mock('../../composer/AdaptiveComposer', () => {
  return {
    AdaptiveComposer: class MockAdaptiveComposer {
      setSmaaEnabled = mockComposerSetSmaa
      setToneMappingMode = mockComposerSetTone
      render = mockComposerRender
      setSize = mockComposerSetSize
      dispose = mockComposerDispose
    },
  }
})

import PostProcessing from '../PostProcessing'

let _cleanup: (() => void) | null = null

function renderComponent() {
  if (_cleanup) {
    _cleanup()
    _cleanup = null
  }

  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  React.act(() => {
    root.render(React.createElement(PostProcessing))
  })

  _cleanup = () => {
    React.act(() => { root.unmount() })
    document.body.removeChild(container)
  }
}

function resetStore() {
  useEngineStore.setState({
    postProcessingEnabled: true,
    studioMode: true,
    smaaEnabled: true,
    toneMappingMode: 'neutral',
  })
}

describe('PostProcessing — studioMode subscription', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGlState.toneMapping = THREE.NoToneMapping
    mockGlState.autoClear = false
    mockGlState.localClippingEnabled = false
    mockShadowMap.enabled = true
    resetStore()
  })

  afterEach(() => {
    if (_cleanup) { _cleanup(); _cleanup = null }
  })

  it('sets renderer to CAD mode when studioMode changes to false', () => {
    renderComponent()

    useEngineStore.getState().setStudioMode(false)

    expect(mockGlState.localClippingEnabled).toBe(true)
    expect(mockShadowMap.enabled).toBe(false)
    expect(mockGlState.toneMapping).toBe(THREE.NeutralToneMapping)
    expect(mockGlState.autoClear).toBe(true)
  })

  it('sets renderer to Studio mode when studioMode changes to true', () => {
    useEngineStore.getState().setStudioMode(false)

    renderComponent()

    useEngineStore.getState().setStudioMode(true)

    expect(mockGlState.localClippingEnabled).toBe(false)
    expect(mockShadowMap.enabled).toBe(true)
    expect(mockGlState.toneMapping).toBe(THREE.NoToneMapping)
    expect(mockGlState.autoClear).toBe(false)
  })

  it('does not fire when studioMode is unchanged', () => {
    renderComponent()

    useEngineStore.getState().setStudioMode(true)

    expect(mockGlState.localClippingEnabled).toBe(false)
    expect(mockShadowMap.enabled).toBe(true)
  })
})
