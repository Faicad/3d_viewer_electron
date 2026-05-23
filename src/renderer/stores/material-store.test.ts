import { describe, it, expect } from 'vitest'
import { useMaterialStore, makeOverrideKey, parseOverrideKey } from './material-store'
import type { MaterialAppearance } from '@/engine/material/types'

function reset() {
  useMaterialStore.setState({
    materialOverrides: {},
    editingOverrideKeys: [],
    overrideMaterial: true,
    overridePresetRefs: {},
    materialClipboard: null,
    materialEditorVisible: false,
    materialEditorPosition: { x: 100, y: 100 },
  })
}

const testAppearance: MaterialAppearance = {
  name: 'Test',
  color: [0.8, 0.2, 0.2, 1.0],
  roughness: 0.3,
  metalness: 0.7,
}

describe('makeOverrideKey / parseOverrideKey', () => {
  it('builds and parses keys', () => {
    const key = makeOverrideKey('file-1', 'part-A')
    expect(key).toBe('file-1:part-A')
    const parsed = parseOverrideKey(key)
    expect(parsed.fileId).toBe('file-1')
    expect(parsed.partId).toBe('part-A')
  })

  it('handles partId with colons', () => {
    const key = makeOverrideKey('file-1', 'ns:part')
    expect(key).toBe('file-1:ns:part')
    const parsed = parseOverrideKey(key)
    expect(parsed.fileId).toBe('file-1')
    expect(parsed.partId).toBe('ns:part')
  })
})

describe('material-store', () => {
  it('initial state', () => {
    reset()
    const s = useMaterialStore.getState()
    expect(s.materialOverrides).toEqual({})
    expect(s.overrideMaterial).toBe(true)
    expect(s.materialClipboard).toBeNull()
    expect(s.materialEditorVisible).toBe(false)
  })

  describe('setMaterialOverride', () => {
    it('stores an override', () => {
      reset()
      useMaterialStore.getState().setMaterialOverride('f1', 'p1', testAppearance)
      const overrides = useMaterialStore.getState().materialOverrides
      expect(overrides['f1:p1']).toEqual(testAppearance)
    })

    it('updates existing override', () => {
      reset()
      useMaterialStore.getState().setMaterialOverride('f1', 'p1', testAppearance)
      const updated = { ...testAppearance, roughness: 0.9 }
      useMaterialStore.getState().setMaterialOverride('f1', 'p1', updated)
      expect(useMaterialStore.getState().materialOverrides['f1:p1'].roughness).toBe(0.9)
    })
  })

  describe('setMaterialOverrideBatch', () => {
    it('applies to multiple keys', () => {
      reset()
      useMaterialStore.getState().setMaterialOverrideBatch(['f1:a', 'f1:b'], testAppearance)
      const overrides = useMaterialStore.getState().materialOverrides
      expect(overrides['f1:a']).toEqual(testAppearance)
      expect(overrides['f1:b']).toEqual(testAppearance)
    })
  })

  describe('removeMaterialOverride', () => {
    it('removes a single override', () => {
      reset()
      useMaterialStore.getState().setMaterialOverride('f1', 'p1', testAppearance)
      useMaterialStore.getState().setMaterialOverride('f1', 'p2', testAppearance)
      useMaterialStore.getState().removeMaterialOverride('f1', 'p1')
      const overrides = useMaterialStore.getState().materialOverrides
      expect(overrides['f1:p1']).toBeUndefined()
      expect(overrides['f1:p2']).toBeDefined()
    })
  })

  describe('clearAllOverrides', () => {
    it('clears all', () => {
      reset()
      useMaterialStore.getState().setMaterialOverride('f1', 'p1', testAppearance)
      useMaterialStore.getState().clearAllOverrides()
      expect(useMaterialStore.getState().materialOverrides).toEqual({})
      expect(useMaterialStore.getState().overridePresetRefs).toEqual({})
    })
  })

  describe('overrideMaterial toggle', () => {
    it('defaults to true', () => {
      reset()
      expect(useMaterialStore.getState().overrideMaterial).toBe(true)
    })

    it('toggles', () => {
      reset()
      useMaterialStore.getState().setOverrideMaterial(false)
      expect(useMaterialStore.getState().overrideMaterial).toBe(false)
    })
  })

  describe('clipboard', () => {
    it('copies and pastes', () => {
      reset()
      useMaterialStore.getState().copyMaterialToClipboard(testAppearance)
      expect(useMaterialStore.getState().materialClipboard).toEqual(testAppearance)

      useMaterialStore.getState().pasteMaterialFromClipboard('f1', 'p1')
      expect(useMaterialStore.getState().materialOverrides['f1:p1']).toEqual(testAppearance)
    })

    it('paste with empty clipboard is no-op', () => {
      reset()
      useMaterialStore.getState().pasteMaterialFromClipboard('f1', 'p1')
      expect(useMaterialStore.getState().materialOverrides['f1:p1']).toBeUndefined()
    })

    it('clears clipboard', () => {
      reset()
      useMaterialStore.getState().copyMaterialToClipboard(testAppearance)
      useMaterialStore.getState().clearClipboard()
      expect(useMaterialStore.getState().materialClipboard).toBeNull()
    })
  })

  describe('editor state', () => {
    it('opens and closes', () => {
      reset()
      useMaterialStore.getState().openMaterialEditor(['f1:p1'])
      expect(useMaterialStore.getState().materialEditorVisible).toBe(true)
      expect(useMaterialStore.getState().editingOverrideKeys).toEqual(['f1:p1'])

      useMaterialStore.getState().closeMaterialEditor()
      expect(useMaterialStore.getState().materialEditorVisible).toBe(false)
    })

    it('updates position', () => {
      reset()
      useMaterialStore.getState().setMaterialEditorPosition({ x: 200, y: 300 })
      expect(useMaterialStore.getState().materialEditorPosition).toEqual({ x: 200, y: 300 })
    })
  })

  describe('getEffectiveAppearance', () => {
    it('returns override if set', () => {
      reset()
      useMaterialStore.getState().setMaterialOverride('f1', 'p1', testAppearance)
      const app = useMaterialStore.getState().getEffectiveAppearance('f1', 'p1')
      expect(app).toEqual(testAppearance)
    })

    it('returns null if no override', () => {
      reset()
      const app = useMaterialStore.getState().getEffectiveAppearance('f1', 'nonexistent')
      expect(app).toBeNull()
    })
  })
})
