import { create } from 'zustand'

export interface SelectionStore {
  hoveredReferenceId: string | null
  /** All selected reference IDs. Multi-select via Shift+click appends to this array. */
  selectedReferenceIds: string[]

  setHoveredReference: (id: string | null) => void
  /**
   * Set or toggle a selected reference.
   * - Without shiftKey: replaces the selection with [id].
   * - With shiftKey: toggles id in/out of the array.
   * - Pass null to clear.
   */
  setSelectedReference: (id: string | null, opts?: { shiftKey?: boolean }) => void
  clearSelection: () => void
}

export const useSelectionStore = create<SelectionStore>()((set, get) => ({
  hoveredReferenceId: null,
  selectedReferenceIds: [],

  setHoveredReference: (id) => set({ hoveredReferenceId: id }),

  setSelectedReference: (id, opts) => {
    if (!id) {
      set({ selectedReferenceIds: [] })
      return
    }
    const shiftKey = opts?.shiftKey ?? false
    if (shiftKey) {
      const current = get().selectedReferenceIds
      const idx = current.indexOf(id)
      if (idx >= 0) {
        // Toggle off: remove from array
        set({ selectedReferenceIds: current.filter((_, i) => i !== idx) })
      } else {
        // Toggle on: append to array
        set({ selectedReferenceIds: [...current, id] })
      }
    } else {
      // Replace selection
      set({ selectedReferenceIds: [id] })
    }
  },

  clearSelection: () => set({ hoveredReferenceId: null, selectedReferenceIds: [] }),
}))
