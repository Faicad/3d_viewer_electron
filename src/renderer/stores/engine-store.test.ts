import { describe, it, expect, beforeEach } from 'vitest'
import { useEngineStore } from './engine-store'

const DEFAULT_STATE = {
  postProcessingEnabled: true,
  studioMode: true,
}

describe('useEngineStore — studioMode', () => {
  beforeEach(() => {
    useEngineStore.setState(DEFAULT_STATE)
  })

  it('starts with studioMode = true (Studio mode)', () => {
    expect(useEngineStore.getState().studioMode).toBe(true)
  })

  it('starts with postProcessingEnabled = true', () => {
    expect(useEngineStore.getState().postProcessingEnabled).toBe(true)
  })

  it('setStudioMode(false) switches to CAD mode and disables post-processing', () => {
    useEngineStore.getState().setStudioMode(false)
    const s = useEngineStore.getState()
    expect(s.studioMode).toBe(false)
    expect(s.postProcessingEnabled).toBe(false)
  })

  it('setStudioMode(true) switches to Studio mode and enables post-processing', () => {
    useEngineStore.getState().setStudioMode(false)
    expect(useEngineStore.getState().studioMode).toBe(false)

    useEngineStore.getState().setStudioMode(true)
    const s = useEngineStore.getState()
    expect(s.studioMode).toBe(true)
    expect(s.postProcessingEnabled).toBe(true)
  })

  it('setStudioMode is idempotent — calling with same value does not toggle', () => {
    useEngineStore.getState().setStudioMode(true)
    expect(useEngineStore.getState().studioMode).toBe(true)
    expect(useEngineStore.getState().postProcessingEnabled).toBe(true)
  })

  it('setPostProcessingEnabled does not change studioMode', () => {
    useEngineStore.getState().setPostProcessingEnabled(false)
    const s = useEngineStore.getState()
    expect(s.postProcessingEnabled).toBe(false)
    expect(s.studioMode).toBe(true)
  })
})
