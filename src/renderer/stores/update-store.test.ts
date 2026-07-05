import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useUpdateStore, bindUpdateEvents } from './update-store'

const mockCheckForUpdates = vi.fn()
const mockQuitAndInstall = vi.fn()
const mockOnUpdateEvent = vi.fn(() => () => {})

beforeEach(() => {
  vi.stubGlobal('window', {
    electronAPI: {
      checkForUpdates: mockCheckForUpdates,
      quitAndInstall: mockQuitAndInstall,
      onUpdateEvent: mockOnUpdateEvent,
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  useUpdateStore.setState({
    status: 'idle',
    version: null,
    releaseNotes: null,
    downloadProgress: 0,
    bytesPerSecond: 0,
    errorMessage: null,
  })
})

describe('useUpdateStore', () => {
  it('initial state is idle', () => {
    const state = useUpdateStore.getState()
    expect(state.status).toBe('idle')
    expect(state.version).toBeNull()
    expect(state.releaseNotes).toBeNull()
    expect(state.downloadProgress).toBe(0)
    expect(state.bytesPerSecond).toBe(0)
    expect(state.errorMessage).toBeNull()
  })

  it('checkForUpdates sets status to checking', () => {
    useUpdateStore.getState().checkForUpdates(true)
    const state = useUpdateStore.getState()
    expect(state.status).toBe('checking')
    expect(mockCheckForUpdates).toHaveBeenCalledWith(true)
  })

  it('reset restores initial state', () => {
    useUpdateStore.setState({ status: 'available', version: '2.0.0' })
    useUpdateStore.getState().reset()
    const state = useUpdateStore.getState()
    expect(state.status).toBe('idle')
    expect(state.version).toBeNull()
  })
})

describe('bindUpdateEvents', () => {
  it('handles update:checking', () => {
    const unsub = bindUpdateEvents()
    const callback = mockOnUpdateEvent.mock.calls[0][0]
    callback('update:checking', {})
    expect(useUpdateStore.getState().status).toBe('checking')
    unsub()
  })

  it('handles update:available', () => {
    const unsub = bindUpdateEvents()
    const callback = mockOnUpdateEvent.mock.calls[0][0]
    callback('update:available', { version: '2.0.0', releaseNotes: 'Bug fixes' })
    const state = useUpdateStore.getState()
    expect(state.status).toBe('available')
    expect(state.version).toBe('2.0.0')
    expect(state.releaseNotes).toBe('Bug fixes')
    unsub()
  })

  it('handles update:not-available', () => {
    const unsub = bindUpdateEvents()
    const callback = mockOnUpdateEvent.mock.calls[0][0]
    callback('update:not-available', { version: '1.8.0' })
    const state = useUpdateStore.getState()
    expect(state.status).toBe('not-available')
    expect(state.version).toBe('1.8.0')
    unsub()
  })

  it('handles update:download-progress', () => {
    const unsub = bindUpdateEvents()
    const callback = mockOnUpdateEvent.mock.calls[0][0]
    callback('update:download-progress', { bytesPerSecond: 500000, percent: 42 })
    const state = useUpdateStore.getState()
    expect(state.status).toBe('downloading')
    expect(state.downloadProgress).toBe(42)
    expect(state.bytesPerSecond).toBe(500000)
    unsub()
  })

  it('handles update:downloaded', () => {
    const unsub = bindUpdateEvents()
    const callback = mockOnUpdateEvent.mock.calls[0][0]
    callback('update:downloaded', { version: '2.0.0' })
    const state = useUpdateStore.getState()
    expect(state.status).toBe('downloaded')
    expect(state.version).toBe('2.0.0')
    unsub()
  })

  it('handles update:error', () => {
    const unsub = bindUpdateEvents()
    const callback = mockOnUpdateEvent.mock.calls[0][0]
    callback('update:error', { message: 'Network error' })
    const state = useUpdateStore.getState()
    expect(state.status).toBe('error')
    expect(state.errorMessage).toBe('Network error')
    unsub()
  })

  it('returns unsubscribe function', () => {
    const unsub = bindUpdateEvents()
    expect(typeof unsub).toBe('function')
    unsub()
  })
})
