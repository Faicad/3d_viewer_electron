import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  parseSvgLayers,
  parseSvgViewBox,
  applyLayerVisibility,
  useSvgWorkspaceStore,
} from '@/stores/svg-workspace-store'

const FIXTURES_DIR = path.resolve(__dirname, '../../test/fixtures/svg')

function readFixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf-8')
}

const SAMPLE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 150">
  <g id="bg" inkscape:label="Background">
    <rect width="200" height="150" fill="#eee"/>
  </g>
  <g id="fg">
    <circle cx="100" cy="75" r="30" fill="blue"/>
  </g>
</svg>`

const NO_GROUPS = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="20" fill="red"/>
</svg>`

describe('parseSvgLayers', () => {
  it('extracts top-level <g> elements as layers', () => {
    const layers = parseSvgLayers(SAMPLE)
    expect(layers).toHaveLength(2)
    expect(layers[0].id).toBe('bg')
    expect(layers[0].name).toBe('Background')
    expect(layers[0].visible).toBe(true)
    expect(layers[1].id).toBe('fg')
    expect(layers[1].name).toBe('fg')
    expect(layers[1].visible).toBe(true)
  })

  it('returns single layer when no <g> elements exist', () => {
    const layers = parseSvgLayers(NO_GROUPS)
    expect(layers).toHaveLength(1)
    expect(layers[0].id).toBe('layer-0')
    expect(layers[0].name).toBe('Layer 1')
    expect(layers[0].visible).toBe(true)
  })

  it('parses all fixture SVGs without error', () => {
    const files = fs.readdirSync(FIXTURES_DIR).filter((f) => f.endsWith('.svg'))
    expect(files.length).toBeGreaterThanOrEqual(9)
    for (const file of files) {
      const svgText = readFixture(file)
      const layers = parseSvgLayers(svgText)
      expect(layers.length).toBeGreaterThanOrEqual(1)
      for (const layer of layers) {
        expect(typeof layer.id).toBe('string')
        expect(typeof layer.name).toBe('string')
        expect(typeof layer.visible).toBe('boolean')
      }
    }
  })
})

describe('parseSvgViewBox', () => {
  it('parses viewBox dimensions', () => {
    const { naturalWidth, naturalHeight } = parseSvgViewBox(SAMPLE)
    expect(naturalWidth).toBe(200)
    expect(naturalHeight).toBe(150)
  })

  it('falls back to width/height attributes', () => {
    const svg = '<svg width="300" height="200"></svg>'
    const { naturalWidth, naturalHeight } = parseSvgViewBox(svg)
    expect(naturalWidth).toBe(300)
    expect(naturalHeight).toBe(200)
  })

  it('returns defaults for empty SVG', () => {
    const svg = '<svg></svg>'
    const { naturalWidth, naturalHeight } = parseSvgViewBox(svg)
    expect(naturalWidth).toBe(800)
    expect(naturalHeight).toBe(600)
  })

  it('parses viewBox from all fixture SVGs', () => {
    const files = fs.readdirSync(FIXTURES_DIR).filter((f) => f.endsWith('.svg'))
    for (const file of files) {
      const svgText = readFixture(file)
      const { naturalWidth, naturalHeight } = parseSvgViewBox(svgText)
      expect(naturalWidth).toBeGreaterThan(0)
      expect(naturalHeight).toBeGreaterThan(0)
    }
  })
})

describe('applyLayerVisibility', () => {
  it('hides a layer by adding display:none', () => {
    const layers = parseSvgLayers(SAMPLE)
    layers[0].visible = false
    const result = applyLayerVisibility(SAMPLE, layers)
    expect(result).toContain('display:none')
  })

  it('shows all layers when all visible', () => {
    const layers = parseSvgLayers(SAMPLE)
    const result = applyLayerVisibility(SAMPLE, layers)
    expect(result).not.toContain('display:none')
  })

  it('returns valid SVG for hidden single layer (no <g> elements)', () => {
    const layers = parseSvgLayers(NO_GROUPS)
    layers[0].visible = false
    const result = applyLayerVisibility(NO_GROUPS, layers)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })
})

describe('svgWorkspaceStore', () => {
  beforeEach(() => {
    useSvgWorkspaceStore.setState({ files: [], selectedFileId: null })
  })

  it('addFilesBatch creates files with grid placement', () => {
    const store = useSvgWorkspaceStore.getState()
    store.setCanvasSize(800, 600)

    store.addFilesBatch([
      { fileId: 'a', fileName: 'a.svg', svgText: NO_GROUPS, layers: parseSvgLayers(NO_GROUPS), naturalWidth: 100, naturalHeight: 100 },
      { fileId: 'b', fileName: 'b.svg', svgText: NO_GROUPS, layers: parseSvgLayers(NO_GROUPS), naturalWidth: 100, naturalHeight: 100 },
    ])

    const state = useSvgWorkspaceStore.getState()
    expect(state.files).toHaveLength(2)
    expect(state.files[0].placement).toBe('grid')
    expect(state.files[1].placement).toBe('grid')
    expect(state.selectedFileId).toBe('a')
  })

  it('toggleFile adds and removes a file', () => {
    const store = useSvgWorkspaceStore.getState()
    store.setCanvasSize(800, 600)

    // Add
    store.toggleFile('x', 'x.svg', NO_GROUPS, parseSvgLayers(NO_GROUPS), 100, 100)
    expect(useSvgWorkspaceStore.getState().files).toHaveLength(1)

    // Remove
    store.toggleFile('x', 'x.svg', NO_GROUPS, parseSvgLayers(NO_GROUPS), 100, 100)
    expect(useSvgWorkspaceStore.getState().files).toHaveLength(0)
  })

  it('moveFile converts grid to free placement', () => {
    const store = useSvgWorkspaceStore.getState()

    // Add a grid file
    store.addFilesBatch([
      { fileId: 'd', fileName: 'd.svg', svgText: NO_GROUPS, layers: parseSvgLayers(NO_GROUPS), naturalWidth: 100, naturalHeight: 100 },
    ])

    expect(useSvgWorkspaceStore.getState().files[0].placement).toBe('grid')

    // Drag moves it
    store.moveFile('d', 150, 200)
    const f = useSvgWorkspaceStore.getState().files.find((x) => x.fileId === 'd')
    expect(f?.placement).toBe('free')
    expect(f?.x).toBe(150)
    expect(f?.y).toBe(200)
  })

  it('toggleLayer toggles visibility', () => {
    const store = useSvgWorkspaceStore.getState()

    store.addFilesBatch([
      { fileId: 'e', fileName: 'e.svg', svgText: SAMPLE, layers: parseSvgLayers(SAMPLE), naturalWidth: 200, naturalHeight: 150 },
    ])

    const before = useSvgWorkspaceStore.getState().files.find((x) => x.fileId === 'e')
    expect(before?.layers[0].visible).toBe(true)

    store.toggleLayer('e', 'bg')
    const after = useSvgWorkspaceStore.getState().files.find((x) => x.fileId === 'e')
    expect(after?.layers[0].visible).toBe(false)

    store.toggleLayer('e', 'bg')
    const after2 = useSvgWorkspaceStore.getState().files.find((x) => x.fileId === 'e')
    expect(after2?.layers[0].visible).toBe(true)
  })

  it('toggleFileVisible toggles file visibility', () => {
    const store = useSvgWorkspaceStore.getState()

    store.addFilesBatch([
      { fileId: 'f', fileName: 'f.svg', svgText: SAMPLE, layers: parseSvgLayers(SAMPLE), naturalWidth: 200, naturalHeight: 150 },
    ])

    expect(useSvgWorkspaceStore.getState().files[0].visible).toBe(true)

    store.toggleFileVisible('f')
    expect(useSvgWorkspaceStore.getState().files[0].visible).toBe(false)

    store.toggleFileVisible('f')
    expect(useSvgWorkspaceStore.getState().files[0].visible).toBe(true)
  })
})
