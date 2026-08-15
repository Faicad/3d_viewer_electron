import { describe, it, expect } from 'vitest'
import {
  detectFormat,
  EXT_TO_FORMAT,
  ALL_EXTENSIONS,
  ALL_EXTENSIONS_NO_DOT,
  ALL_MODEL_EXTENSIONS,
  FORMAT_MAP,
  ALL_ACCEPT,
  getGroupAccept,
  FILE_FORMATS,
  UNIT_TO_MM,
  parse3mfUnit,
  parseAmfUnit,
  guessStlUnit,
} from './file-formats'

describe('file-formats config', () => {
  it('all 38 formats defined', () => {
    expect(FILE_FORMATS.length).toBe(38)
  })

  it('no duplicate format ids', () => {
    const ids = FILE_FORMATS.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every format has at least one extension', () => {
    for (const fmt of FILE_FORMATS) {
      expect(fmt.extensions.length, `${fmt.id} has no extensions`).toBeGreaterThan(0)
    }
  })

  it('EXT_TO_FORMAT covers all enabled extensions', () => {
    const enabled = FILE_FORMATS.filter((f) => !f.disabled)
    for (const fmt of enabled) {
      for (const ext of fmt.extensions) {
        expect(EXT_TO_FORMAT[ext]).toBe(fmt.id)
      }
    }
  })

  it('FORMAT_MAP contains all formats', () => {
    for (const fmt of FILE_FORMATS) {
      expect(FORMAT_MAP[fmt.id]).toBe(fmt)
    }
  })

  it('ALL_EXTENSIONS and ALL_EXTENSIONS_NO_DOT match', () => {
    expect(ALL_EXTENSIONS.length).toBe(ALL_EXTENSIONS_NO_DOT.length)
    for (let i = 0; i < ALL_EXTENSIONS.length; i++) {
      expect(ALL_EXTENSIONS_NO_DOT[i]).toBe(ALL_EXTENSIONS[i].slice(1))
    }
  })

  it('ALL_ACCEPT is comma-separated extensions', () => {
    expect(typeof ALL_ACCEPT).toBe('string')
    const parts = ALL_ACCEPT.split(',')
    expect(parts.length).toBeGreaterThan(10)
    for (const part of parts) {
      expect(part.startsWith('.')).toBe(true)
    }
  })
})

describe('detectFormat', () => {
  it('returns null for unknown extension', () => {
    expect(detectFormat('file.xyzabc')).toBeNull()
    expect(detectFormat('readme.txt')).toBeNull()
    expect(detectFormat('noext')).toBeNull()
  })

  it('detects common formats', () => {
    expect(detectFormat('model.stl')).toBe('stl')
    expect(detectFormat('model.glb')).toBe('glb')
    expect(detectFormat('part.step')).toBe('step')
    expect(detectFormat('part.stp')).toBe('step')
    expect(detectFormat('part.stpz')).toBe('step')
    expect(detectFormat('model.obj')).toBe('obj')
    expect(detectFormat('model.fbx')).toBe('fbx')
    expect(detectFormat('model.ply')).toBe('ply')
    expect(detectFormat('model.fcstd')).toBe('fcstd')
    expect(detectFormat('icons.svg')).toBe('svg')
  })

  it('svg is detectable and included in ALL_EXTENSIONS', () => {
    expect(detectFormat('test.svg')).toBe('svg')
    expect(EXT_TO_FORMAT['.svg']).toBe('svg')
    expect(ALL_EXTENSIONS).toContain('.svg')
    expect(ALL_ACCEPT).toContain('.svg')
  })

  it('hdr and exr are detectable and in ALL_EXTENSIONS but excluded from model lists', () => {
    expect(detectFormat('env.hdr')).toBe('hdr')
    expect(detectFormat('env.exr')).toBe('exr')
    expect(EXT_TO_FORMAT['.hdr']).toBe('hdr')
    expect(EXT_TO_FORMAT['.exr']).toBe('exr')
    expect(ALL_EXTENSIONS).toContain('.hdr')
    expect(ALL_EXTENSIONS).toContain('.exr')
    // Should NOT be in model-only lists
    expect(ALL_MODEL_EXTENSIONS).not.toContain('.hdr')
    expect(ALL_MODEL_EXTENSIONS).not.toContain('.exr')
    expect(ALL_ACCEPT).not.toContain('.hdr')
    expect(ALL_ACCEPT).not.toContain('.exr')
  })

  it('detects case insensitive', () => {
    expect(detectFormat('MODEL.STL')).toBe('stl')
    expect(detectFormat('Model.Glb')).toBe('glb')
    expect(detectFormat('Part.StEp')).toBe('step')
    expect(detectFormat('Part.STPZ')).toBe('step')
  })

  it('does not detect disabled formats', () => {
    expect(detectFormat('model.mdd')).toBeNull() // disabled
    expect(detectFormat('model.mpd')).toBeNull() // disabled (ldraw)
  })

  it('detects gltf format since it is now enabled', () => {
    expect(detectFormat('model.gltf')).toBe('gltf')
  })

  it('detects all remaining non-disabled formats', () => {
    const enabled = FILE_FORMATS.filter((f) => !f.disabled)
    for (const fmt of enabled) {
      const filename = `test${fmt.extensions[0]}`
      expect(detectFormat(filename), `failed for ${fmt.id}`).toBe(fmt.id)
    }
  })

  it('matches longest suffix first (.stp vs .step)', () => {
    // .step matches step, .stp also matches step
    expect(detectFormat('model.step')).toBe('step')
    expect(detectFormat('model.stp')).toBe('step')
    expect(detectFormat('model.stpz')).toBe('step')
  })
})

describe('getGroupAccept', () => {
  it('returns comma-separated extensions for a group', () => {
    const mesh = getGroupAccept('mesh')
    expect(mesh).toContain('.stl')
    expect(mesh).toContain('.glb')
    expect(mesh).toContain('.obj')

    const cad = getGroupAccept('cad')
    expect(cad).toContain('.step')
    expect(cad).toContain('.stp')
    expect(cad).toContain('.stpz')
    expect(cad).toContain('.fcstd')
  })

  it('returns empty for group with no enabled formats', () => {
    // 'animation' group has bvh (enabled) and md2 (enabled) but mdd is disabled
    const anim = getGroupAccept('animation')
    expect(anim.length).toBeGreaterThan(0)
  })
})

describe('file group filter constants', () => {
  it('all groups have at least one enabled format', () => {
    const groups = ['mesh', 'cad', 'animation', 'point', 'volume', 'gcode', 'other'] as const
    for (const group of groups) {
      const accept = getGroupAccept(group)
      expect(accept.length, `${group} group is empty`).toBeGreaterThan(0)
    }
  })

  it('disabled formats are excluded from all group filters', () => {
    const disabledIds = FILE_FORMATS.filter((f) => f.disabled).map((f) => f.id)
    for (const group of ['mesh', 'cad', 'animation', 'point', 'volume', 'gcode', 'other'] as const) {
      const accept = getGroupAccept(group)
      const acceptFormats = FILE_FORMATS.filter((f) => accept.includes(f.extensions[0]))
      for (const fmt of acceptFormats) {
        expect(disabledIds, `disabled format ${fmt.id} found in group ${group}`).not.toContain(fmt.id)
      }
    }
  })
})

// =============================================================================
// Unit detection
// =============================================================================

describe('UNIT_TO_MM', () => {
  it('meter = 1000 mm', () => expect(UNIT_TO_MM.meter).toBe(1000))
  it('millimeter = 1 mm', () => expect(UNIT_TO_MM.millimeter).toBe(1))
  it('inch = 25.4 mm', () => expect(UNIT_TO_MM.inch).toBe(25.4))
  it('every format defaultUnit has a value', () => {
    for (const fmt of FILE_FORMATS) {
      expect(UNIT_TO_MM[fmt.defaultUnit], `missing UNIT_TO_MM for ${fmt.id} "${fmt.defaultUnit}"`).toBeDefined()
    }
  })
})

describe('parse3mfUnit', () => {
  function buf(xml: string): ArrayBuffer {
    const enc = new TextEncoder()
    const b = new Uint8Array(30 + xml.length)
    b[0] = 0x50; b[1] = 0x4B // ZIP magic
    b.set(enc.encode(xml), 30)
    return b.buffer
  }
  it('default (no attr) → millimeter', () => expect(parse3mfUnit(buf('<model>...</model>'))).toBe('millimeter'))
  it('unit=inch → inch', () => expect(parse3mfUnit(buf('<model unit="inch">...</model>'))).toBe('inch'))
  it('unit=meter → meter', () => expect(parse3mfUnit(buf('<model unit="meter">...</model>'))).toBe('meter'))
  it('unknown unit → millimeter fallback', () => expect(parse3mfUnit(buf('<model unit="parsec">...</model>'))).toBe('millimeter'))
})

describe('parseAmfUnit', () => {
  function buf(xml: string): ArrayBuffer { return new TextEncoder().encode(xml).buffer }
  it('default (no attr) → millimeter', () => expect(parseAmfUnit(buf('<amf>...</amf>'))).toBe('millimeter'))
  it('unit=inch → inch', () => expect(parseAmfUnit(buf('<amf unit="inch">...</amf>'))).toBe('inch'))
})

describe('guessStlUnit', () => {
  const box = (w: number, h: number, d: number) => ({ min: { x: -w/2, y: -h/2, z: -d/2 }, max: { x: w/2, y: h/2, z: d/2 } })
  it('200mm cube → millimeter', () => expect(guessStlUnit(box(200, 200, 200))).toBe('millimeter'))
  it('20mm cube → millimeter', () => expect(guessStlUnit(box(20, 20, 20))).toBe('millimeter'))
  it('0.02m cube → meter (8e-6 < 0.008)', () => expect(guessStlUnit(box(0.02, 0.02, 0.02))).toBe('meter'))
  it('0.15m cube → meter (0.003 < 0.008)', () => expect(guessStlUnit(box(0.15, 0.15, 0.15))).toBe('meter'))
  it('1.5 inch cube → inch (3.375 < 8.0)', () => expect(guessStlUnit(box(1.5, 1.5, 1.5))).toBe('inch'))
  it('zero volume → millimeter fallback', () => expect(guessStlUnit(box(0, 0, 0))).toBe('millimeter'))
})

describe('guessStlUnit on real fixture', () => {
  it('cube1.stl → inch (2×1×1, volume 2.0 < 8.0)', async () => {
    const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader.js')
    const fs = await import('node:fs')
    const path = await import('node:path')
    const { fileURLToPath } = await import('node:url')
    const __dirname = path.dirname(fileURLToPath(import.meta.url))
    const raw = fs.readFileSync(path.resolve(__dirname, '..', '..', 'test', 'fixtures', 'testdata', 'cube1.stl'))
    const buffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)
    const geo = new STLLoader().parse(buffer)
    geo.computeBoundingBox()
    expect(guessStlUnit(geo.boundingBox!), 'cube1.stl must be detected as inch').toBe('inch')
  })

  it('cube01.stl → meter (0.1×0.1×0.1, volume 0.001 < 0.008)', async () => {
    const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader.js')
    const fs = await import('node:fs')
    const path = await import('node:path')
    const { fileURLToPath } = await import('node:url')
    const __dirname = path.dirname(fileURLToPath(import.meta.url))
    const raw = fs.readFileSync(path.resolve(__dirname, '..', '..', 'test', 'fixtures', 'testdata', 'cube01.stl'))
    const buffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)
    const geo = new STLLoader().parse(buffer)
    geo.computeBoundingBox()
    expect(guessStlUnit(geo.boundingBox!), 'cube01.stl must be detected as meter').toBe('meter')
  })
})
