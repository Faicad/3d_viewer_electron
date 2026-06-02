import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import * as THREE from 'three'
import { unzipSync } from 'three/examples/jsm/libs/fflate.module.js'
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js'
import { JSDOM } from 'jsdom'
import {
  parseBambu3mf,
  parse3mfBuild,
  stripExtension,
  parseModelMeta,
  extractThumbnailBlob,
  type Bambu3mfMetadata,
} from './bambu-3mf'
import { loadFormat } from '@/engine/formatLoaders'
import { useModelStore } from '@/stores/model-store'

const FIXTURE = path.resolve('src/test/fixtures/vise.3mf')

// ThreeMFLoader.parse() uses global DOMParser — polyfill from jsdom for Node
const dom = new JSDOM()
if (typeof globalThis.DOMParser === 'undefined') {
  ;(globalThis as any).DOMParser = dom.window.DOMParser
}

// ---------------------------------------------------------------------------
// Bambu metadata extraction tests
// ---------------------------------------------------------------------------
describe('parseBambu3mf — metadata extraction', () => {
  let metadata: Bambu3mfMetadata

  beforeAll(() => {
    const raw = fs.readFileSync(FIXTURE)
    const buf = raw.buffer.slice(
      raw.byteOffset,
      raw.byteOffset + raw.byteLength,
    ) as ArrayBuffer
    metadata = parseBambu3mf(buf)
  })

  it('extracts 5 filament colors', () => {
    expect(metadata.filamentColors).toHaveLength(5)
    expect(metadata.filamentColors[0]).toBe('#FFFFFF')
    expect(metadata.filamentColors[1]).toBe('#A6A9AA')
    expect(metadata.filamentColors[2]).toBe('#8BD5EE')
    expect(metadata.filamentColors[3]).toBe('#0069B1')
    expect(metadata.filamentColors[4]).toBe('#F330F9')
  })

  it('extracts 5 filament types', () => {
    expect(metadata.filamentTypes).toHaveLength(5)
    expect(metadata.filamentTypes[0]).toBe('PETG')
    expect(metadata.filamentTypes[1]).toBe('PLA')
    expect(metadata.filamentTypes[3]).toBe('PETG')
  })

  it('extracts 19 objects', () => {
    expect(metadata.objects.size).toBe(19)
  })

  it('extracts correct object names', () => {
    expect(metadata.objects.get('2')?.name).toBe('screw holder.stl')
    expect(metadata.objects.get('4')?.name).toBe('screw_cup.stl')
    expect(metadata.objects.get('19')?.name).toBe('vise body.stl')
    expect(metadata.objects.get('22')?.name).toBe('holder.stl')
    expect(metadata.objects.get('35')?.name).toBe('safty.stl')
  })

  it('maps extruder assignments correctly', () => {
    // Plate 1 (blue PETG): extruder 4
    expect(metadata.objects.get('2')?.extruder).toBe(4)
    expect(metadata.objects.get('6')?.extruder).toBe(4)
    expect(metadata.objects.get('35')?.extruder).toBe(4)

    // Plate 2 (white PLA): extruder 1
    expect(metadata.objects.get('16')?.extruder).toBe(1)
    expect(metadata.objects.get('19')?.extruder).toBe(1)
    expect(metadata.objects.get('22')?.extruder).toBe(1)
  })

  it('produces 21 flat parts (one per flattened mesh)', () => {
    expect(metadata.parts).toHaveLength(21)
  })

  it('parts are indexed 0..20 consecutively', () => {
    for (let i = 0; i < 21; i++) {
      expect(metadata.parts[i].partIndex).toBe(i)
    }
  })

  it('every part has non-empty objectId and partId', () => {
    for (const p of metadata.parts) {
      expect(p.objectId).toBeTruthy()
      expect(p.partId).toBeTruthy()
    }
  })

  it('multi-part objects: vise body has 2 parts with correct extruders', () => {
    const parts19 = metadata.parts.filter(p => p.objectId === '19')
    expect(parts19).toHaveLength(2)

    // First part: white PLA body (extruder 1)
    expect(parts19[0].partId).toBe('17')
    expect(parts19[0].name).toBe('vise body_1')
    expect(parts19[0].extruder).toBe(1)

    // Second part: blue PETG inset (extruder 4)
    expect(parts19[1].partId).toBe('18')
    expect(parts19[1].name).toBe('vise body_2')
    expect(parts19[1].extruder).toBe(4)
  })

  it('multi-part objects: holder has 2 parts with correct extruders', () => {
    const parts22 = metadata.parts.filter(p => p.objectId === '22')
    expect(parts22).toHaveLength(2)

    expect(parts22[0].partId).toBe('20')
    expect(parts22[0].name).toBe('holder_1')
    expect(parts22[0].extruder).toBe(1)

    expect(parts22[1].partId).toBe('21')
    expect(parts22[1].name).toBe('holder_2')
    expect(parts22[1].extruder).toBe(4)
  })

  it('parts inherit plateId from parent object', () => {
    // Objects on plate 1 → parts on plate 1
    for (const p of metadata.parts) {
      if (['2', '4', '6', '8', '10', '12', '14', '29', '30', '32', '33', '35'].includes(p.objectId)) {
        expect(p.plateId).toBe(1)
      }
      // Objects on plate 2 → parts on plate 2
      if (['16', '19', '22', '24', '25', '26', '27'].includes(p.objectId)) {
        expect(p.plateId).toBe(2)
      }
    }
  })

  it('every part extruder maps to a valid filament color', () => {
    for (const p of metadata.parts) {
      const fi = p.extruder - 1
      expect(
        fi >= 0 && fi < metadata.filamentColors.length,
        `Part index=${p.partIndex} extruder=${p.extruder} out of range (0..${metadata.filamentColors.length})`,
      ).toBe(true)
      const color = metadata.filamentColors[fi]
      expect(color).toBeTruthy()
      expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })

  it('part names have extensions stripped — single parts', () => {
    const p2 = metadata.parts.find(p => p.objectId === '2')
    expect(p2?.name).toBe('screw holder')      // was "screw holder.stl"
    const p4 = metadata.parts.find(p => p.objectId === '4')
    expect(p4?.name).toBe('screw_cup')         // was "screw_cup.stl"
    const p35 = metadata.parts.find(p => p.objectId === '35')
    expect(p35?.name).toBe('safty')            // was "safty.stl"
  })

  it('scene tree plate grouping — every part has a plateId', () => {
    for (const p of metadata.parts) {
      expect(p.plateId).toBeGreaterThanOrEqual(1)
      expect(p.plateId).toBeLessThanOrEqual(2)
    }
  })

  it('scene tree plate grouping — parts are split across 2 plates', () => {
    const plate1Count = metadata.parts.filter(p => p.plateId === 1).length
    const plate2Count = metadata.parts.filter(p => p.plateId === 2).length
    expect(plate1Count + plate2Count).toBe(21)
    expect(plate1Count).toBeGreaterThan(0)
    expect(plate2Count).toBeGreaterThan(0)
  })

  it('vise body part 2 (blue inset) is indexed right after part 1 (white body) in flat list', () => {
    // The build items order puts object 19 at index 8 in build order.
    // Its two parts should be consecutive in the flat parts list.
    const idx17 = metadata.parts.findIndex(
      p => p.objectId === '19' && p.partId === '17',
    )
    const idx18 = metadata.parts.findIndex(
      p => p.objectId === '19' && p.partId === '18',
    )
    expect(idx18).toBe(idx17 + 1)
  })

  it('maps plate assignments from model_settings.config', () => {
    // Plate 1
    expect(metadata.objects.get('2')?.plateId).toBe(1)
    expect(metadata.objects.get('4')?.plateId).toBe(1)
    expect(metadata.objects.get('6')?.plateId).toBe(1)
    expect(metadata.objects.get('8')?.plateId).toBe(1)
    expect(metadata.objects.get('10')?.plateId).toBe(1)
    expect(metadata.objects.get('35')?.plateId).toBe(1)

    // Plate 2
    expect(metadata.objects.get('16')?.plateId).toBe(2)
    expect(metadata.objects.get('19')?.plateId).toBe(2)
    expect(metadata.objects.get('22')?.plateId).toBe(2)
    expect(metadata.objects.get('24')?.plateId).toBe(2)
    expect(metadata.objects.get('27')?.plateId).toBe(2)
  })

  it('identifies 2 plates', () => {
    expect(metadata.plates.size).toBe(2)
    expect(metadata.plates.has(1)).toBe(true)
    expect(metadata.plates.has(2)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 3MF structure correspondence: Bambu metadata ↔ standard 3MF XML
// ---------------------------------------------------------------------------
describe('3MF structure correspondence', () => {
  let buildItems: ReturnType<typeof parse3mfBuild>
  let metadata: Bambu3mfMetadata

  beforeAll(() => {
    const raw = fs.readFileSync(FIXTURE)
    const arr = new Uint8Array(raw)
    const buf = raw.buffer.slice(
      raw.byteOffset,
      raw.byteOffset + raw.byteLength,
    ) as ArrayBuffer

    metadata = parseBambu3mf(buf)
    const modelXml = new TextDecoder().decode(
      unzipSync(arr)['3D/3dmodel.model'],
    )
    buildItems = parse3mfBuild(modelXml)
  })

  it('3D/3dmodel.model contains 19 build items', () => {
    expect(buildItems).toHaveLength(19)
  })

  it('every build item objectId has corresponding Bambu metadata', () => {
    for (const item of buildItems) {
      expect(
        metadata.objects.has(item.objectId),
        `Build item objectId="${item.objectId}" missing from model_settings.config`,
      ).toBe(true)
    }
  })

  it('every Bambu object ID appears in 3MF build items', () => {
    const buildIds = new Set(buildItems.map(i => i.objectId))
    for (const oid of metadata.objects.keys()) {
      expect(
        buildIds.has(oid),
        `Bambu objectId="${oid}" not found in 3MF build section`,
      ).toBe(true)
    }
  })

  it('build items have valid transform matrices', () => {
    for (const item of buildItems) {
      expect(item.transform).not.toBeNull()
      expect(item.transform).toHaveLength(12)
      for (let i = 0; i < 9; i++) {
        expect(isFinite(item.transform![i])).toBe(true)
      }
    }
  })

  it('every part belongs to a build item objectId', () => {
    const buildIds = new Set(buildItems.map(i => i.objectId))
    for (const part of metadata.parts) {
      expect(
        buildIds.has(part.objectId),
        `Part index=${part.partIndex} references objectId="${part.objectId}" not in build`,
      ).toBe(true)
    }
  })

  it('parts list order matches build item order with multi-part expansion', () => {
    let pi = 0
    for (const item of buildItems) {
      const obj = metadata.objects.get(item.objectId)
      expect(obj).toBeDefined()
      while (
        pi < metadata.parts.length &&
        metadata.parts[pi].objectId === item.objectId
      ) {
        expect(metadata.parts[pi].partIndex).toBe(pi)
        pi++
      }
    }
    // All 21 parts consumed by walking build items
    expect(pi).toBe(21)
  })
})

// ---------------------------------------------------------------------------
// stripExtension utility
// ---------------------------------------------------------------------------
describe('stripExtension', () => {
  it('strips .stl from single-part name', () => {
    expect(stripExtension('screw holder.stl')).toBe('screw holder')
    expect(stripExtension('screw_cup.stl')).toBe('screw_cup')
  })

  it('strips .stl but preserves multi-part _N suffix', () => {
    expect(stripExtension('vise body.stl_1')).toBe('vise body_1')
    expect(stripExtension('vise body.stl_2')).toBe('vise body_2')
    expect(stripExtension('holder.stl_1')).toBe('holder_1')
  })

  it('strips other known 3D extensions', () => {
    expect(stripExtension('model.step')).toBe('model')
    expect(stripExtension('model.stp')).toBe('model')
    expect(stripExtension('model.obj')).toBe('model')
    expect(stripExtension('model.3mf')).toBe('model')
    expect(stripExtension('model.glb')).toBe('model')
  })

  it('keeps names without known extensions unchanged', () => {
    expect(stripExtension('no-extension')).toBe('no-extension')
    expect(stripExtension('file.txt')).toBe('file.txt')
    expect(stripExtension('file')).toBe('file')
  })
})

// ---------------------------------------------------------------------------
// Model-level metadata extraction (parseModelMeta)
// ---------------------------------------------------------------------------
describe('parseModelMeta', () => {
  let modelXml: string

  beforeAll(() => {
    const raw = fs.readFileSync(FIXTURE)
    const arr = new Uint8Array(raw)
    modelXml = new TextDecoder().decode(unzipSync(arr)['3D/3dmodel.model'])
  })

  it('extracts title from <metadata name="Title">', () => {
    const meta = parseModelMeta(modelXml)
    expect(meta.title).toBe(
      'Table Vise - fully printable with changable jaws',
    )
  })

  it('extracts designer from <metadata name="Designer">', () => {
    const meta = parseModelMeta(modelXml)
    expect(meta.designer).toBe('3D anarchy')
  })

  it('extracts license from <metadata name="License">', () => {
    const meta = parseModelMeta(modelXml)
    expect(meta.license).toBe('BY-ND')
  })

  it('extracts description from <metadata name="Description">', () => {
    const meta = parseModelMeta(modelXml)
    expect(meta.description).toBeTruthy()
    expect(meta.description).toContain('Vise')
  })
})

// ---------------------------------------------------------------------------
// Standard 3MF thumbnail extraction (extractThumbnailBlob)
// ---------------------------------------------------------------------------
describe('extractThumbnailBlob', () => {
  it('extracts thumbnail from Auxiliaries/.thumbnails in vise.3mf', () => {
    const raw = fs.readFileSync(FIXTURE)
    const arr = new Uint8Array(raw)
    const unzipped = unzipSync(arr)
    const blob = extractThumbnailBlob(unzipped)
    expect(blob).toBeDefined()
    expect(blob!.type).toBe('image/png')
    expect(blob!.size).toBeGreaterThan(0)
  })

  it('thumbnailBlob propagates through full parseBambu3mf', () => {
    const raw = fs.readFileSync(FIXTURE)
    const buf = raw.buffer.slice(
      raw.byteOffset,
      raw.byteOffset + raw.byteLength,
    ) as ArrayBuffer
    const metadata = parseBambu3mf(buf)
    expect(metadata.thumbnailBlob).toBeDefined()
    expect(metadata.thumbnailBlob!.type).toBe('image/png')
  })
})

// ---------------------------------------------------------------------------
// Loader integration: loadFormat + store
// ---------------------------------------------------------------------------
describe('Loader integration', () => {
  it('loadFormat for 3mf returns bambuMetadata', async () => {
    const raw = fs.readFileSync(FIXTURE)
    const buf = raw.buffer.slice(
      raw.byteOffset,
      raw.byteOffset + raw.byteLength,
    ) as ArrayBuffer
    const result = await loadFormat(buf, '3mf')
    expect(result.bambuMetadata).toBeDefined()
    expect(result.bambuMetadata!.parts).toHaveLength(21)
    expect(result.bambuMetadata!.modelMeta?.designer).toBe('3D anarchy')
    expect(result.bambuMetadata!.filamentColors).toHaveLength(5)
  }, 30000)

  it('loadFormat for non-3mf formats does not include bambuMetadata', async () => {
    // Create a simple STL buffer
    const vertices = new Float32Array([
      -1, -1, 0, 1, -1, 0, 0, 1, 0,
    ])
    const indices = new Uint32Array([0, 1, 2])
    const header = new TextEncoder().encode(
      'solid test\n facet normal 0 0 1\n  outer loop\n',
    )
    const footer = new TextEncoder().encode(
      '  endloop\n endfacet\nendsolid test\n',
    )
    const stlBuffer = new Uint8Array(
      header.length + footer.length + vertices.byteLength + indices.byteLength,
    )
    stlBuffer.set(header, 0)
    stlBuffer.set(new Uint8Array(vertices.buffer), header.length)
    stlBuffer.set(footer, header.length + vertices.byteLength)

    const result = await loadFormat(stlBuffer.buffer as ArrayBuffer, 'stl')
    expect(result.bambuMetadata).toBeUndefined()
  })

  it('LoadedFileModel stores bambuMetadata when added via addLoadedFile', () => {
    // Simulate what WorkspacePage does
    const raw = fs.readFileSync(FIXTURE)
    const buf = raw.buffer.slice(
      raw.byteOffset,
      raw.byteOffset + raw.byteLength,
    ) as ArrayBuffer

    // Clean up state first
    useModelStore.getState().reset()

    useModelStore.getState().addLoadedFile({
      id: 'test-bambu-file',
      fileName: 'vise.3mf',
      filePath: FIXTURE,
      buffer: buf,
      format: '3mf',
      sceneTree: [],
      glbPartInfos: [],
      modelCenteringOffset: null,
      sourceUnit: 'millimeter',
      fileGroup: 'mesh',
      loadingPhase: 'loading',
      bambuMetadata: parseBambu3mf(buf),
    })

    const state = useModelStore.getState()
    const file = state.loadedFiles.find(f => f.id === 'test-bambu-file')
    expect(file).toBeDefined()
    expect(file!.bambuMetadata).toBeDefined()
    expect(file!.bambuMetadata!.parts).toHaveLength(21)
    expect(file!.bambuMetadata!.plates.size).toBe(2)

    // Cleanup
    useModelStore.getState().reset()
  })
})

// ---------------------------------------------------------------------------
// ModelInfoPanel integration: bambu modelMeta flows through stores
// ---------------------------------------------------------------------------
describe('ModelInfoPanel integration', () => {
  it('active file with bambuMetadata exposes modelMeta via store selectors', () => {
    const raw = fs.readFileSync(FIXTURE)
    const buf = raw.buffer.slice(
      raw.byteOffset,
      raw.byteOffset + raw.byteLength,
    ) as ArrayBuffer
    const bambuMeta = parseBambu3mf(buf)

    useModelStore.getState().reset()

    const fileId = 'test-modelinfo-file'
    useModelStore.getState().addLoadedFile({
      id: fileId,
      fileName: 'vise.3mf',
      filePath: FIXTURE,
      buffer: buf,
      format: '3mf',
      sceneTree: [],
      glbPartInfos: [],
      modelCenteringOffset: null,
      sourceUnit: 'millimeter',
      fileGroup: 'mesh',
      loadingPhase: 'done',
      bambuMetadata: bambuMeta,
    })

    useModelStore.getState().setActiveFile(fileId)

    const state = useModelStore.getState()
    const activeFile = state.loadedFiles.find(f => f.id === state.activeFileId)
    expect(activeFile).toBeDefined()
    expect(activeFile!.bambuMetadata?.modelMeta).toBeDefined()
    expect(activeFile!.bambuMetadata!.modelMeta!.title).toBe(
      'Table Vise - fully printable with changable jaws',
    )
    expect(activeFile!.bambuMetadata!.modelMeta!.designer).toBe('3D anarchy')
    expect(activeFile!.bambuMetadata!.modelMeta!.license).toBe('BY-ND')
    expect(activeFile!.bambuMetadata!.modelMeta!.description).toBeTruthy()

    // Cleanup
    useModelStore.getState().reset()
  })
})

// ---------------------------------------------------------------------------
// ThreeMFLoader integration (parsing is slow — all checks in one test)
// ---------------------------------------------------------------------------
describe('ThreeMFLoader integration', () => {
  let group: THREE.Group

  beforeAll(() => {
    const raw = fs.readFileSync(FIXTURE)
    const buf = raw.buffer.slice(
      raw.byteOffset,
      raw.byteOffset + raw.byteLength,
    ) as ArrayBuffer

    group = new ThreeMFLoader().parse(buf)
  })

  it('parses to 19 Group children — one per build item', () => {
    expect(group.children.length).toBe(19)
    for (const child of group.children) {
      expect(child.type === 'Group' || child.type === 'Mesh').toBe(true)
    }
  })

  it('every child contains meshes with valid geometry; total flattened meshes = 21', () => {
    let meshCount = 0
    group.traverse((child: THREE.Object3D) => {
      if (child instanceof THREE.Mesh) {
        meshCount++
        const geo = child.geometry
        expect(geo.attributes.position).toBeDefined()
        expect(geo.index).toBeDefined()
        expect(geo.attributes.position.count).toBeGreaterThan(0)
        expect(geo.index.count).toBeGreaterThan(0)
      }
    })

    // Each flat BambuPartMeta should map to exactly one ThreeJS Mesh
    expect(meshCount).toBe(21)
  })

  it('parsed without errors', () => {
    expect(group.children.length).toBeGreaterThan(0)
  })
})
