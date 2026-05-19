import { describe, it, expect } from 'vitest'
import { useSelectionStore } from './selection-store'

describe('selection-store', () => {
  it('initial state', () => {
    const state = useSelectionStore.getState()
    expect(state.hoveredReferenceId).toBeNull()
    expect(state.selectedReferenceId).toBeNull()
  })

  it('setHoveredReference', () => {
    useSelectionStore.getState().setHoveredReference('ref-1')
    expect(useSelectionStore.getState().hoveredReferenceId).toBe('ref-1')
    expect(useSelectionStore.getState().selectedReferenceId).toBeNull()

    useSelectionStore.getState().setHoveredReference(null)
    expect(useSelectionStore.getState().hoveredReferenceId).toBeNull()
  })

  it('setSelectedReference', () => {
    useSelectionStore.getState().setSelectedReference('ref-2')
    expect(useSelectionStore.getState().selectedReferenceId).toBe('ref-2')

    useSelectionStore.getState().setSelectedReference(null)
    expect(useSelectionStore.getState().selectedReferenceId).toBeNull()
  })

  it('clearSelection clears both', () => {
    useSelectionStore.getState().setHoveredReference('h')
    useSelectionStore.getState().setSelectedReference('s')
    expect(useSelectionStore.getState().hoveredReferenceId).toBe('h')
    expect(useSelectionStore.getState().selectedReferenceId).toBe('s')

    useSelectionStore.getState().clearSelection()
    expect(useSelectionStore.getState().hoveredReferenceId).toBeNull()
    expect(useSelectionStore.getState().selectedReferenceId).toBeNull()
  })

  it('hover and select are independent', () => {
    useSelectionStore.setState({ hoveredReferenceId: 'a', selectedReferenceId: 'b' })
    useSelectionStore.getState().setHoveredReference('new-hover')
    expect(useSelectionStore.getState().hoveredReferenceId).toBe('new-hover')
    expect(useSelectionStore.getState().selectedReferenceId).toBe('b')
  })
})
