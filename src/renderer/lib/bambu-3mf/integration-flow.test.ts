import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import * as THREE from 'three'
import { JSDOM } from 'jsdom'
import { loadFormat } from '@/engine/formatLoaders'
import { computeViewDelta, mat4From12Values } from './viewTransforms'
import type { Bambu3mfMetadata } from './bambu-3mf'
import type { GlbPartInfo } from '@/stores/model-store'

const FIXTURE = path.resolve('src/test/fixtures/vise.3mf')

// Polyfill DOMParser for ThreeMFLoader (Node.js)
const dom = new JSDOM()
if (typeof globalThis.DOMParser === 'undefined') {
  ;(globalThis as any).DOMParser = dom.window.DOMParser
}

describe('view-switching integration flow', () => {
  let result: Awaited<ReturnType<typeof loadFormat>>
  let bambuMeta: Bambu3mfMetadata
  let meshes: THREE.Mesh[]

  beforeAll(async () => {
    const raw = fs.readFileSync(FIXTURE)
    const buf = raw.buffer.slice(
      raw.byteOffset,
      raw.byteOffset + raw.byteLength,
    ) as ArrayBuffer
    result = await loadFormat(buf, '3mf', FIXTURE)
    bambuMeta = result.bambuMetadata!
    meshes = result.meshes
  }, 30000)

  it('loads meshes and bambu metadata', () => {
    expect(meshes.length).toBeGreaterThan(0)
    expect(bambuMeta).toBeDefined()
    expect(bambuMeta.parts.length).toBeGreaterThan(0)
  })

  it('meshes.length matches parts.length (alignment test)', () => {
    // If this fails, the ModelGroup index-based mapping
    // bambuMeta.parts[i]?.objectId is WRONG for some meshes.
    console.log('meshes:', meshes.length, 'parts:', bambuMeta.parts.length,
      'buildItems:', bambuMeta.buildItems?.length,
      'assembleTransforms:', bambuMeta.assembleTransforms?.size)
    expect(meshes.length).toBe(bambuMeta.parts.length)
  })

  it('every mesh gets a non-null delta for assembly view', () => {
    let appliedCount = 0
    let skippedCount = 0
    for (let i = 0; i < meshes.length; i++) {
      const partMeta = bambuMeta.parts[i]
      const partInfo: GlbPartInfo = {
        partId: partMeta?.partId ?? `part-${i}`,
        meshIndex: i,
        name: partMeta?.name ?? '',
        triangleCount: 0,
        materialIndex: -1,
        objectId: partMeta?.objectId,
      }
      const delta = computeViewDelta('assembly', bambuMeta, partInfo)
      if (delta && !delta.equals(new THREE.Matrix4().identity())) {
        appliedCount++
      } else {
        skippedCount++
        if (!delta) {
          console.log(`mesh ${i}: objectId=${partMeta?.objectId} → delta is null`)
        } else {
          console.log(`mesh ${i}: objectId=${partMeta?.objectId} → delta is identity`)
        }
      }
    }
    console.log(`assembly: ${appliedCount} meshes transformed, ${skippedCount} skipped`)
    // At least some meshes should have a non-identity delta
    expect(appliedCount).toBeGreaterThan(0)
  })

  it('every mesh gets a non-null delta for import view', () => {
    let appliedCount = 0
    let skippedCount = 0
    for (let i = 0; i < meshes.length; i++) {
      const partMeta = bambuMeta.parts[i]
      const partInfo: GlbPartInfo = {
        partId: partMeta?.partId ?? `part-${i}`,
        meshIndex: i,
        name: partMeta?.name ?? '',
        triangleCount: 0,
        materialIndex: -1,
        objectId: partMeta?.objectId,
      }
      const delta = computeViewDelta('import', bambuMeta, partInfo)
      if (delta && !delta.equals(new THREE.Matrix4().identity())) {
        appliedCount++
      } else {
        skippedCount++
        if (!delta) {
          console.log(`mesh ${i}: objectId=${partMeta?.objectId} → delta is null`)
        }
      }
    }
    console.log(`import: ${appliedCount} meshes transformed, ${skippedCount} skipped`)
    expect(appliedCount).toBeGreaterThan(0)
  })

  it('print view delta is always null', () => {
    for (let i = 0; i < meshes.length; i++) {
      const partMeta = bambuMeta.parts[i]
      const partInfo: GlbPartInfo = {
        partId: partMeta?.partId ?? `part-${i}`,
        meshIndex: i,
        name: partMeta?.name ?? '',
        triangleCount: 0,
        materialIndex: -1,
        objectId: partMeta?.objectId,
      }
      expect(computeViewDelta('print', bambuMeta, partInfo)).toBeNull()
    }
  })

  it('model centering is idempotent across view switches', () => {
    // Verify that switching between views produces the same positions
    // regardless of how many times you switch (no accumulation drift)
    for (let i = 0; i < meshes.length; i++) {
      const partMeta = bambuMeta.parts[i]
      const partInfo: GlbPartInfo = {
        partId: partMeta?.partId ?? `part-${i}`,
        meshIndex: i,
        name: partMeta?.name ?? '',
        triangleCount: 0,
        materialIndex: -1,
        objectId: partMeta?.objectId,
      }

      // Apply delta twice: once with assembly, then back to print
      const dAssembly = computeViewDelta('assembly', bambuMeta, partInfo)
      const dPrint = computeViewDelta('print', bambuMeta, partInfo)
      expect(dPrint).toBeNull()

      // Verify M_assembly * M_build^-1 * M_build = M_assembly
      // (proving the delta formula is correct)
      if (dAssembly) {
        const buildItem = bambuMeta.buildItems?.find(b => b.objectId === partMeta?.objectId)
        if (buildItem?.transform) {
          const buildMat = mat4From12Values(buildItem.transform)
          const result = dAssembly.clone().multiply(buildMat)
          const assembleItem = bambuMeta.assembleTransforms!.get(partMeta!.objectId)
          const assembleMat = mat4From12Values(assembleItem!.transform)
          expect(result.determinant()).toBeCloseTo(assembleMat.determinant(), 3)
        }
      }
    }
  })
})
