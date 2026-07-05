// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { useEngineStore } from '@/stores/engine-store'

const {
  mockToastInfo,
  mockTryToggleCrossSection,
  mockTryToggleZebra,
  mockTryToggleDraftAnalysis,
  mockTryToggleSurfaceAnalysis,
  mockTryToggleCurvatureComb,
} = vi.hoisted(() => ({
  mockToastInfo: vi.fn(),
  mockTryToggleCrossSection: vi.fn(),
  mockTryToggleZebra: vi.fn(),
  mockTryToggleDraftAnalysis: vi.fn(),
  mockTryToggleSurfaceAnalysis: vi.fn(),
  mockTryToggleCurvatureComb: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: { info: mockToastInfo },
}))

vi.mock('@/stores/cross-section-store', () => ({
  tryToggleCrossSection: mockTryToggleCrossSection,
}))

vi.mock('@/stores/zebra-store', () => ({
  tryToggleZebra: mockTryToggleZebra,
}))

vi.mock('@/stores/draft-analysis-store', () => ({
  tryToggleDraftAnalysis: mockTryToggleDraftAnalysis,
}))

vi.mock('@/stores/surface-analysis-store', () => ({
  tryToggleSurfaceAnalysis: mockTryToggleSurfaceAnalysis,
}))

vi.mock('@/stores/curvature-comb-store', () => ({
  tryToggleCurvatureComb: mockTryToggleCurvatureComb,
}))

const {
  mockSelectionGetState,
  mockModelGetState,
  mockSvgGetState,
} = vi.hoisted(() => ({
  mockSelectionGetState: vi.fn(() => ({
    selectedReferenceIds: [],
    clearSelection: vi.fn(),
  })),
  mockModelGetState: vi.fn(() => ({
    sceneTree: [],
    removeLoadedFile: vi.fn(),
  })),
  mockSvgGetState: vi.fn(() => ({
    files: [],
    selectedFileId: null,
    removeFile: vi.fn(),
  })),
}))

vi.mock('@/stores/selection-store', () => ({
  useSelectionStore: { getState: mockSelectionGetState },
}))

vi.mock('@/stores/model-store', () => ({
  useModelStore: { getState: mockModelGetState },
}))

vi.mock('@/stores/svg-workspace-store', () => ({
  useSvgWorkspaceStore: { getState: mockSvgGetState },
}))

vi.mock('@/lib/scene-tree-utils', () => ({
  collectFileIdsFromSelection: vi.fn(() => []),
}))

import HotkeyManager from './HotkeyManager'

function resetStore() {
  useEngineStore.setState({
    postProcessingEnabled: true,
    studioMode: true,
  })
}

function renderComponent() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  React.act(() => {
    root.render(React.createElement(HotkeyManager))
  })

  return () => {
    React.act(() => { root.unmount() })
    document.body.removeChild(container)
  }
}

function dispatch(key: string, options?: { altKey?: boolean; shiftKey?: boolean }) {
  window.dispatchEvent(new KeyboardEvent('keydown', {
    key,
    altKey: options?.altKey ?? false,
    shiftKey: options?.shiftKey ?? false,
    bubbles: true,
    cancelable: true,
  }))
}

describe('HotkeyManager', () => {
  let cleanup: (() => void) | null = null

  beforeEach(() => {
    vi.clearAllMocks()
    resetStore()
    cleanup = renderComponent()
  })

  afterEach(() => {
    if (cleanup) { cleanup(); cleanup = null }
  })

  it('Alt+p toggles post-processing only, does not change studioMode', () => {
    dispatch('p', { altKey: true })
    const s = useEngineStore.getState()
    expect(s.postProcessingEnabled).toBe(false)
    expect(s.studioMode).toBe(true)
    expect(mockToastInfo).toHaveBeenCalledWith('后处理已关闭')
  })

  it('Alt+P toggles studioMode and post-processing', () => {
    dispatch('P', { altKey: true, shiftKey: true })
    const s = useEngineStore.getState()
    expect(s.studioMode).toBe(false)
    expect(s.postProcessingEnabled).toBe(false)
    expect(mockToastInfo).toHaveBeenCalledWith('CAD模式')
  })

  it('Alt+P toggles back and forth', () => {
    dispatch('P', { altKey: true, shiftKey: true })
    expect(useEngineStore.getState().studioMode).toBe(false)

    dispatch('P', { altKey: true, shiftKey: true })
    expect(useEngineStore.getState().studioMode).toBe(true)
    expect(useEngineStore.getState().postProcessingEnabled).toBe(true)
  })

  it('Alt+s calls tryToggleCrossSection', () => {
    dispatch('s', { altKey: true })
    expect(mockTryToggleCrossSection).toHaveBeenCalledTimes(1)
  })

  it('Alt+z calls tryToggleZebra', () => {
    dispatch('z', { altKey: true })
    expect(mockTryToggleZebra).toHaveBeenCalledTimes(1)
  })

  it('Alt+Z calls tryToggleSurfaceAnalysis', () => {
    dispatch('Z', { altKey: true, shiftKey: true })
    expect(mockTryToggleSurfaceAnalysis).toHaveBeenCalledTimes(1)
  })

  it('Alt+d calls tryToggleDraftAnalysis', () => {
    dispatch('d', { altKey: true })
    expect(mockTryToggleDraftAnalysis).toHaveBeenCalledTimes(1)
  })

  it('Alt+c calls tryToggleCurvatureComb', () => {
    dispatch('c', { altKey: true })
    expect(mockTryToggleCurvatureComb).toHaveBeenCalledTimes(1)
  })

  it('Alt+r dispatches startRotate event when not rotating', () => {
    let startRotateFired = false
    const handler = () => { startRotateFired = true }
    window.addEventListener('startRotate', handler)

    dispatch('r', { altKey: true })

    expect(startRotateFired).toBe(true)
    expect(mockToastInfo).toHaveBeenCalledWith('旋转已开始')
    window.removeEventListener('startRotate', handler)
  })

  it('Alt+r dispatches stopRotate event when rotating', () => {
    ;(window as any).__viewerRotating = () => true
    let stopRotateFired = false
    const handler = () => { stopRotateFired = true }
    window.addEventListener('stopRotate', handler)

    dispatch('r', { altKey: true })

    expect(stopRotateFired).toBe(true)
    expect(mockToastInfo).toHaveBeenCalledWith('旋转已停止')
    window.removeEventListener('stopRotate', handler)
    delete (window as any).__viewerRotating
  })
})
