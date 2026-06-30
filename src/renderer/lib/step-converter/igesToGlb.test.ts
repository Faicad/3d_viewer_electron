/**
 * @vitest-environment node
 *
 * Integration test: IGES → GLB conversion using the production pipeline.
 *
 * IGES follows the same CAD→GLB path as STEP: occt-import-js ReadIgesFile
 * converts IGES geometry natively. Tests that the GLB is structurally valid.
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

  const igesPath = join(PROJECT_ROOT, 'src', 'test', 'fixtures', 'hammer.iges')
  const igesBuf = readFileSync(igesPath)
  const igesData = new Uint8Array(
    igesBuf.buffer,
    igesBuf.byteOffset,
    igesBuf.byteLength,
  )

  const result = occtModule.ReadIgesFile(igesData, null)
  expect(result.success).toBe(true)

  const { buildGlbFromResult } = await import('./stepToGlb')
  glbBuffer = buildGlbFromResult(result, { includeSelectorTopology: true, entryKind: 'part' })

  const dv = new DataView(glbBuffer)
  const jsonLen = dv.getUint32(12, true)
  const jsonBytes = new Uint8Array(glbBuffer, 20, jsonLen)
  let end = jsonLen
  while (end > 0 && jsonBytes[end - 1] === 0x20) end--
  gltf = JSON.parse(new TextDecoder().decode(jsonBytes.slice(0, end)))
}, 120000)

function getBinOffset(): number {
  const dv = new DataView(glbBuffer)
  const jsonLen = dv.getUint32(12, true)
  let offset = 20 + jsonLen
  while (offset % 4 !== 0) offset++
  return offset + 8
}

function readBufferView(viewIndex: number): Uint8Array {
  const views = gltf.bufferViews as Array<{ byteOffset: number; byteLength: number }>
  const view = views[viewIndex]
  const binOffset = getBinOffset()
  return new Uint8Array(glbBuffer, binOffset + view.byteOffset, view.byteLength)
}

describe('IGES → GLB production pipeline', () => {
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

  it('includes STEP_T in extensionsUsed', () => {
    expect(gltf.extensionsUsed).toContain('STEP_T')
  })

  it('has STEP_T extension with required fields', () => {
    const ext = (gltf.extensions as Record<string, unknown>)?.STEP_T as Record<string, unknown> | undefined
    expect(ext).toBeDefined()
    expect(ext!.schemaVersion).toBe(2)
    expect(ext!.entryKind).toBe('part')
    expect(ext!.encoding).toBe('utf-8')
    expect(typeof ext!.selectorView).toBe('number')
  })

  it('has valid selector manifest with face data', () => {
    const ext = (gltf.extensions as Record<string, unknown>).STEP_T as Record<string, unknown>
    const selBytes = readBufferView(ext.selectorView as number)
    const sel = JSON.parse(new TextDecoder().decode(selBytes))

    expect(sel.schemaVersion).toBe(2)
    expect(sel.profile).toBe('selector')
    expect(sel.occurrences.length).toBeGreaterThan(0)
    expect(sel.faces.length).toBeGreaterThan(0)
    expect(sel.edges).toBeDefined()
  })

  it('has cadOccurrenceId on mesh nodes', () => {
    const nodes = gltf.nodes as Array<Record<string, unknown>>
    const meshNode = nodes.find(n => typeof n.mesh === 'number')
    expect(meshNode).toBeDefined()
    expect(meshNode!.extras).toBeDefined()
    expect((meshNode!.extras as Record<string, unknown>).cadOccurrenceId).toBeDefined()
  })
})
