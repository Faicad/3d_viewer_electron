import { describe, it, expect, beforeEach } from 'vitest'
import { useCurvatureCombStore, tryToggleCurvatureComb } from './curvature-comb-store'

describe('useCurvatureCombStore — defaults and actions', () => {
  beforeEach(() => {
    useCurvatureCombStore.setState({
      enabled: false,
      scale: 1,
      color: [0, 0.7, 0],
      width: 1.5,
      autoScale: true,
    })
  })

  it('starts with enabled = false', () => {
    expect(useCurvatureCombStore.getState().enabled).toBe(false)
  })

  it('starts with default scale = 1', () => {
    expect(useCurvatureCombStore.getState().scale).toBe(1)
  })

  it('starts with default width = 1.5', () => {
    expect(useCurvatureCombStore.getState().width).toBe(1.5)
  })

  it('starts with default autoScale = true', () => {
    expect(useCurvatureCombStore.getState().autoScale).toBe(true)
  })

  it('starts with default color green', () => {
    const c = useCurvatureCombStore.getState().color
    expect(c[0]).toBe(0)
    expect(c[1]).toBe(0.7)
    expect(c[2]).toBe(0)
  })

  it('setEnabled toggles enabled', () => {
    useCurvatureCombStore.getState().setEnabled(true)
    expect(useCurvatureCombStore.getState().enabled).toBe(true)

    useCurvatureCombStore.getState().setEnabled(false)
    expect(useCurvatureCombStore.getState().enabled).toBe(false)
  })

  it('setScale clamps to [0.01, 100]', () => {
    useCurvatureCombStore.getState().setScale(0)
    expect(useCurvatureCombStore.getState().scale).toBe(0.01)

    useCurvatureCombStore.getState().setScale(200)
    expect(useCurvatureCombStore.getState().scale).toBe(100)
  })

  it('setWidth clamps to [0.5, 5]', () => {
    useCurvatureCombStore.getState().setWidth(0)
    expect(useCurvatureCombStore.getState().width).toBe(0.5)

    useCurvatureCombStore.getState().setWidth(10)
    expect(useCurvatureCombStore.getState().width).toBe(5)
  })

  it('setColor updates color', () => {
    useCurvatureCombStore.getState().setColor([1, 0, 0])
    expect(useCurvatureCombStore.getState().color).toEqual([1, 0, 0])
  })

  it('setAutoScale toggles autoScale', () => {
    useCurvatureCombStore.getState().setAutoScale(false)
    expect(useCurvatureCombStore.getState().autoScale).toBe(false)

    useCurvatureCombStore.getState().setAutoScale(true)
    expect(useCurvatureCombStore.getState().autoScale).toBe(true)
  })

  it('resetToDefaults restores all default values', () => {
    useCurvatureCombStore.getState().setScale(5)
    useCurvatureCombStore.getState().setColor([1, 0, 0])
    useCurvatureCombStore.getState().setAutoScale(false)
    useCurvatureCombStore.getState().setWidth(3)

    useCurvatureCombStore.getState().resetToDefaults()

    const s = useCurvatureCombStore.getState()
    expect(s.scale).toBe(1)
    expect(s.color).toEqual([0, 0.7, 0])
    expect(s.autoScale).toBe(true)
    expect(s.width).toBe(1.5)
  })
})

describe('tryToggleCurvatureComb', () => {
  beforeEach(() => {
    useCurvatureCombStore.setState({ enabled: false })
  })

  it('toggles enabled on', () => {
    const result = tryToggleCurvatureComb()
    expect(result).toBe(true)
    expect(useCurvatureCombStore.getState().enabled).toBe(true)
  })

  it('toggles enabled off', () => {
    useCurvatureCombStore.setState({ enabled: true })
    const result = tryToggleCurvatureComb()
    expect(result).toBe(true)
    expect(useCurvatureCombStore.getState().enabled).toBe(false)
  })
})
