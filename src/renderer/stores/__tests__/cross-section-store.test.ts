import { describe, it, expect, beforeEach } from 'vitest'
import { useCrossSectionStore } from '../cross-section-store'

function resetStore() {
  useCrossSectionStore.setState({
    planeX: { position: 100 },
    planeY: { position: 0 },
    planeZ: { position: 100 },
    showClipPlane: true,
    useObjectColor: false,
    panelOpen: false,
  })
}

describe('cross-section-store', () => {
  beforeEach(() => {
    resetStore()
  })

  describe('defaults', () => {
    it('has panel closed by default', () => {
      const s = useCrossSectionStore.getState()
      expect(s.panelOpen).toBe(false)
    })

    it('has correct default plane positions for camera at [5, -5, 3]', () => {
      const s = useCrossSectionStore.getState()
      // camera +X → 100% (bbox.max side = nothing clipped)
      expect(s.planeX.position).toBe(100)
      // camera -Y → 0% (bbox.min side = nothing clipped)
      expect(s.planeY.position).toBe(0)
      // camera +Z → 100% (bbox.max side = nothing clipped)
      expect(s.planeZ.position).toBe(100)
    })

    it('has showClipPlane enabled by default', () => {
      expect(useCrossSectionStore.getState().showClipPlane).toBe(true)
    })

    it('has useObjectColor disabled by default', () => {
      expect(useCrossSectionStore.getState().useObjectColor).toBe(false)
    })
  })

  describe('panelOpen toggling', () => {
    it('opens and closes the panel', () => {
      const store = useCrossSectionStore.getState()
      expect(store.panelOpen).toBe(false)

      store.setPanelOpen(true)
      expect(useCrossSectionStore.getState().panelOpen).toBe(true)

      store.setPanelOpen(false)
      expect(useCrossSectionStore.getState().panelOpen).toBe(false)
    })

    it('does not change plane positions when toggling panel', () => {
      const store = useCrossSectionStore.getState()
      const before = {
        x: store.planeX.position,
        y: store.planeY.position,
        z: store.planeZ.position,
      }

      store.setPanelOpen(true)
      store.setPanelOpen(false)

      const after = useCrossSectionStore.getState()
      expect(after.planeX.position).toBe(before.x)
      expect(after.planeY.position).toBe(before.y)
      expect(after.planeZ.position).toBe(before.z)
    })

    it('does not change showClipPlane when toggling panel', () => {
      const store = useCrossSectionStore.getState()
      expect(store.showClipPlane).toBe(true)

      store.setPanelOpen(true)
      expect(useCrossSectionStore.getState().showClipPlane).toBe(true)

      store.setPanelOpen(false)
      expect(useCrossSectionStore.getState().showClipPlane).toBe(true)
    })
  })

  describe('setPlanePosition', () => {
    it('updates individual plane positions', () => {
      const store = useCrossSectionStore.getState()

      store.setPlanePosition('x', 50)
      expect(useCrossSectionStore.getState().planeX.position).toBe(50)
      expect(useCrossSectionStore.getState().planeY.position).toBe(0)
      expect(useCrossSectionStore.getState().planeZ.position).toBe(100)

      store.setPlanePosition('y', 75)
      expect(useCrossSectionStore.getState().planeY.position).toBe(75)

      store.setPlanePosition('z', 25)
      expect(useCrossSectionStore.getState().planeZ.position).toBe(25)
    })

    it('clamps or passes through 0 and 100 values', () => {
      const store = useCrossSectionStore.getState()

      store.setPlanePosition('x', 0)
      expect(useCrossSectionStore.getState().planeX.position).toBe(0)

      store.setPlanePosition('x', 100)
      expect(useCrossSectionStore.getState().planeX.position).toBe(100)
    })
  })

  describe('setShowClipPlane', () => {
    it('toggles clip plane visibility', () => {
      const store = useCrossSectionStore.getState()

      store.setShowClipPlane(false)
      expect(useCrossSectionStore.getState().showClipPlane).toBe(false)

      store.setShowClipPlane(true)
      expect(useCrossSectionStore.getState().showClipPlane).toBe(true)
    })
  })

  describe('setUseObjectColor', () => {
    it('toggles object color mode', () => {
      const store = useCrossSectionStore.getState()

      store.setUseObjectColor(true)
      expect(useCrossSectionStore.getState().useObjectColor).toBe(true)

      store.setUseObjectColor(false)
      expect(useCrossSectionStore.getState().useObjectColor).toBe(false)
    })
  })
})
