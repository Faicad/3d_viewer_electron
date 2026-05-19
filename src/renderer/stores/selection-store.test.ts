import { describe, it, expect } from 'vitest'
import { useSelectionStore } from './selection-store'

function reset() {
  useSelectionStore.setState({ hoveredReferenceId: null, selectedReferenceIds: [] })
}

describe('selection-store', () => {
  it('initial state', () => {
    const state = useSelectionStore.getState()
    expect(state.hoveredReferenceId).toBeNull()
    expect(state.selectedReferenceIds).toEqual([])
  })

  describe('setHoveredReference', () => {
    it('sets hover id', () => {
      reset()
      useSelectionStore.getState().setHoveredReference('ref-1')
      expect(useSelectionStore.getState().hoveredReferenceId).toBe('ref-1')
    })

    it('clears hover id', () => {
      reset()
      useSelectionStore.getState().setHoveredReference('ref-1')
      useSelectionStore.getState().setHoveredReference(null)
      expect(useSelectionStore.getState().hoveredReferenceId).toBeNull()
    })

    it('does not affect selection', () => {
      reset()
      useSelectionStore.getState().setSelectedReference('s1')
      useSelectionStore.getState().setHoveredReference('h1')
      expect(useSelectionStore.getState().selectedReferenceIds).toEqual(['s1'])
      expect(useSelectionStore.getState().hoveredReferenceId).toBe('h1')
    })
  })

  describe('setSelectedReference — single select (no shiftKey)', () => {
    it('replaces existing selection', () => {
      reset()
      useSelectionStore.getState().setSelectedReference('a')
      expect(useSelectionStore.getState().selectedReferenceIds).toEqual(['a'])

      useSelectionStore.getState().setSelectedReference('b')
      expect(useSelectionStore.getState().selectedReferenceIds).toEqual(['b'])
    })

    it('clears on null', () => {
      reset()
      useSelectionStore.getState().setSelectedReference('a')
      useSelectionStore.getState().setSelectedReference(null)
      expect(useSelectionStore.getState().selectedReferenceIds).toEqual([])
    })
  })

  describe('setSelectedReference — multi-select (shiftKey)', () => {
    it('appends new id with shiftKey', () => {
      reset()
      useSelectionStore.getState().setSelectedReference('a', { shiftKey: true })
      expect(useSelectionStore.getState().selectedReferenceIds).toEqual(['a'])

      useSelectionStore.getState().setSelectedReference('b', { shiftKey: true })
      expect(useSelectionStore.getState().selectedReferenceIds).toEqual(['a', 'b'])
    })

    it('toggles off existing id with shiftKey', () => {
      reset()
      useSelectionStore.getState().setSelectedReference('a', { shiftKey: true })
      useSelectionStore.getState().setSelectedReference('b', { shiftKey: true })
      expect(useSelectionStore.getState().selectedReferenceIds).toEqual(['a', 'b'])

      useSelectionStore.getState().setSelectedReference('a', { shiftKey: true })
      expect(useSelectionStore.getState().selectedReferenceIds).toEqual(['b'])
    })

    it('toggles off last remaining item', () => {
      reset()
      useSelectionStore.getState().setSelectedReference('a', { shiftKey: true })
      useSelectionStore.getState().setSelectedReference('a', { shiftKey: true })
      expect(useSelectionStore.getState().selectedReferenceIds).toEqual([])
    })

    it('toggles same id multiple times', () => {
      reset()
      useSelectionStore.getState().setSelectedReference('x', { shiftKey: true })
      useSelectionStore.getState().setSelectedReference('x', { shiftKey: true })
      expect(useSelectionStore.getState().selectedReferenceIds).toEqual([])
      useSelectionStore.getState().setSelectedReference('x', { shiftKey: true })
      expect(useSelectionStore.getState().selectedReferenceIds).toEqual(['x'])
    })
  })

  describe('clearSelection', () => {
    it('clears both hover and selection', () => {
      reset()
      useSelectionStore.getState().setHoveredReference('h1')
      useSelectionStore.getState().setSelectedReference('s1', { shiftKey: true })
      useSelectionStore.getState().setSelectedReference('s2', { shiftKey: true })

      useSelectionStore.getState().clearSelection()
      expect(useSelectionStore.getState().hoveredReferenceId).toBeNull()
      expect(useSelectionStore.getState().selectedReferenceIds).toEqual([])
    })
  })
})
