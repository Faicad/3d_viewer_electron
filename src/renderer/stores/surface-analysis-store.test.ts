import { describe, it, expect, beforeEach } from 'vitest'
import { useSurfaceAnalysisStore, tryToggleSurfaceAnalysis } from './surface-analysis-store'
import { useEngineStore } from './engine-store'
import { useModelStore } from './model-store'
import { useZebraStore } from './zebra-store'
import { useDraftAnalysisStore } from './draft-analysis-store'
import { useCrossSectionStore } from './cross-section-store'

describe('useSurfaceAnalysisStore — defaults and actions', () => {
  beforeEach(() => {
    useSurfaceAnalysisStore.setState({
      enabled: false,
      mode: 'zebra',
      analysisDirection: [1, 0, 0],
      fixedDirection: false,
      stripesNumber: 12,
      stripesRatio: 0.5,
      color1: [1, 1, 1],
      color2: [0, 0, 0],
      shading: 0.2,
      rainbowAngle1: 0,
      rainbowAngle2: 180,
      isoAngles: [45, 90, 135],
      isoTolerance: 0.5,
    })
  })

  it('starts with enabled = false', () => {
    expect(useSurfaceAnalysisStore.getState().enabled).toBe(false)
  })

  it('starts with default mode = zebra', () => {
    expect(useSurfaceAnalysisStore.getState().mode).toBe('zebra')
  })

  it('starts with default analysis direction (1,0,0)', () => {
    expect(useSurfaceAnalysisStore.getState().analysisDirection).toEqual([1, 0, 0])
  })

  it('starts with default stripes parameters', () => {
    const s = useSurfaceAnalysisStore.getState()
    expect(s.stripesNumber).toBe(12)
    expect(s.stripesRatio).toBe(0.5)
  })

  it('starts with default colors', () => {
    const s = useSurfaceAnalysisStore.getState()
    expect(s.color1).toEqual([1, 1, 1])
    expect(s.color2).toEqual([0, 0, 0])
  })

  it('starts with default iso angles', () => {
    const s = useSurfaceAnalysisStore.getState()
    expect(s.isoAngles).toEqual([45, 90, 135])
    expect(s.isoTolerance).toBe(0.5)
  })

  it('starts with default shading', () => {
    expect(useSurfaceAnalysisStore.getState().shading).toBe(0.2)
  })

  it('setEnabled toggles enabled', () => {
    useSurfaceAnalysisStore.getState().setEnabled(true)
    expect(useSurfaceAnalysisStore.getState().enabled).toBe(true)

    useSurfaceAnalysisStore.getState().setEnabled(false)
    expect(useSurfaceAnalysisStore.getState().enabled).toBe(false)
  })

  it('setMode updates mode', () => {
    useSurfaceAnalysisStore.getState().setMode('rainbow')
    expect(useSurfaceAnalysisStore.getState().mode).toBe('rainbow')

    useSurfaceAnalysisStore.getState().setMode('isophote')
    expect(useSurfaceAnalysisStore.getState().mode).toBe('isophote')

    useSurfaceAnalysisStore.getState().setMode('zebra')
    expect(useSurfaceAnalysisStore.getState().mode).toBe('zebra')
  })

  it('setAnalysisDirection updates direction', () => {
    useSurfaceAnalysisStore.getState().setAnalysisDirection([0, 1, 0])
    expect(useSurfaceAnalysisStore.getState().analysisDirection).toEqual([0, 1, 0])
  })

  it('setAnalysisDirection does not update if same array values', () => {
    const prev = useSurfaceAnalysisStore.getState().analysisDirection
    useSurfaceAnalysisStore.getState().setAnalysisDirection([1, 0, 0])
    expect(useSurfaceAnalysisStore.getState().analysisDirection).toBe(prev)
  })

  it('clamps stripesNumber to [1, 50]', () => {
    useSurfaceAnalysisStore.getState().setStripesNumber(0)
    expect(useSurfaceAnalysisStore.getState().stripesNumber).toBe(1)

    useSurfaceAnalysisStore.getState().setStripesNumber(100)
    expect(useSurfaceAnalysisStore.getState().stripesNumber).toBe(50)
  })

  it('clamps stripesRatio to [0, 1]', () => {
    useSurfaceAnalysisStore.getState().setStripesRatio(-0.5)
    expect(useSurfaceAnalysisStore.getState().stripesRatio).toBe(0)

    useSurfaceAnalysisStore.getState().setStripesRatio(2)
    expect(useSurfaceAnalysisStore.getState().stripesRatio).toBe(1)
  })

  it('clamps shading to [0, 1]', () => {
    useSurfaceAnalysisStore.getState().setShading(-1)
    expect(useSurfaceAnalysisStore.getState().shading).toBe(0)

    useSurfaceAnalysisStore.getState().setShading(2)
    expect(useSurfaceAnalysisStore.getState().shading).toBe(1)
  })

  it('clamps rainbowAngle1 to [0, 180]', () => {
    useSurfaceAnalysisStore.getState().setRainbowAngle1(-10)
    expect(useSurfaceAnalysisStore.getState().rainbowAngle1).toBe(0)

    useSurfaceAnalysisStore.getState().setRainbowAngle1(200)
    expect(useSurfaceAnalysisStore.getState().rainbowAngle1).toBe(180)
  })

  it('clamps rainbowAngle2 to [0, 180]', () => {
    useSurfaceAnalysisStore.getState().setRainbowAngle2(-1)
    expect(useSurfaceAnalysisStore.getState().rainbowAngle2).toBe(0)

    useSurfaceAnalysisStore.getState().setRainbowAngle2(190)
    expect(useSurfaceAnalysisStore.getState().rainbowAngle2).toBe(180)
  })

  it('clamps isoTolerance to [0, 10]', () => {
    useSurfaceAnalysisStore.getState().setIsoTolerance(-1)
    expect(useSurfaceAnalysisStore.getState().isoTolerance).toBe(0)

    useSurfaceAnalysisStore.getState().setIsoTolerance(20)
    expect(useSurfaceAnalysisStore.getState().isoTolerance).toBe(10)
  })

  it('setColor1 updates color1', () => {
    useSurfaceAnalysisStore.getState().setColor1([0.5, 0.5, 0.5])
    expect(useSurfaceAnalysisStore.getState().color1).toEqual([0.5, 0.5, 0.5])
  })

  it('setColor2 updates color2', () => {
    useSurfaceAnalysisStore.getState().setColor2([1, 0, 0])
    expect(useSurfaceAnalysisStore.getState().color2).toEqual([1, 0, 0])
  })

  it('setIsoAngles updates isoAngles', () => {
    useSurfaceAnalysisStore.getState().setIsoAngles([10, 20, 30])
    expect(useSurfaceAnalysisStore.getState().isoAngles).toEqual([10, 20, 30])
  })

  it('setFixedDirection toggles fixedDirection', () => {
    useSurfaceAnalysisStore.getState().setFixedDirection(true)
    expect(useSurfaceAnalysisStore.getState().fixedDirection).toBe(true)

    useSurfaceAnalysisStore.getState().setFixedDirection(false)
    expect(useSurfaceAnalysisStore.getState().fixedDirection).toBe(false)
  })

  it('resetToDefaults restores all default values', () => {
    useSurfaceAnalysisStore.getState().setMode('rainbow')
    useSurfaceAnalysisStore.getState().setStripesNumber(5)
    useSurfaceAnalysisStore.getState().setColor1([0, 0, 0])

    useSurfaceAnalysisStore.getState().resetToDefaults()

    const s = useSurfaceAnalysisStore.getState()
    expect(s.mode).toBe('zebra')
    expect(s.stripesNumber).toBe(12)
    expect(s.color1).toEqual([1, 1, 1])
    expect(s.analysisDirection).toEqual([1, 0, 0])
  })
})

describe('tryToggleSurfaceAnalysis — gating', () => {
  beforeEach(() => {
    useEngineStore.setState({ studioMode: false })
    useModelStore.setState({ loadedFiles: [{ id: 'f1' } as any] })
    useSurfaceAnalysisStore.setState({ enabled: false })
    useZebraStore.setState({ enabled: false })
    useDraftAnalysisStore.setState({ enabled: false })
    useCrossSectionStore.setState({ panelOpen: false })
  })

  it('blocks when studioMode = true', () => {
    useEngineStore.setState({ studioMode: true })
    const result = tryToggleSurfaceAnalysis()
    expect(result).toBe(false)
    expect(useSurfaceAnalysisStore.getState().enabled).toBe(false)
  })

  it('blocks when loadedFiles.length !== 1', () => {
    useModelStore.setState({ loadedFiles: [] })
    const result = tryToggleSurfaceAnalysis()
    expect(result).toBe(false)
    expect(useSurfaceAnalysisStore.getState().enabled).toBe(false)
  })

  it('toggles enabled on when conditions are met', () => {
    const result = tryToggleSurfaceAnalysis()
    expect(result).toBe(true)
    expect(useSurfaceAnalysisStore.getState().enabled).toBe(true)
  })

  it('toggles enabled off when already on', () => {
    useSurfaceAnalysisStore.setState({ enabled: true })
    const result = tryToggleSurfaceAnalysis()
    expect(result).toBe(true)
    expect(useSurfaceAnalysisStore.getState().enabled).toBe(false)
  })

  it('closes zebra when opening surface analysis', () => {
    useZebraStore.setState({ enabled: true })
    tryToggleSurfaceAnalysis()
    expect(useZebraStore.getState().enabled).toBe(false)
  })

  it('closes draft analysis when opening surface analysis', () => {
    useDraftAnalysisStore.setState({ enabled: true })
    tryToggleSurfaceAnalysis()
    expect(useDraftAnalysisStore.getState().enabled).toBe(false)
  })

  it('closes cross-section when opening surface analysis', () => {
    useCrossSectionStore.setState({ panelOpen: true })
    tryToggleSurfaceAnalysis()
    expect(useCrossSectionStore.getState().panelOpen).toBe(false)
  })
})
