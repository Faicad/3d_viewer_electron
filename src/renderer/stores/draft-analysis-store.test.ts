import { describe, it, expect, beforeEach } from 'vitest'
import { useDraftAnalysisStore, tryToggleDraftAnalysis } from './draft-analysis-store'
import { useEngineStore } from './engine-store'
import { useModelStore } from './model-store'
import { useZebraStore } from './zebra-store'
import { useCrossSectionStore } from './cross-section-store'

describe('useDraftAnalysisStore — defaults and actions', () => {
  beforeEach(() => {
    useDraftAnalysisStore.setState({
      enabled: false,
      pullDirection: [0, 0, 1],
      draftAnglePos: 1.0,
      draftAngleNeg: 1.0,
      draftTolPos: 0.05,
      draftTolNeg: 0.05,
      shading: 0.2,
    })
  })

  it('starts with enabled = false', () => {
    expect(useDraftAnalysisStore.getState().enabled).toBe(false)
  })

  it('starts with default pull direction (0,0,1)', () => {
    expect(useDraftAnalysisStore.getState().pullDirection).toEqual([0, 0, 1])
  })

  it('starts with default draft angles', () => {
    const s = useDraftAnalysisStore.getState()
    expect(s.draftAnglePos).toBe(1.0)
    expect(s.draftAngleNeg).toBe(1.0)
    expect(s.draftTolPos).toBe(0.05)
    expect(s.draftTolNeg).toBe(0.05)
    expect(s.shading).toBe(0.2)
  })

  it('setEnabled toggles enabled', () => {
    useDraftAnalysisStore.getState().setEnabled(true)
    expect(useDraftAnalysisStore.getState().enabled).toBe(true)

    useDraftAnalysisStore.getState().setEnabled(false)
    expect(useDraftAnalysisStore.getState().enabled).toBe(false)
  })

  it('setPullDirection updates direction', () => {
    useDraftAnalysisStore.getState().setPullDirection([1, 0, 0])
    expect(useDraftAnalysisStore.getState().pullDirection).toEqual([1, 0, 0])
  })

  it('clamps draftAnglePos to [0, 90]', () => {
    useDraftAnalysisStore.getState().setDraftAnglePos(-5)
    expect(useDraftAnalysisStore.getState().draftAnglePos).toBe(0)

    useDraftAnalysisStore.getState().setDraftAnglePos(100)
    expect(useDraftAnalysisStore.getState().draftAnglePos).toBe(90)
  })

  it('clamps draftAngleNeg to [0, 90]', () => {
    useDraftAnalysisStore.getState().setDraftAngleNeg(-1)
    expect(useDraftAnalysisStore.getState().draftAngleNeg).toBe(0)

    useDraftAnalysisStore.getState().setDraftAngleNeg(95)
    expect(useDraftAnalysisStore.getState().draftAngleNeg).toBe(90)
  })

  it('setColor updates specific color zone', () => {
    useDraftAnalysisStore.getState().setColor('inDraftPos', [1, 0, 0])
    expect(useDraftAnalysisStore.getState().colors.inDraftPos).toEqual([1, 0, 0])
    expect(useDraftAnalysisStore.getState().colors.inDraftNeg).toEqual([0, 1, 0])
  })

  it('resetToDefaults restores all default values', () => {
    useDraftAnalysisStore.getState().setPullDirection([1, 0, 0])
    useDraftAnalysisStore.getState().setDraftAnglePos(45)
    useDraftAnalysisStore.getState().setColor('inDraftPos', [1, 0, 0])

    useDraftAnalysisStore.getState().resetToDefaults()

    const s = useDraftAnalysisStore.getState()
    expect(s.pullDirection).toEqual([0, 0, 1])
    expect(s.draftAnglePos).toBe(1.0)
    expect(s.colors.inDraftPos).toEqual([0, 0, 1])
  })
})

describe('tryToggleDraftAnalysis — gating', () => {
  beforeEach(() => {
    useEngineStore.setState({ studioMode: false })
    useModelStore.setState({ loadedFiles: [{ id: 'f1' } as any] })
    useDraftAnalysisStore.setState({ enabled: false })
    useZebraStore.setState({ enabled: false })
    useCrossSectionStore.setState({ panelOpen: false })
  })

  it('blocks when studioMode = true', () => {
    useEngineStore.setState({ studioMode: true })
    const result = tryToggleDraftAnalysis()
    expect(result).toBe(false)
    expect(useDraftAnalysisStore.getState().enabled).toBe(false)
  })

  it('blocks when loadedFiles.length !== 1', () => {
    useModelStore.setState({ loadedFiles: [] })
    const result = tryToggleDraftAnalysis()
    expect(result).toBe(false)
    expect(useDraftAnalysisStore.getState().enabled).toBe(false)
  })

  it('toggles enabled on when conditions are met', () => {
    const result = tryToggleDraftAnalysis()
    expect(result).toBe(true)
    expect(useDraftAnalysisStore.getState().enabled).toBe(true)
  })

  it('toggles enabled off when already on', () => {
    useDraftAnalysisStore.setState({ enabled: true })
    const result = tryToggleDraftAnalysis()
    expect(result).toBe(true)
    expect(useDraftAnalysisStore.getState().enabled).toBe(false)
  })

  it('closes zebra when opening draft analysis', () => {
    useZebraStore.setState({ enabled: true })
    tryToggleDraftAnalysis()
    expect(useZebraStore.getState().enabled).toBe(false)
  })

  it('closes cross-section when opening draft analysis', () => {
    useCrossSectionStore.setState({ panelOpen: true })
    tryToggleDraftAnalysis()
    expect(useCrossSectionStore.getState().panelOpen).toBe(false)
  })
})
