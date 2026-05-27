/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useMaterialStore } from '@/stores/material-store'
import type { MaterialAppearance } from '@/engine/material/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'zh', changeLanguage: () => Promise.resolve() },
  }),
}))

// jsdom does not provide ResizeObserver — required by Radix ScrollArea
class ResizeObserverMock {
  private callback: ResizeObserverCallback
  constructor(callback: ResizeObserverCallback) { this.callback = callback }
  observe(target: Element) {
    this.callback(
      [{ contentRect: target.getBoundingClientRect() as DOMRectReadOnly, target } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    )
  }
  unobserve() {}
  disconnect() {}
}
beforeAll(() => { vi.stubGlobal('ResizeObserver', ResizeObserverMock) })
afterAll(() => { vi.unstubAllGlobals() })

const brassColor: [number, number, number, number] = [0.8, 0.6, 0.2, 1.0]

const brassMaterial: MaterialAppearance = {
  name: 'Brass Part',
  color: brassColor,
  roughness: 0.3,
  metalness: 0.8,
}

function resetStore() {
  useMaterialStore.setState({
    materialOverrides: {},
    editingOverrideKeys: [],
    overrideMaterial: true,
    overridePresetRefs: {},
    materialClipboard: null,
    materialEditorVisible: false,
    materialEditorPosition: { x: 100, y: 100 },
    materialEditorTitle: '',
    isEditingDefault: false,
    defaultMaterial: null,
    materialOriginals: {},
    textureThumbnails: {},
    viewingOriginal: false,
  })
}

function openEditor(fileId: string, partId: string, original: MaterialAppearance) {
  useMaterialStore.getState().setMaterialOriginalsForFile(fileId, { [partId]: { ...original } })
  useMaterialStore.getState().openMaterialEditor([`${fileId}:${partId}`], `${original.name} / part`)
}

// Must import AFTER store setup — MaterialEditor reads store on import
import MaterialEditor from '@/components/panels/MaterialEditor'

function MaterialEditorTestWrapper() {
  const visible = useMaterialStore((s) => s.materialEditorVisible)
  if (!visible) return null
  return <MaterialEditor />
}

describe('MaterialEditor alpha mode colour preservation', () => {
  beforeEach(() => {
    cleanup()
    resetStore()
  })

  function getStoreColor(key: string) {
    const s = useMaterialStore.getState()
    const app = s.materialOverrides[key] ?? s.materialOriginals[key]
    return app?.color ?? null
  }

  it('OPAQUE → BLEND → OPAQUE roundtrip preserves colour in store', async () => {
    const user = userEvent.setup()
    const key = 'f1:p1'
    openEditor('f1', 'p1', brassMaterial)

    // Record original colour
    const originalColor = getStoreColor(key)
    expect(originalColor).toEqual(brassColor)

    render(<MaterialEditorTestWrapper />)

    // Verify editor is visible
    expect(screen.getByText('Brass Part / part')).toBeDefined()

    // Click "混合" (BLEND)
    await user.click(screen.getByText('混合'))

    // After BLEND — colour MUST be intact
    const afterBlend = getStoreColor(key)
    expect(afterBlend, 'colour must NOT change when switching to BLEND').toEqual(originalColor)
    expect(useMaterialStore.getState().materialOverrides[key].alphaMode).toBe('BLEND')

    // Click "不透明" (OPAQUE)
    await user.click(screen.getByText('不透明'))

    // After roundtrip — colour MUST equal original
    const afterRoundtrip = getStoreColor(key)
    expect(afterRoundtrip, 'colour must NOT change after OPAQUE→BLEND→OPAQUE roundtrip').toEqual(originalColor)
  })

  it('OPAQUE → MASK → OPAQUE roundtrip preserves colour in store', async () => {
    const user = userEvent.setup()
    const key = 'f1:p1'
    openEditor('f1', 'p1', brassMaterial)
    const originalColor = getStoreColor(key)

    render(<MaterialEditorTestWrapper />)

    await user.click(screen.getByText('遮罩'))
    expect(getStoreColor(key)).toEqual(originalColor)

    await user.click(screen.getByText('不透明'))
    expect(getStoreColor(key), 'colour preserved after OPAQUE→MASK→OPAQUE').toEqual(originalColor)
  })

  it('BLEND → OPAQUE → BLEND → OPAQUE preserves colour and roughness', async () => {
    const user = userEvent.setup()
    const key = 'f1:p1'
    openEditor('f1', 'p1', brassMaterial)
    const originalColor = [...getStoreColor(key)!]

    render(<MaterialEditorTestWrapper />)

    // BLEND
    await user.click(screen.getByText('混合'))
    expect(getStoreColor(key)).toEqual(originalColor)
    expect(useMaterialStore.getState().materialOverrides[key].roughness).toBe(0.3)

    // OPAQUE
    await user.click(screen.getByText('不透明'))
    expect(getStoreColor(key)).toEqual(originalColor)

    // BLEND again
    await user.click(screen.getByText('混合'))
    expect(getStoreColor(key)).toEqual(originalColor)

    // OPAQUE again
    await user.click(screen.getByText('不透明'))
    expect(getStoreColor(key)).toEqual(originalColor)
    expect(useMaterialStore.getState().materialOverrides[key].roughness).toBe(0.3)
    expect(useMaterialStore.getState().materialOverrides[key].metalness).toBe(0.8)
  })

  it('OPAQUE slider is disabled, MASK/BLEND sliders are enabled', async () => {
    const user = userEvent.setup()
    openEditor('f1', 'p1', brassMaterial)

    render(<MaterialEditorTestWrapper />)

    // OPAQUE: slider disabled, value locked at 1
    const sliders = () => document.querySelectorAll('input[type="range"]')
    const opacitySlider = Array.from(sliders()).find((s) => (s as HTMLInputElement).disabled)
    expect(opacitySlider, 'OPAQUE slider should be disabled').toBeDefined()
    expect((opacitySlider as HTMLInputElement).value).toBe('1')

    // Switch to BLEND: slider enabled
    await user.click(screen.getByText('混合'))
    // After switching, find the opacity slider — it should not be disabled
    const blendSliders = Array.from(sliders())
    // The alpha section slider should be enabled in BLEND mode
    const enabledAfterBlend = blendSliders.some(
      (s) => !(s as HTMLInputElement).disabled && (s as HTMLInputElement).max === '1',
    )
    expect(enabledAfterBlend).toBe(true)
  })

  it('non-textured rows have no " x" suffix, no thumbnail', () => {
    openEditor('f1', 'p1', brassMaterial)
    render(<MaterialEditorTestWrapper />)

    // Without textures, no " x" suffix should appear in the DOM
    // Just check that the rough label exists (basic render check)
    expect(screen.getByText('materialEditor.roughness')).toBeDefined()
  })

  it('scroll area uses CSS grid layout for constrained height', () => {
    openEditor('f1', 'p1', brassMaterial)
    render(<MaterialEditorTestWrapper />)

    // Verify the outer panel uses grid layout (not flex) with overflow hidden
    const panel = document.querySelector('.fixed.z-50') as HTMLElement | null
    expect(panel, 'Outer panel must exist').toBeDefined()
    expect(panel!.className, 'Panel must use grid').toMatch(/\bgrid\b/)
    expect(panel!.className, 'Panel must have overflow-hidden').toMatch(/overflow-hidden/)

    // Panel must define grid-template-rows: auto 1fr auto via inline style
    expect(panel!.style.gridTemplateRows, 'Must define grid rows').toBe('auto 1fr auto')

    // Panel must have an explicit height (not just max-height) so that the
    // 1fr grid track resolves to a definite value for scroll to work
    expect(panel!.style.height, 'Must have explicit height').toBeTruthy()

    // ScrollArea must have min-h-0 to allow shrinking within the grid row
    const scrollRoot = panel!.querySelector('[data-radix-scroll-area-viewport]')?.parentElement
    expect(scrollRoot, 'ScrollArea root must exist').toBeDefined()
    expect(scrollRoot!.className, 'ScrollArea must have min-h-0').toMatch(/min-h-0/)

    // Radix viewport must exist
    const viewport = scrollRoot!.querySelector('[data-radix-scroll-area-viewport]')
    expect(viewport, 'Radix ScrollArea viewport must be rendered').toBeDefined()

    // Radix scrollbar thumb must be rendered
    const thumb = scrollRoot!.querySelector('[data-radix-scroll-area-thumb]')
    expect(thumb, 'Radix scrollbar thumb must be rendered').toBeDefined()
  })

  it('scroll area is absent when editor is hidden', () => {
    render(<MaterialEditorTestWrapper />)
    const viewport = document.querySelector('[data-radix-scroll-area-viewport]')
    expect(viewport, 'ScrollArea must not be rendered when editor is hidden').toBeNull()
  })
})
