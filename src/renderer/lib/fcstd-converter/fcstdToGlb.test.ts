/**
 * @vitest-environment node
 *
 * Integration test: FCStd → GLB conversion.
 *
 * The FCStd file is a ZIP archive containing Document.xml, GuiDocument.xml,
 * and BREP shape files. The parser extracts Part::* and PartDesign::* objects.
 * Each BREP is converted via occt-import-js ReadBrepFile and merged into GLB.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const PROJECT_ROOT = join(__dirname, '..', '..', '..', '..')

interface OcctModule {
  ReadStepFile(buffer: Uint8Array, params: Record<string, unknown>): OcctImportResult
  ReadIgesFile(buffer: Uint8Array, params: Record<string, unknown>): OcctImportResult
  ReadBrepFile(buffer: Uint8Array, params: Record<string, unknown>): OcctImportResult
}

interface OcctImportResult {
  success: boolean
  root: { name: string; meshes: number[]; children: unknown[] }
  meshes: Array<{
    name: string
    attributes: { position: { array: Float32Array }; normal?: { array: Float32Array } }
    index: { array: Uint32Array }
    color?: [number, number, number]
    brep_faces?: Array<{ first: number; last: number }>
  }>
}

let occtModule: OcctModule
let doc: import('./fcstdTypes').FreeCadDocument
let glbBuffer: ArrayBuffer
let gltf: Record<string, unknown>

beforeAll(async () => {
  const cjsPath = join(PROJECT_ROOT, 'src', 'renderer', 'public', 'wasm', 'occt-import-js.cjs')
  globalThis.occtimportjs = require(cjsPath) as (config: Record<string, unknown>) => Promise<OcctModule>

  const wasmPath = join(PROJECT_ROOT, 'src', 'renderer', 'public', 'wasm', 'occt-import-js.wasm')
  const wasmBuffer = readFileSync(wasmPath)
  const wasmBinary = wasmBuffer.buffer.slice(
    wasmBuffer.byteOffset,
    wasmBuffer.byteOffset + wasmBuffer.byteLength,
  ) as ArrayBuffer

  occtModule = await (globalThis.occtimportjs as unknown as (config: Record<string, unknown>) => Promise<OcctModule>)({
    wasmBinary,
    locateFile: (_path: string) => '',
  })

  const fcstdPath = join(PROJECT_ROOT, 'src', 'test', 'fixtures', 'ArchDetail.FCStd')
  const fcstdBuf = readFileSync(fcstdPath)
  const fcstdData = fcstdBuf.buffer.slice(
    fcstdBuf.byteOffset,
    fcstdBuf.byteOffset + fcstdBuf.byteLength,
  ) as ArrayBuffer

  const { parseFcstd } = await import('./fcstdParser')
  doc = parseFcstd(fcstdData)

  expect(doc.objects.length).toBeGreaterThan(0)

  const convertible = doc.objects.filter(
    obj => obj.brepContent !== null && obj.isVisible && obj.inLinkCount === 0,
  )
  expect(convertible.length).toBeGreaterThan(0)

  const allMeshes: Array<{
    name: string
    attributes: { position: { array: Float32Array }; normal?: { array: Float32Array } }
    index: { array: Uint32Array }
    color?: [number, number, number]
    brep_faces?: Array<{ first: number; last: number }>
  }> = []
  const rootChildren: Array<{ name: string; meshes: number[]; children: unknown[] }> = []

  for (let i = 0; i < convertible.length; i++) {
    const obj = convertible[i]
    const result = occtModule.ReadBrepFile(obj.brepContent!, null)
    expect(result.success).toBe(true)

    const meshIndices: number[] = []
    const color: [number, number, number] = obj.color
      ? [obj.color[0] / 255, obj.color[1] / 255, obj.color[2] / 255]
      : [0.7, 0.7, 0.7]

    for (const mesh of result.meshes) {
      meshIndices.push(allMeshes.length)
      allMeshes.push({ ...mesh, color: mesh.color ?? color })
    }

    rootChildren.push({ name: obj.label ?? obj.name, meshes: meshIndices, children: [] })
  }

  const mergedResult: OcctImportResult = {
    success: true,
    root: { name: 'FCStd', meshes: [], children: rootChildren },
    meshes: allMeshes,
  }

  const { buildGlbFromResult } = await import('@/lib/step-converter/stepToGlb')
  glbBuffer = buildGlbFromResult(mergedResult, { includeSelectorTopology: false })

  const dv = new DataView(glbBuffer)
  const jsonLen = dv.getUint32(12, true)
  const jsonBytes = new Uint8Array(glbBuffer, 20, jsonLen)
  let end = jsonLen
  while (end > 0 && jsonBytes[end - 1] === 0x20) end--
  gltf = JSON.parse(new TextDecoder().decode(jsonBytes.slice(0, end)))
}, 300000)

describe('parseFcstd — Document.xml parser', () => {
  it('parses Document.xml and finds objects', () => {
    expect(doc.objects.length).toBeGreaterThanOrEqual(1)
    expect(doc.files['Document.xml']).toBeDefined()
  })

  it('all objects have valid types', () => {
    for (const obj of doc.objects) {
      expect(obj.type).toMatch(/^(Part::|PartDesign::)/)
      expect(obj.type).not.toContain('Part2D')
    }
  })

  it('extracts BREP file references for convertible objects', () => {
    const withBrep = doc.objects.filter(obj => obj.brepContent !== null)
    expect(withBrep.length).toBeGreaterThanOrEqual(1)
    for (const obj of withBrep) {
      expect(obj.brepFileName).toMatch(/\.(brp|brep)$/)
      expect(obj.brepContent!.byteLength).toBeGreaterThan(0)
    }
  })
})

describe('FCStd → GLB production pipeline', () => {
  it('has valid GLB header', () => {
    const dv = new DataView(glbBuffer)
    expect(dv.getUint32(0, true)).toBe(0x46546C67)
    expect(dv.getUint32(4, true)).toBe(2)
    expect(dv.getUint32(8, true)).toBe(glbBuffer.byteLength)
  })

  it('has valid JSON chunk type', () => {
    const dv = new DataView(glbBuffer)
    expect(dv.getUint32(16, true)).toBe(0x4E4F534A)
  })

  it('has valid BIN chunk type', () => {
    const dv = new DataView(glbBuffer)
    const jsonLen = dv.getUint32(12, true)
    let binHeader = 20 + jsonLen
    while (binHeader % 4 !== 0) binHeader++
    expect(dv.getUint32(binHeader + 4, true)).toBe(0x004E4942)
  })

  it('has asset version 2.0', () => {
    expect((gltf.asset as Record<string, unknown>).version).toBe('2.0')
  })

  it('has nodes, meshes, accessors, and bufferViews', () => {
    expect((gltf.nodes as unknown[]).length).toBeGreaterThan(0)
    expect((gltf.meshes as unknown[]).length).toBeGreaterThan(0)
    expect((gltf.accessors as unknown[]).length).toBeGreaterThan(0)
    expect((gltf.bufferViews as unknown[]).length).toBeGreaterThan(0)
  })

  it('generates meshes with valid geometry', () => {
    const accessors = gltf.accessors as Array<Record<string, unknown>>
    const posAccessors = accessors.filter(a => a.type === 'VEC3')
    expect(posAccessors.length).toBeGreaterThan(0)
    const indicesAccessors = accessors.filter(a => a.type === 'SCALAR' && a.componentType === 5125)
    expect(indicesAccessors.length).toBeGreaterThan(0)
  })

  it('mesh nodes have extras metadata', () => {
    const nodes = gltf.nodes as Array<Record<string, unknown>>
    const meshNode = nodes.find(n => typeof n.mesh === 'number')
    expect(meshNode).toBeDefined()
    expect(meshNode!.extras).toBeDefined()
    expect((meshNode!.extras as Record<string, unknown>).cadOccurrenceId).toBeDefined()
    expect((meshNode!.extras as Record<string, unknown>).cadName).toBeDefined()
  })
})
