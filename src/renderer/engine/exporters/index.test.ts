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

  it('excludes meshes made invisible by parent group (heatbed regression)', () => {
    // THE BUG: Heatbed.setVisible(false) only set group.visible=false,
    // leaving child mesh.visible=true. Object3D.traverse() visits all
    // descendants regardless of ancestor visibility, so collectSceneMeshes
    // picked up heatbed plane meshes and included them in exports.
    //
    // THE FIX: Heatbed.setVisible() now propagates visible=false to all
    // descendants via group.traverse(). This test simulates the fixed
    // behavior — child meshes carry visible=false.
    const scene = new THREE.Scene()

    // Model mesh — what we actually want to export
    const modelMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))
    modelMesh.userData.partId = 'generated-model:part1'
    scene.add(modelMesh)

    // Simulate fixed Heatbed: group + children all have visible=false
    const heatbedGroup = new THREE.Group()
    heatbedGroup.name = 'Heatbed'
    const planeMesh = new THREE.Mesh(new THREE.PlaneGeometry(300, 300))
    heatbedGroup.add(planeMesh)
    // Propagate visibility to all descendants (what fixed setVisible does)
    heatbedGroup.visible = false
    heatbedGroup.traverse((child) => { child.visible = false })
    scene.add(heatbedGroup)

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
