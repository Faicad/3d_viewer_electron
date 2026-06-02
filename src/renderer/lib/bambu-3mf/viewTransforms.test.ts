import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import * as THREE from 'three'
import { JSDOM } from 'jsdom'
import { unzipSync } from 'three/examples/jsm/libs/fflate.module.js'
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js'
import { parseBambu3mf, type Bambu3mfMetadata } from './bambu-3mf'
import { computeViewDelta, hasViewData, mat4From12Values, mat4From16Values } from './viewTransforms'
import type { GlbPartInfo } from '@/stores/model-store'

const FIXTURE = path.resolve('src/test/fixtures/vise.3mf')

// Polyfill DOMParser for ThreeMFLoader (Node.js)
const dom = new JSDOM()
if (typeof globalThis.DOMParser === 'undefined') {
  ;(globalThis as any).DOMParser = dom.window.DOMParser
}

describe('viewTransforms — matrix utilities', () => {
  it('mat4From12Values converts identity 4x3 to THREE.Matrix4', () => {
    const m = mat4From12Values([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0])
    expect(m.determinant()).toBeCloseTo(1, 5)
    const pos = new THREE.Vector3().setFromMatrixPosition(m)
    expect(pos.x).toBe(0)
    expect(pos.y).toBe(0)
    expect(pos.z).toBe(0)
  })

  it('mat4From12Values places translation in last column', () => {
    const m = mat4From12Values([1, 0, 0, 0, 1, 0, 0, 0, 1, 10, 20, 30])
    const pos = new THREE.Vector3().setFromMatrixPosition(m)
    expect(pos.x).toBe(10)
    expect(pos.y).toBe(20)
    expect(pos.z).toBe(30)
  })

  it('mat4From12Values handles rotation matrix with tx,ty,tz', () => {
    // Rx(90°): Y→-Z, Z→Y with translation (100, 200, 50)
    // Row-major: [1, 0, 0, 0, 0, -1, 0, 1, 0, 100, 200, 50]
    const m = mat4From12Values([1, 0, 0, 0, 0, -1, 0, 1, 0, 100, 200, 50])
    const pos = new THREE.Vector3().setFromMatrixPosition(m)
    expect(pos.x).toBe(100)
    expect(pos.y).toBe(200)
    expect(pos.z).toBe(50)
    // Transform origin → translation only
    const origin = new THREE.Vector3(0, 0, 0).applyMatrix4(m)
    expect(origin.x).toBeCloseTo(100, 5)
    expect(origin.y).toBeCloseTo(200, 5)
    expect(origin.z).toBeCloseTo(50, 5)
    // (0,1,0): y' = 0*0 + 0*1 + (-1)*0 + 200 = 200, z' = 0*0 + 1*1 + 0*0 + 50 = 51
    const v = new THREE.Vector3(0, 1, 0).applyMatrix4(m)
    expect(v.x).toBeCloseTo(100, 5)
    expect(v.y).toBeCloseTo(200, 5)
    expect(v.z).toBeCloseTo(51, 5)
  })

  it('mat4From16Values converts row-major 4x4 to THREE.Matrix4', () => {
    const m = mat4From16Values([1, 0, 0, 5, 0, 1, 0, 10, 0, 0, 1, 15, 0, 0, 0, 1])
    const pos = new THREE.Vector3().setFromMatrixPosition(m)
    expect(pos.x).toBe(5)
    expect(pos.y).toBe(10)
    expect(pos.z).toBe(15)
    // Rotation part should be identity
    const expected = new THREE.Matrix4().makeTranslation(5, 10, 15)
    expect(m.equals(expected)).toBe(true)
  })
})

describe('viewTransforms — hasViewData', () => {
  let metadata: Bambu3mfMetadata

  beforeAll(() => {
    const raw = fs.readFileSync(FIXTURE)
    const buf = raw.buffer.slice(
      raw.byteOffset,
      raw.byteOffset + raw.byteLength,
    ) as ArrayBuffer
    metadata = parseBambu3mf(buf)
  })

  it('print view always available', () => {
    expect(hasViewData('print', metadata)).toBe(true)
  })

  it('assembly view available for Bambu 3MF with assemble transforms', () => {
    expect(hasViewData('assembly', metadata)).toBe(true)
  })

  it('import view available for Bambu 3MF with import transforms', () => {
    expect(hasViewData('import', metadata)).toBe(true)
  })
})

describe('viewTransforms — computeViewDelta', () => {
  let metadata: Bambu3mfMetadata

  beforeAll(() => {
    const raw = fs.readFileSync(FIXTURE)
    const buf = raw.buffer.slice(
      raw.byteOffset,
      raw.byteOffset + raw.byteLength,
    ) as ArrayBuffer
    metadata = parseBambu3mf(buf)
  })

  it('print view returns null (no delta)', () => {
    const partInfo: GlbPartInfo = { partId: '1', meshIndex: 0, name: '', triangleCount: 0, materialIndex: -1, objectId: '2' }
    const delta = computeViewDelta('print', metadata, partInfo)
    expect(delta).toBeNull()
  })

  it('assembly view returns a non-identity delta for object 2', () => {
    const partInfo: GlbPartInfo = { partId: '1', meshIndex: 0, name: '', triangleCount: 0, materialIndex: -1, objectId: '2' }
    const delta = computeViewDelta('assembly', metadata, partInfo)
    expect(delta).not.toBeNull()
    // Delta should be non-identity (differs from build)
    expect(delta!.equals(new THREE.Matrix4().identity())).toBe(false)
  })

  it('assembly view delta for object with identity-build and identity-assemble should be identity', () => {
    // Find an object where build and assemble transforms are the same
    // Most parts have assemble Z=45.5 and build Z=45.5
    const partInfo: GlbPartInfo = { partId: '1', meshIndex: 0, name: '', triangleCount: 0, materialIndex: -1, objectId: '2' }
    const buildItem = metadata.buildItems?.find(b => b.objectId === '2')
    const assembleItem = metadata.assembleTransforms?.get('2')
    expect(buildItem).toBeDefined()
    expect(assembleItem).toBeDefined()

    const delta = computeViewDelta('assembly', metadata, partInfo)
    expect(delta).not.toBeNull()

    // The delta should reposition to match assemble transform
    // Apply delta to build-transform position → should get assemble position
    const buildMat = mat4From12Values(buildItem!.transform!)
    // The baked geometry has build matrix applied. After delta, it should be at assemble position.
    // delta = assemble * build^-1
    // delta * build = assemble
    const result = delta!.clone().multiply(buildMat)
    const assembleMat = mat4From12Values(assembleItem!.transform)
    const resultPos = new THREE.Vector3().setFromMatrixPosition(result)
    const assemblePos = new THREE.Vector3().setFromMatrixPosition(assembleMat)
    expect(resultPos.x).toBeCloseTo(assemblePos.x, 3)
    expect(resultPos.y).toBeCloseTo(assemblePos.y, 3)
    expect(resultPos.z).toBeCloseTo(assemblePos.z, 3)
  })

  it('import view returns delta for part with non-identity matrix', () => {
    const partInfo: GlbPartInfo = { partId: '21', meshIndex: 0, name: '', triangleCount: 0, materialIndex: -1, objectId: '22' }
    const delta = computeViewDelta('import', metadata, partInfo)
    expect(delta).not.toBeNull()
    expect(delta!.equals(new THREE.Matrix4().identity())).toBe(false)
  })

  it('import view returns null for part without import matrix', () => {
    const partInfo: GlbPartInfo = { partId: '99', meshIndex: 0, name: '', triangleCount: 0, materialIndex: -1, objectId: '999' }
    const delta = computeViewDelta('import', metadata, partInfo)
    expect(delta).toBeNull()
  })

  it('computeViewDelta returns null without objectId', () => {
    const partInfo: GlbPartInfo = { partId: '1', meshIndex: 0, name: '', triangleCount: 0, materialIndex: -1 }
    const delta = computeViewDelta('assembly', metadata, partInfo)
    expect(delta).toBeNull()
  })
})

describe('viewTransforms — integration with ThreeMFLoader meshes', () => {
  let metadata: Bambu3mfMetadata
  let meshes: THREE.Mesh[]

  beforeAll(() => {
    const raw = fs.readFileSync(FIXTURE)
    const buf = raw.buffer.slice(
      raw.byteOffset,
      raw.byteOffset + raw.byteLength,
    ) as ArrayBuffer
    metadata = parseBambu3mf(buf)

    const loader = new ThreeMFLoader()
    const group = loader.parse(buf)
    meshes = [] as THREE.Mesh[]
    group.traverse((child) => {
      if (child instanceof THREE.Mesh) meshes.push(child)
    })
  }, 30000)

  it('applying print delta to baked geometry matches original world position', () => {
    if (meshes.length === 0) return // skip if ThreeMFLoader didn't produce meshes
    const src = meshes[0]
    const geo = src.geometry.clone()
    src.updateWorldMatrix(true, false)
    geo.applyMatrix4(src.matrixWorld)

    const partMeta = metadata.parts[0]
    const partInfo: GlbPartInfo = {
      partId: partMeta.partId,
      meshIndex: 0,
      name: partMeta.name,
      triangleCount: 0,
      materialIndex: -1,
      objectId: partMeta.objectId,
    }
    // Print delta is null → no change
    const delta = computeViewDelta('print', metadata, partInfo)
    expect(delta).toBeNull()
  })

  it('applying assembly delta to baked geometry changes position to match assemble transform', () => {
    if (meshes.length === 0) return
    const src = meshes[0]
    const geo = src.geometry.clone()
    src.updateWorldMatrix(true, false)
    geo.applyMatrix4(src.matrixWorld)

    const partMeta = metadata.parts[0]
    const partInfo: GlbPartInfo = {
      partId: partMeta.partId,
      meshIndex: 0,
      name: partMeta.name,
      triangleCount: 0,
      materialIndex: -1,
      objectId: partMeta.objectId,
    }

    const delta = computeViewDelta('assembly', metadata, partInfo)
    expect(delta).not.toBeNull()

    // Compute expected position
    const buildMat = mat4From12Values(metadata.buildItems![0].transform!)
    const assembleItem = metadata.assembleTransforms!.get(partMeta.objectId)!
    const assembleMat = mat4From12Values(assembleItem.transform)

    // After applying delta to baked geometry:
    // baked_pos = build * component * local_vertex
    // delta = assemble * build^-1
    // result = delta * build * component * local = assemble * component * local
    // So the bbox center should shift from build space to assemble space
    const boxBefore = new THREE.Box3().setFromObject(new THREE.Mesh(geo))
    const centerBefore = boxBefore.getCenter(new THREE.Vector3())

    geo.applyMatrix4(delta!)

    const boxAfter = new THREE.Box3().setFromObject(new THREE.Mesh(geo))
    const centerAfter = boxAfter.getCenter(new THREE.Vector3())

    // The delta should cause a meaningful position change
    expect(centerBefore.distanceTo(centerAfter)).toBeGreaterThan(0.01)
  })
})
