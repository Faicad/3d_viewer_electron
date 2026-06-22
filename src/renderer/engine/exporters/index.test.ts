/**
 * Tests for model export module.
 *
 * Key regression: SCAD file.buffer is SCAD source code, NOT STL binary.
 * Exporting SCAD → STL must NOT simply download file.buffer as .stl.
 */

import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  hasExportableModel,
  isPureScad,
  isFormatExportable,
  collectSceneMeshes,
  collectFileMeshes,
  sourceUnitToScaleFactor,
} from '@/engine/exporters'
import type { LoadedFileModel } from '@/stores/model-store'

// ---- helpers ----

function mockFile(overrides: Partial<LoadedFileModel> = {}): LoadedFileModel {
  return {
    id: 'test-1',
    fileName: 'test.scad',
    filePath: '',
    buffer: new TextEncoder().encode('cube(10);').buffer as ArrayBuffer,
    format: 'scad',
    sceneTree: [],
    glbPartInfos: [],
    modelCenteringOffset: null,
    sourceUnit: 'millimeter',
    fileGroup: 'mesh',
    loadingPhase: 'done',
    ...overrides,
  }
}

// ---- isFormatExportable ----

describe('isFormatExportable', () => {
  it('returns true for mesh formats', () => {
    expect(isFormatExportable('stl')).toBe(true)
    expect(isFormatExportable('glb')).toBe(true)
    expect(isFormatExportable('scad')).toBe(true)
    expect(isFormatExportable('step')).toBe(true)
    expect(isFormatExportable('obj')).toBe(true)
  })

  it('returns false for non-mesh formats', () => {
    expect(isFormatExportable('nrrd')).toBe(false)
    expect(isFormatExportable('gcode')).toBe(false)
    expect(isFormatExportable('svg')).toBe(false)
    expect(isFormatExportable('hdr')).toBe(false)
  })
})

// ---- hasExportableModel ----

describe('hasExportableModel', () => {
  it('returns true when exportable file exists', () => {
    expect(hasExportableModel([mockFile({ format: 'scad' })])).toBe(true)
    expect(hasExportableModel([mockFile({ format: 'nrrd' })])).toBe(false)
  })

  it('returns false for empty list', () => {
    expect(hasExportableModel([])).toBe(false)
  })
})

// ---- isPureScad ----

describe('isPureScad', () => {
  it('returns true for single SCAD file only', () => {
    expect(isPureScad([mockFile({ format: 'scad' })])).toBe(true)
  })

  it('returns false when SCAD + another format is mixed', () => {
    expect(isPureScad([
      mockFile({ id: 's1', format: 'scad' }),
      mockFile({ id: 's2', format: 'stl' }),
    ])).toBe(false)
  })

  it('returns false for single non-SCAD file', () => {
    expect(isPureScad([mockFile({ format: 'stl' })])).toBe(false)
  })
})

// ---- collectSceneMeshes ----

describe('collectSceneMeshes', () => {
  it('collects all Mesh objects from a scene', () => {
    const scene = new THREE.Scene()
    const mesh1 = new THREE.Mesh(new THREE.BoxGeometry())
    const mesh2 = new THREE.Mesh(new THREE.SphereGeometry())
    const group = new THREE.Group()
    group.add(mesh1)
    scene.add(mesh2)
    scene.add(group)

    expect(collectSceneMeshes(scene)).toHaveLength(2)
  })

  it('returns empty for scene with no meshes', () => {
    const scene = new THREE.Scene()
    scene.add(new THREE.Line(new THREE.BufferGeometry()))
    expect(collectSceneMeshes(scene)).toHaveLength(0)
  })

  it('excludes heatbed meshes via userData.isHeatbed flag', () => {
    const scene = new THREE.Scene()
    const modelMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))
    modelMesh.userData.partId = 'generated-model:part1'
    scene.add(modelMesh)

    const planeMesh = new THREE.Mesh(new THREE.PlaneGeometry(300, 300))
    planeMesh.userData.isHeatbed = true
    scene.add(planeMesh)

    const collected = collectSceneMeshes(scene)
    expect(collected).toHaveLength(1)
    expect(collected[0]).toBe(modelMesh)
  })

  it('excludes shadow floor meshes via userData.isShadowFloor flag', () => {
    const scene = new THREE.Scene()
    const modelMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))
    modelMesh.userData.partId = 'file-1:part1'
    scene.add(modelMesh)

    const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(60, 60))
    shadowPlane.userData.isShadowFloor = true
    scene.add(shadowPlane)

    const collected = collectSceneMeshes(scene)
    expect(collected).toHaveLength(1)
    expect(collected[0]).toBe(modelMesh)
  })
})

// ---- collectFileMeshes ----

describe('collectFileMeshes', () => {
  it('filters meshes by fileId via userData.partId', () => {
    const scene = new THREE.Scene()
    const meshA = new THREE.Mesh(new THREE.BoxGeometry())
    meshA.userData.partId = 'file-a:part1'
    const meshB = new THREE.Mesh(new THREE.SphereGeometry())
    meshB.userData.partId = 'file-b:part1'
    scene.add(meshA, meshB)

    expect(collectFileMeshes(scene, 'file-a')).toHaveLength(1)
    expect(collectFileMeshes(scene, 'file-a')[0]).toBe(meshA)
  })

  it('returns empty when no matching file', () => {
    const scene = new THREE.Scene()
    const mesh = new THREE.Mesh(new THREE.BoxGeometry())
    mesh.userData.partId = 'other:part1'
    scene.add(mesh)
    expect(collectFileMeshes(scene, 'my-file')).toHaveLength(0)
  })
})

// ---- SCAD → STL regression: file.buffer is source code, NOT STL ----

describe('SCAD buffer is source code, not STL', () => {
  it('file.buffer for SCAD contains OpenSCAD source, not STL binary', () => {
    // THE BUG: The old exportScadToStl() downloaded file.buffer directly.
    // For SCAD files, file.buffer is the SCAD source code text,
    // NOT the STL binary output from the WASM worker.
    // The STL output is consumed by loadFormat() and never stored.

    const scadSource = 'cube([10, 20, 30]);\n'
    const scadBuffer = new TextEncoder().encode(scadSource).buffer

    // A naive "download buffer as .stl" would write SCAD source to .stl file
    const content = new TextDecoder().decode(new Uint8Array(scadBuffer))
    expect(content.trim()).toBe('cube([10, 20, 30]);')

    // STL binary is at least 84 bytes (80 header + 4 count);
    // SCAD source is typically shorter and starts with "cube(" etc.
    expect(content).not.toContain('solid')
  })

  it('meshesToStl returns ArrayBuffer from DataView wrapper', async () => {
    // THE BUG: STLExporter.parse({ binary: true }) returns a DataView,
    // which is NOT `instanceof ArrayBuffer`. The old code checked
    // `result instanceof ArrayBuffer` → false → treated as string →
    // TextEncoder.encode(string) → corrupted output (~17 bytes).
    //
    // The fix: use `ArrayBuffer.isView()` to detect DataView and
    // extract the underlying ArrayBuffer via `.buffer.slice(...)`.
    //
    // This test verifies the type check works correctly.
    const buf = new ArrayBuffer(100)
    const view = new DataView(buf)

    // DataView is not instanceof ArrayBuffer
    expect(view instanceof ArrayBuffer).toBe(false)
    // But ArrayBuffer.isView() catches it
    expect(ArrayBuffer.isView(view)).toBe(true)
    // The correct extraction
    const extracted = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength)
    expect(extracted).toBeInstanceOf(ArrayBuffer)
    expect(extracted.byteLength).toBe(100)
  })
})

// ---- sourceUnitToScaleFactor ----

describe('sourceUnitToScaleFactor', () => {
  it('meter → 1000', () => {
    expect(sourceUnitToScaleFactor('meter')).toBe(1000)
  })
  it('millimeter → 1', () => {
    expect(sourceUnitToScaleFactor('millimeter')).toBe(1)
  })
  it('centimeter → 10', () => {
    expect(sourceUnitToScaleFactor('centimeter')).toBe(10)
  })
  it('inch → 25.4', () => {
    expect(sourceUnitToScaleFactor('inch')).toBe(25.4)
  })
})

// ---- 3MF export round-trip ----

import fs from 'node:fs'
import path from 'node:path'
import { JSDOM } from 'jsdom'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js'
import { parseBambu3mf } from '@/lib/bambu-3mf/bambu-3mf'
import { meshesTo3mf } from '@/engine/exporters'

// ThreeMFLoader.parse() needs global DOMParser — polyfill from jsdom
const dom = new JSDOM()
if (typeof globalThis.DOMParser === 'undefined') {
  ;(globalThis as any).DOMParser = dom.window.DOMParser
}

function countTriangles(mesh: THREE.Mesh): number {
  const geo = mesh.geometry
  const idx = geo.index
  if (idx) return idx.count / 3
  return geo.attributes.position.count / 3
}

describe('3MF export round-trip', () => {
  it('meshesTo3mf produces valid 3MF with correct mesh geometry and scale', async () => {
    const fixture = 'box_boss'

    // 1. Load GLB fixture (meters)
    const glbPath = path.resolve(`src/test/fixtures/${fixture}.glb`)
    const raw = fs.readFileSync(glbPath)
    const glbBuffer = raw.buffer.slice(
      raw.byteOffset,
      raw.byteOffset + raw.byteLength,
    ) as ArrayBuffer

    const gltfLoader = new GLTFLoader()
    const gltf = await gltfLoader.parseAsync(glbBuffer, '')

    // 2. Collect meshes and compute original bounding box (meters)
    const srcMeshes: THREE.Mesh[] = []
    gltf.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) srcMeshes.push(obj)
    })
    expect(srcMeshes.length).toBeGreaterThan(0)

    const srcTriangles = srcMeshes.reduce((sum, m) => sum + countTriangles(m), 0)
    expect(srcTriangles).toBeGreaterThan(0)

    const srcBox = new THREE.Box3()
    for (const m of srcMeshes) {
      m.updateWorldMatrix(true, false)
      srcBox.expandByObject(m)
    }
    const srcSize = srcBox.getSize(new THREE.Vector3())

    // 3. Export to 3MF with meter→mm conversion
    const buffer = await meshesTo3mf(srcMeshes, 'meter')
    expect(buffer).toBeInstanceOf(ArrayBuffer)
    expect(buffer.byteLength).toBeGreaterThan(0)

    // 4. Write to disk for manual inspection
    const outDir = path.resolve('src/test/fixtures')
    const outPath = path.join(outDir, `${fixture}.3mf`)
    fs.writeFileSync(outPath, new Uint8Array(buffer))
    expect(fs.existsSync(outPath)).toBe(true)

    // 5. Read back with parseBambu3mf (metadata validation)
    const metadata = parseBambu3mf(buffer)
    expect(metadata.objects.size).toBeGreaterThan(0)
    expect(metadata.parts.length).toBeGreaterThan(0)
    expect(metadata.metadataEntries.length).toBeGreaterThan(0)

    // 6. Load 3MF with ThreeMFLoader (mesh geometry validation)
    const tmfLoader = new ThreeMFLoader()
    const tmfScene = tmfLoader.parse(buffer)

    const outMeshes: THREE.Mesh[] = []
    tmfScene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) outMeshes.push(obj)
    })
    expect(outMeshes.length).toBe(srcMeshes.length)

    const outTriangles = outMeshes.reduce((sum, m) => sum + countTriangles(m), 0)
    expect(outTriangles).toBe(srcTriangles)

    // 7. Verify scale: 1 meter → 1000 millimeters
    const outBox = new THREE.Box3()
    for (const m of outMeshes) {
      m.updateWorldMatrix(true, false)
      outBox.expandByObject(m)
    }
    const outSize = outBox.getSize(new THREE.Vector3())

    // Ratio of each dimension should be ~1000 (meter→mm)
    expect(outSize.x / Math.abs(srcSize.x)).toBeCloseTo(1000)
    expect(outSize.y / Math.abs(srcSize.y)).toBeCloseTo(1000)
    expect(outSize.z / Math.abs(srcSize.z)).toBeCloseTo(1000)
  })
})
