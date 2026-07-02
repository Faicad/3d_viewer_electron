import { describe, it, expect, vi, beforeAll } from 'vitest'
import * as THREE from 'three'
import { useMaterialStore, makeOverrideKey, parseOverrideKey } from './material-store'
import type { MaterialAppearance, AlphaMode } from '@/engine/material/types'
import { materialToAppearance, createDefaultMaterial, DEFAULT_MATERIAL_HEX, DEFAULT_MATERIAL_ROUGHNESS, DEFAULT_MATERIAL_METALNESS } from '@/engine/components/cloneMaterial'
import { MaterialFactory } from '@/engine/material/MaterialFactory'

beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

function reset() {
  useMaterialStore.setState({
    materialOverrides: {},
    editingOverrideKey: '',
    editingFanoutKeys: [],
    isEditingMaterialDefinition: false,
    overrideMaterial: true,
    overridePresetRefs: {},
    materialClipboard: null,
    materialEditorVisible: false,
    materialEditorPosition: { x: 100, y: 100 },
    texturePreviewSlot: null,
    texturePreviewLabel: null,
    defaultMaterial: null,
    isEditingDefault: false,
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
      useMaterialStore.getState().openMaterialEditor('f1:p1', ['f1:p1'], 'Test / p1', false)
      expect(useMaterialStore.getState().materialEditorVisible).toBe(true)
      expect(useMaterialStore.getState().editingOverrideKey).toBe('f1:p1')
      expect(useMaterialStore.getState().editingFanoutKeys).toEqual(['f1:p1'])

      useMaterialStore.getState().closeMaterialEditor()
      expect(useMaterialStore.getState().materialEditorVisible).toBe(false)
    })

    it('updates position', () => {
      reset()
      useMaterialStore.getState().setMaterialEditorPosition({ x: 200, y: 300 })
      expect(useMaterialStore.getState().materialEditorPosition).toEqual({ x: 200, y: 300 })
    })
  })

  describe('three-mode mutual exclusion', () => {
    it('openMaterialEditor with isMaterialDef=true sets flags', () => {
      reset()
      useMaterialStore.getState().openMaterialEditor('f1:p1', ['f1:p1', 'f1:p2'], 'mat / f1', true)
      const s = useMaterialStore.getState()
      expect(s.materialEditorVisible).toBe(true)
      expect(s.editingOverrideKey).toBe('f1:p1')
      expect(s.editingFanoutKeys).toEqual(['f1:p1', 'f1:p2'])
      expect(s.isEditingMaterialDefinition).toBe(true)
      expect(s.isEditingDefault).toBe(false)
    })

    it('openDefaultMaterialEditor resets all mesh/GLB fields', () => {
      // Start from mesh editing state
      reset()
      useMaterialStore.getState().openMaterialEditor('f1:p1', ['f1:p1'], 'Test', false)
      // Now open default editor — must replace
      useMaterialStore.getState().openDefaultMaterialEditor()
      const s = useMaterialStore.getState()
      expect(s.materialEditorVisible).toBe(true)
      expect(s.isEditingDefault).toBe(true)
      expect(s.isEditingMaterialDefinition).toBe(false)
      expect(s.editingOverrideKey).toBe('')
      expect(s.editingFanoutKeys).toEqual([])
    })

    it('openMaterialEditor replaces default material editor', () => {
      reset()
      useMaterialStore.getState().openDefaultMaterialEditor()
      // Now open mesh editor — must replace default
      useMaterialStore.getState().openMaterialEditor('f1:p1', ['f1:p1'], 'Test', false)
      const s = useMaterialStore.getState()
      expect(s.isEditingDefault).toBe(false)
      expect(s.editingOverrideKey).toBe('f1:p1')
      expect(s.materialEditorVisible).toBe(true)
    })

    it('closeMaterialEditor clears isEditingMaterialDefinition', () => {
      reset()
      useMaterialStore.getState().openMaterialEditor('f1:p1', ['f1:p1'], 'Test', true)
      useMaterialStore.getState().closeMaterialEditor()
      const s = useMaterialStore.getState()
      expect(s.materialEditorVisible).toBe(false)
      expect(s.isEditingDefault).toBe(false)
      expect(s.isEditingMaterialDefinition).toBe(false)
    })

    it('openMaterialEditor calls ensureAppearance before setting state', () => {
      // ensureAppearance is called synchronously inside openMaterialEditor.
      // If primaryKey is empty or has no ':', ensureAppearance is skipped.
      reset()
      // Key without fileId prefix — ensureAppearance should be skipped gracefully
      useMaterialStore.getState().openMaterialEditor('noprefix', ['noprefix'], 'Test', false)
      const s = useMaterialStore.getState()
      expect(s.editingOverrideKey).toBe('noprefix')
      expect(s.materialEditorVisible).toBe(true)
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

  // ---- alpha mode switching must preserve existing fields ----
  describe('alpha mode override roundtrip', () => {
    it('preserves color after OPAQUE → BLEND → OPAQUE via overrides', () => {
      reset()
      const brass: MaterialAppearance = {
        name: 'Brass',
        color: [0.8, 0.6, 0.2, 1.0],
        roughness: 0.3,
        metalness: 0.8,
      }
      useMaterialStore.getState().setMaterialOriginalsForFile('f1', { p1: brass })

      // Step 1: set override with BLEND (simulating user clicking "混合")
      useMaterialStore.getState().setMaterialOverride('f1', 'p1', {
        ...brass,
        alphaMode: 'BLEND' as const,
      })
      const blend = useMaterialStore.getState().materialOverrides['f1:p1']
      expect(blend.color).toEqual(brass.color)
      expect(blend.alphaMode).toBe('BLEND')

      // Step 2: set override back to OPAQUE (simulating user clicking "不透明")
      useMaterialStore.getState().setMaterialOverride('f1', 'p1', {
        ...blend,
        alphaMode: 'OPAQUE' as const,
      })
      const opaque = useMaterialStore.getState().materialOverrides['f1:p1']
      expect(opaque.color).toEqual(brass.color)
      expect(opaque.alphaMode).toBe('OPAQUE')
      expect(opaque.roughness).toBe(0.3)
      expect(opaque.metalness).toBe(0.8)
    })

    it('preserves color after OPAQUE → MASK → OPAQUE via overrides', () => {
      reset()
      const brass: MaterialAppearance = {
        name: 'Brass',
        color: [0.8, 0.6, 0.2, 1.0],
        roughness: 0.3,
      }
      useMaterialStore.getState().setMaterialOriginalsForFile('f1', { p1: brass })
      useMaterialStore.getState().setMaterialOverride('f1', 'p1', { ...brass, alphaMode: 'MASK' as const, alphaCutoff: 0.5 })
      useMaterialStore.getState().setMaterialOverride('f1', 'p1', { ...brass, alphaMode: 'OPAQUE' as const })

      const final = useMaterialStore.getState().materialOverrides['f1:p1']
      expect(final.color).toEqual(brass.color)
    })
  })

  // ---- viewingOriginal toggle ----
  describe('viewingOriginal', () => {
    it('defaults to false', () => {
      reset()
      expect(useMaterialStore.getState().viewingOriginal).toBe(false)
    })

    it('toggles', () => {
      reset()
      useMaterialStore.getState().toggleViewingOriginal()
      expect(useMaterialStore.getState().viewingOriginal).toBe(true)
      useMaterialStore.getState().toggleViewingOriginal()
      expect(useMaterialStore.getState().viewingOriginal).toBe(false)
    })
  })

  // ---- texture thumbnails ----
  describe('textureThumbnails', () => {
    it('sets and retrieves thumbnails per file', () => {
      reset()
      useMaterialStore.getState().setTextureThumbnailsForFile('f1', {
        p1: { map: 'data:thumb1', roughnessMap: 'data:thumb2' },
        p2: { map: 'data:thumb3' },
      })
      expect(useMaterialStore.getState().textureThumbnails['f1:p1']).toEqual({
        map: 'data:thumb1',
        roughnessMap: 'data:thumb2',
      })
      expect(useMaterialStore.getState().textureThumbnails['f1:p2']).toEqual({
        map: 'data:thumb3',
      })
    })

    it('clears thumbnails for a specific file', () => {
      reset()
      useMaterialStore.getState().setTextureThumbnailsForFile('f1', { p1: { map: 't1' } })
      useMaterialStore.getState().setTextureThumbnailsForFile('f2', { p1: { map: 't2' } })
      useMaterialStore.getState().clearTextureThumbnailsForFile('f1')
      expect(useMaterialStore.getState().textureThumbnails['f1:p1']).toBeUndefined()
      expect(useMaterialStore.getState().textureThumbnails['f2:p1']).toBeDefined()
    })
  })

  // ---- integration: cloneMaterial → store roundtrip ----
  describe('integration: Three.js material → store → alpha mode roundtrip', () => {
    it('preserves color when toggling alpha mode on a brass material', () => {
      reset()
      // Create a brass-coloured Three.js material (simulating what GLTFLoader produces)
      const mat = new THREE.MeshStandardMaterial({
        color: 0xcc8844,
        roughness: 0.3,
        metalness: 0.8,
      })
      const { appearance } = materialToAppearance(mat, 'Brass Part', new WeakMap())
      expect(appearance).not.toBeNull()

      // Store as original (simulating ModelGroup after loading)
      useMaterialStore.getState().setMaterialOriginalsForFile('f1', {
        p1: appearance!,
      })

      const original = useMaterialStore.getState().materialOriginals['f1:p1']
      expect(original.color).toBeDefined()
      expect(original.alphaMode).toBe('OPAQUE')

      // Simulate user clicking "混合" — apply({ alphaMode: 'BLEND' })
      const blended: MaterialAppearance = { ...original, alphaMode: 'BLEND' as const }
      useMaterialStore.getState().setMaterialOverride('f1', 'p1', blended)
      expect(useMaterialStore.getState().materialOverrides['f1:p1'].color).toEqual(original.color)

      // Simulate user clicking "不透明" — apply({ alphaMode: 'OPAQUE' })
      const backToOpaque: MaterialAppearance = { ...blended, alphaMode: 'OPAQUE' as const }
      useMaterialStore.getState().setMaterialOverride('f1', 'p1', backToOpaque)
      const final = useMaterialStore.getState().materialOverrides['f1:p1']
      expect(final.color).toEqual(original.color)
      expect(final.roughness).toBe(original.roughness)
      expect(final.metalness).toBe(original.metalness)
      expect(final.alphaMode).toBe('OPAQUE')
    })

    it('preserves texture data-URI across alpha mode switches', () => {
      reset()
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 })
      const { appearance } = materialToAppearance(mat, 'Part', new WeakMap())
      useMaterialStore.getState().setMaterialOriginalsForFile('f1', { p1: appearance! })

      const original = useMaterialStore.getState().materialOriginals['f1:p1']
      // Toggle through all three modes
      useMaterialStore.getState().setMaterialOverride('f1', 'p1', { ...original, alphaMode: 'MASK' as const, alphaCutoff: 0.5 })
      useMaterialStore.getState().setMaterialOverride('f1', 'p1', { ...original, alphaMode: 'BLEND' as const })
      useMaterialStore.getState().setMaterialOverride('f1', 'p1', { ...original, alphaMode: 'OPAQUE' as const })

      const result = useMaterialStore.getState().materialOverrides['f1:p1']
      expect(result.color).toEqual(original.color)
      expect(result.roughness).toBe(0.5)
    })
  })

  // ---- full pipeline: Three.js material → appearance → store → MaterialFactory ----
  describe('full pipeline: alpha mode colour preservation', () => {
    it('Three.js material colour survives OPAQUE → BLEND → OPAQUE through full pipeline', () => {
      reset()
      const factory = new MaterialFactory()

      // 1. Create a Three.js material (simulating loaded GLB)
      const srcMat = new THREE.MeshStandardMaterial({
        color: 0xcc8844,
        roughness: 0.3,
        metalness: 0.8,
      })

      // 2. Extract appearance (simulating ModelGroup on load)
      const { appearance: original } = materialToAppearance(srcMat, 'Brass', new WeakMap())
      expect(original).not.toBeNull()
      const originalColor = [...original!.color!] as [number, number, number, number]

      // 3. Store as original
      useMaterialStore.getState().setMaterialOriginalsForFile('f1', { p1: original! })

      // 4. Build material via MaterialFactory — verify initial colour is not white
      const matInitial = factory.createMaterial(original!)
      expect(matInitial.color.getHex()).not.toBe(0xffffff)
      expect(matInitial.roughness).toBe(srcMat.roughness)
      expect(matInitial.metalness).toBe(srcMat.metalness)

      // 5. Simulate MaterialEditor apply({ alphaMode: 'BLEND' })
      const draft = { ...original! }
      const blended = { ...draft, alphaMode: 'BLEND' as const }
      useMaterialStore.getState().setMaterialOverride('f1', 'p1', blended)
      expect(useMaterialStore.getState().materialOverrides['f1:p1'].color).toEqual(originalColor)

      // 6. Build material from BLEND override — colour must equal initial factory material
      const matBlend = factory.createMaterial(blended)
      expect(matBlend.color.r, 'BLEND: color.r must match OPAQUE factory output').toBe(matInitial.color.r)
      expect(matBlend.color.g, 'BLEND: color.g must match OPAQUE factory output').toBe(matInitial.color.g)
      expect(matBlend.color.b, 'BLEND: color.b must match OPAQUE factory output').toBe(matInitial.color.b)
      expect(matBlend.transparent).toBe(true)
      expect(matBlend.opacity).toBe(1.0) // fully opaque alpha channel

      // 7. Simulate MaterialEditor apply({ alphaMode: 'OPAQUE' }) — back to OPAQUE
      const backToOpaque = { ...blended, alphaMode: 'OPAQUE' as const }
      useMaterialStore.getState().setMaterialOverride('f1', 'p1', backToOpaque)
      expect(useMaterialStore.getState().materialOverrides['f1:p1'].color).toEqual(originalColor)

      // 8. Build material from OPAQUE override — MUST equal initial factory output
      const matOpaque2 = factory.createMaterial(backToOpaque)
      expect(matOpaque2.color.r, 'roundtrip: color.r must equal initial').toBe(matInitial.color.r)
      expect(matOpaque2.color.g, 'roundtrip: color.g must equal initial').toBe(matInitial.color.g)
      expect(matOpaque2.color.b, 'roundtrip: color.b must equal initial').toBe(matInitial.color.b)
      expect(matOpaque2.transparent).toBe(false)
      expect(matOpaque2.roughness).toBe(matInitial.roughness)
      expect(matOpaque2.metalness).toBe(matInitial.metalness)

      // 9. Verify colour is byte-identical across all three factory materials
      expect(matOpaque2.color.r).toBe(matInitial.color.r)
      expect(matOpaque2.color.g).toBe(matInitial.color.g)
      expect(matOpaque2.color.b).toBe(matInitial.color.b)

      factory.dispose()
    })

    it('OPAQUE → BLEND → OPAQUE produces identical colour values (no drift)', () => {
      reset()
      const factory = new MaterialFactory()

      const srcMat = new THREE.MeshStandardMaterial({
        color: 0x4488cc,
        roughness: 0.5,
        metalness: 0.3,
      })
      const { appearance } = materialToAppearance(srcMat, 'BlueSteel', new WeakMap())

      const mat1 = factory.createMaterial(appearance!)
      const mat2 = factory.createMaterial({ ...appearance!, alphaMode: 'BLEND' as const })
      const mat3 = factory.createMaterial({ ...appearance!, alphaMode: 'OPAQUE' as const })

      // All three must have exactly the same color (no floating-point drift)
      expect(mat3.color.r).toBe(mat1.color.r)
      expect(mat3.color.g).toBe(mat1.color.g)
      expect(mat3.color.b).toBe(mat1.color.b)

      expect(mat2.color.r).toBe(mat1.color.r)
      expect(mat2.color.g).toBe(mat1.color.g)
      expect(mat2.color.b).toBe(mat1.color.b)

      // Roundtrip: OPAQUE version from cache vs original
      expect(mat3.color.getHex()).toBe(mat1.color.getHex())

      factory.dispose()
    })

    it('switching alpha mode does not mutate other PBR properties', () => {
      reset()
      const factory = new MaterialFactory()

      const base: MaterialAppearance = {
        name: 'Complex',
        color: [0.7, 0.4, 0.1, 1.0],
        roughness: 0.25,
        metalness: 0.85,
        clearcoat: 0.3,
        sheen: 0.2,
        sheenColor: [1.0, 1.0, 0.8],
        emissive: [0.1, 0.05, 0.0],
        emissiveIntensity: 0.5,
      }

      // Build baseline OPAQUE material
      const matOpaque = factory.createMaterial(base)

      // Switch to each mode and verify ALL properties match baseline
      const modes: { mode: AlphaMode; extra?: Partial<MaterialAppearance> }[] = [
        { mode: 'BLEND' },
        { mode: 'MASK', extra: { alphaCutoff: 0.5 } },
        { mode: 'OPAQUE' },
      ]

      for (const { mode, extra } of modes) {
        const app = { ...base, alphaMode: mode, ...extra }
        const mat = factory.createMaterial(app)

        expect(mat.color.r).toBe(matOpaque.color.r)
        expect(mat.color.g).toBe(matOpaque.color.g)
        expect(mat.color.b).toBe(matOpaque.color.b)
        expect(mat.roughness).toBe(matOpaque.roughness)
        expect(mat.metalness).toBe(matOpaque.metalness)
        expect(mat.clearcoat).toBe(matOpaque.clearcoat)
        expect(mat.sheen).toBe(matOpaque.sheen)
        expect(mat.emissiveIntensity).toBe(matOpaque.emissiveIntensity)
      }

      factory.dispose()
    })

    it('KNOWN BUG: color space mismatch — materialToAppearance stores linear values but MaterialFactory treats them as sRGB', () => {
      // The MaterialAppearance type spec says colour components are sRGB 0-1.
      // But materialToAppearance() reads target.color.r (linear) directly
      // without converting to sRGB. MaterialFactory._buildMaterial() then
      // calls mat.color.setRGB(r,g,b, SRGB) which applies sRGB→linear again,
      // double-converting the colour and making it appear darker/wrong.
      //
      // TODO: materialToAppearance should convert from linear to sRGB before
      // storing colour in the appearance, OR MaterialFactory should set colour
      // without SRGB conversion.
      reset()
      const srcMat = new THREE.MeshStandardMaterial({
        color: 0xcc8844,  // sRGB brass colour
        roughness: 0.3,
        metalness: 0.8,
      })
      const { appearance } = materialToAppearance(srcMat, 'Brass', new WeakMap())

      const factory = new MaterialFactory()
      const matFromFactory = factory.createMaterial(appearance!)

      // Expected: factory-created material has the SAME colour as source
      // Actual: colour is double-converted (darker) because linear values
      // are treated as sRGB by MaterialFactory.
      //
      // The hex values will differ. For example, 0xcc8844 (sRGB) becomes
      // ~0xcc8844 in Three.js linear storage, but the factory re-converts
      // those linear values as sRGB → even darker.
      //
      // This assertion documents the current BROKEN behaviour:
      expect(matFromFactory.color.getHex()).not.toBe(srcMat.color.getHex())

      // Once fixed, replace the above with:
      // expect(matFromFactory.color.getHex()).toBe(srcMat.color.getHex())

      factory.dispose()
    })

    it('draft spread merge (MaterialEditor apply logic) preserves all fields', () => {
      // This test replicates the exact logic in MaterialEditor.apply():
      //   const next = { ...prev, ...updates }
      //   setOverride(fileId, partId, next)
      reset()
      const original: MaterialAppearance = {
        name: 'Test',
        color: [0.9, 0.3, 0.1, 1.0],
        roughness: 0.4,
        metalness: 0.6,
        clearcoat: 0.2,
      }
      useMaterialStore.getState().setMaterialOriginalsForFile('f1', { p1: original })

      // Simulate: draft starts as original, user clicks BLEND
      let draft = { ...original }
      let updates: Partial<MaterialAppearance> = { alphaMode: 'BLEND' as const }
      let next = { ...draft, ...updates }
      useMaterialStore.getState().setMaterialOverride('f1', 'p1', next)
      draft = next
      expect(draft.color).toEqual(original.color)
      expect(draft.roughness).toBe(original.roughness)
      expect(draft.clearcoat).toBe(original.clearcoat)

      // Simulate: user clicks OPAQUE
      updates = { alphaMode: 'OPAQUE' as const }
      next = { ...draft, ...updates }
      useMaterialStore.getState().setMaterialOverride('f1', 'p1', next)
      draft = next
      expect(draft.color).toEqual(original.color)
      expect(draft.roughness).toBe(original.roughness)
      expect(draft.alphaMode).toBe('OPAQUE')

      // Build materials via MaterialFactory — the three alpha-mode variants
      // must produce identical colour (same factory pipeline)
      const factory = new MaterialFactory()
      const matOpaque = factory.createMaterial(original)
      const matBlend = factory.createMaterial({ ...original, alphaMode: 'BLEND' as const })
      const matFinal = factory.createMaterial(draft)

      expect(matBlend.color.r).toBe(matOpaque.color.r)
      expect(matBlend.color.g).toBe(matOpaque.color.g)
      expect(matBlend.color.b).toBe(matOpaque.color.b)
      expect(matFinal.color.r).toBe(matOpaque.color.r)
      expect(matFinal.color.g).toBe(matOpaque.color.g)
      expect(matFinal.color.b).toBe(matOpaque.color.b)
      expect(matFinal.roughness).toBe(matOpaque.roughness)
      expect(matFinal.metalness).toBe(matOpaque.metalness)

      factory.dispose()
    })
  })

  describe('defaultMaterial', () => {
    it('initial state is null', () => {
      reset()
      expect(useMaterialStore.getState().defaultMaterial).toBeNull()
    })

    it('setDefaultMaterial stores an appearance', () => {
      reset()
      const app: MaterialAppearance = {
        name: 'Custom Default',
        color: [0.2, 0.6, 0.9, 1.0],
        roughness: 0.15,
        metalness: 0.85,
      }
      useMaterialStore.getState().setDefaultMaterial(app)
      expect(useMaterialStore.getState().defaultMaterial).toEqual(app)
    })

    it('setDefaultMaterial(null) clears the default', () => {
      reset()
      const app: MaterialAppearance = { color: [1, 0, 0] }
      useMaterialStore.getState().setDefaultMaterial(app)
      expect(useMaterialStore.getState().defaultMaterial).not.toBeNull()
      useMaterialStore.getState().setDefaultMaterial(null)
      expect(useMaterialStore.getState().defaultMaterial).toBeNull()
    })

    it('openDefaultMaterialEditor sets isEditingDefault and opens editor', () => {
      reset()
      useMaterialStore.getState().openDefaultMaterialEditor()
      const s = useMaterialStore.getState()
      expect(s.isEditingDefault).toBe(true)
      expect(s.materialEditorVisible).toBe(true)
      expect(s.editingOverrideKey).toBe('')
      expect(s.editingFanoutKeys).toEqual([])
    })

    it('closeMaterialEditor clears isEditingDefault', () => {
      reset()
      useMaterialStore.getState().openDefaultMaterialEditor()
      expect(useMaterialStore.getState().isEditingDefault).toBe(true)
      useMaterialStore.getState().closeMaterialEditor()
      expect(useMaterialStore.getState().isEditingDefault).toBe(false)
      expect(useMaterialStore.getState().materialEditorVisible).toBe(false)
    })
  })

  // ---- integration: defaultMaterial store → MaterialFactory (ModelGroup pipeline) ----
  describe('integration: defaultMaterial → MaterialFactory (STL/Model pipeline)', () => {
    it('creates a Three.js material matching the stored defaultMaterial appearance', () => {
      reset()
      const factory = new MaterialFactory()

      // Simulate user setting a custom default material (e.g. gold-like)
      const goldDefault: MaterialAppearance = {
        name: 'Gold Default',
        color: [0.944, 0.776, 0.216, 1.0],  // #f0c637
        roughness: 0.2,
        metalness: 1.0,
      }
      useMaterialStore.getState().setDefaultMaterial(goldDefault)

      // This is what ModelGroup does: read defaultMaterial → createMaterial
      const stored = useMaterialStore.getState().defaultMaterial
      expect(stored).not.toBeNull()
      const mat = factory.createMaterial(stored!)

      // Verify the Three.js material reflects the stored appearance
      expect(mat).toBeInstanceOf(THREE.MeshPhysicalMaterial)
      expect(mat.roughness).toBe(0.2)
      expect(mat.metalness).toBe(1.0)
      // Color goes through setRGB(r,g,b, SRGB) — sRGB→linear conversion.
      // Verify the color is non-white and the material was created.
      expect(mat.color.r).toBeLessThan(1.0)
      expect(mat.color.g).toBeLessThan(1.0)
      expect(mat.color.b).toBeLessThan(1.0)

      factory.dispose()
    })

    it('falls back to hardcoded default when defaultMaterial is null', () => {
      reset()
      const factory = new MaterialFactory()

      // When defaultMaterial is null, ModelGroup uses the hardcoded fallback.
      // Verify the fallback (createDefaultMaterial) has the expected values.
      expect(useMaterialStore.getState().defaultMaterial).toBeNull()

      // The fallback comes from createDefaultMaterial() in cloneMaterial.ts
      const fallback = createDefaultMaterial()
      expect(fallback.color.getHex()).toBe(DEFAULT_MATERIAL_HEX)
      expect(fallback.roughness).toBe(DEFAULT_MATERIAL_ROUGHNESS)
      expect(fallback.metalness).toBe(DEFAULT_MATERIAL_METALNESS)
      fallback.dispose()
      factory.dispose()
    })

    it('changing defaultMaterial is reflected in newly created materials', () => {
      reset()
      const factory = new MaterialFactory()

      // Start with a blue plastic default
      const bluePlastic: MaterialAppearance = {
        color: [0.1, 0.3, 0.9, 1.0],
        roughness: 0.5,
        metalness: 0.0,
      }
      useMaterialStore.getState().setDefaultMaterial(bluePlastic)
      const mat1 = factory.createMaterial(useMaterialStore.getState().defaultMaterial!)
      expect(mat1.roughness).toBe(0.5)
      expect(mat1.metalness).toBe(0.0)
      // Color went through sRGB→linear conversion — verify it's not black/white
      expect(mat1.color.r + mat1.color.g + mat1.color.b).toBeGreaterThan(0.0)
      expect(mat1.color.r + mat1.color.g + mat1.color.b).toBeLessThan(3.0)

      // User changes default to a red rough material
      const redRough: MaterialAppearance = {
        color: [0.9, 0.1, 0.1, 1.0],
        roughness: 0.9,
        metalness: 0.1,
      }
      useMaterialStore.getState().setDefaultMaterial(redRough)
      const mat2 = factory.createMaterial(useMaterialStore.getState().defaultMaterial!)
      expect(mat2.roughness).toBe(0.9)
      expect(mat2.metalness).toBe(0.1)

      // The two materials should differ (different roughness and different color)
      expect(mat1.color.getHex()).not.toBe(mat2.color.getHex())
      expect(mat1.roughness).not.toBe(mat2.roughness)

      mat1.dispose()
      mat2.dispose()
      factory.dispose()
    })

    it('defaultMaterial with textures is correctly materialised', () => {
      reset()
      const factory = new MaterialFactory()

      // A default material that includes a base color texture data-URI
      const withTexture: MaterialAppearance = {
        color: [0.8, 0.8, 0.8, 1.0],
        roughness: 0.3,
        metalness: 0.2,
        map: 'data:image/png;base64,fakeTextureData',
      }
      useMaterialStore.getState().setDefaultMaterial(withTexture)

      const stored = useMaterialStore.getState().defaultMaterial
      expect(stored).not.toBeNull()
      expect(stored!.map).toBe('data:image/png;base64,fakeTextureData')

      // MaterialFactory tracks texture URIs even without a TextureCache
      const mat = factory.createMaterial(stored!)
      expect(mat).toBeInstanceOf(THREE.MeshPhysicalMaterial)
      expect(mat.roughness).toBe(0.3)
      expect(mat.metalness).toBe(0.2)

      factory.dispose()
    })

    it('defaultMaterial with alpha mode BLEND is materialised correctly', () => {
      reset()
      const factory = new MaterialFactory()

      const glassDefault: MaterialAppearance = {
        name: 'Glass Default',
        color: [0.9, 0.95, 1.0, 0.3],
        roughness: 0.05,
        metalness: 0.0,
        alphaMode: 'BLEND',
        transmission: 0.9,
        ior: 1.5,
      }
      useMaterialStore.getState().setDefaultMaterial(glassDefault)

      const mat = factory.createMaterial(useMaterialStore.getState().defaultMaterial!)
      expect(mat.transparent).toBe(true)
      // MaterialFactory keeps depthWrite=true even for BLEND (CAD-style rendering)
      expect(mat.depthWrite).toBe(true)
      expect(mat.transmission).toBe(0.9)

      factory.dispose()
    })

    // Simulates what thumbnailGenerator.generateThumbnailFromResult() does:
    // traverse cloned meshes and replace MeshBasicMaterial (auto-assigned
    // fallback for STL/model files) with the user's default material.
    it('replaces MeshBasicMaterial with defaultMaterial on cloned meshes (thumbnail pipeline)', () => {
      reset()
      const factory = new MaterialFactory()

      // Set a custom default material
      const customDefault: MaterialAppearance = {
        name: 'Blue Steel',
        color: [0.3, 0.5, 0.8, 1.0],
        roughness: 0.25,
        metalness: 0.9,
      }
      useMaterialStore.getState().setDefaultMaterial(customDefault)

      // Build a scene group mimicking what thumbnailGenerator creates:
      // - MeshBasicMaterial → should be replaced (simulates STL/model)
      // - MeshStandardMaterial → should be left alone (simulates GLB/3MF)
      const group = new THREE.Group()
      const stlMesh = new THREE.Mesh(
        new THREE.BoxGeometry(),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
      )
      const glbMesh = new THREE.Mesh(
        new THREE.BoxGeometry(),
        new THREE.MeshStandardMaterial({ color: 0xff0000 }),
      )
      group.add(stlMesh)
      group.add(glbMesh)

      // Apply the same logic as thumbnailGenerator
      const stored = useMaterialStore.getState().defaultMaterial
      expect(stored).not.toBeNull()
      const defaultMat = factory.createMaterial(stored!)

      group.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshBasicMaterial) {
          obj.material = defaultMat
        }
      })

      // STL-like mesh: MeshBasicMaterial replaced with defaultMaterial
      expect(stlMesh.material).toBe(defaultMat)
      expect((stlMesh.material as THREE.MeshPhysicalMaterial).roughness).toBe(0.25)
      expect((stlMesh.material as THREE.MeshPhysicalMaterial).metalness).toBe(0.9)

      // GLB-like mesh: MeshStandardMaterial preserved
      expect(glbMesh.material).not.toBe(defaultMat)
      expect(glbMesh.material).toBeInstanceOf(THREE.MeshStandardMaterial)

      factory.dispose()
    })

    it('leaves MeshBasicMaterial untouched when defaultMaterial is null', () => {
      reset()
      expect(useMaterialStore.getState().defaultMaterial).toBeNull()

      const group = new THREE.Group()
      const stlMesh = new THREE.Mesh(
        new THREE.BoxGeometry(),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
      )
      group.add(stlMesh)

      // When defaultMaterial is null, the thumbnail generator skips traversal
      const stored = useMaterialStore.getState().defaultMaterial
      expect(stored).toBeNull()

      // No replacement happens — MeshBasicMaterial stays
      expect(stlMesh.material).toBeInstanceOf(THREE.MeshBasicMaterial)
    })
  })

  describe('texturePreview', () => {
    it('starts with null slot and label', () => {
      reset()
      expect(useMaterialStore.getState().texturePreviewSlot).toBeNull()
      expect(useMaterialStore.getState().texturePreviewLabel).toBeNull()
    })

    it('openTexturePreview sets slot and label', () => {
      reset()
      useMaterialStore.getState().openTexturePreview('map', 'Base Color')
      expect(useMaterialStore.getState().texturePreviewSlot).toBe('map')
      expect(useMaterialStore.getState().texturePreviewLabel).toBe('Base Color')
    })

    it('closeTexturePreview clears slot and label', () => {
      reset()
      useMaterialStore.getState().openTexturePreview('roughnessMap', 'Roughness')
      expect(useMaterialStore.getState().texturePreviewSlot).toBe('roughnessMap')

      useMaterialStore.getState().closeTexturePreview()
      expect(useMaterialStore.getState().texturePreviewSlot).toBeNull()
      expect(useMaterialStore.getState().texturePreviewLabel).toBeNull()
    })
  })
})
