/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as THREE from 'three'
import { loadIfcAsMeshes } from '../loadIfc'

const FIXTURES_DIR = path.resolve('src/test/fixtures')

describe('IFC Loader', () => {
  it('parses haus.ifc and produces meshes with geometry', async () => {
    const filePath = path.join(FIXTURES_DIR, 'haus.ifc')
    expect(fs.existsSync(filePath)).toBe(true)

    const raw = fs.readFileSync(filePath)
    const buffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer

    const result = await loadIfcAsMeshes(buffer)

    expect(result.meshes.length).toBeGreaterThan(0)
    expect(result.objects).toEqual([])
    expect(result.sceneRoot).toBeInstanceOf(THREE.Group)
    expect(['millimeter', 'meter', 'centimeter', 'foot', 'inch']).toContain(result.sourceUnit)

    for (const mesh of result.meshes) {
      expect(mesh).toBeInstanceOf(THREE.Mesh)
      expect(mesh.geometry).toBeInstanceOf(THREE.BufferGeometry)
      expect(mesh.geometry.attributes.position).toBeDefined()
      expect(mesh.geometry.index).toBeDefined()
      expect(mesh.geometry.attributes.normal).toBeDefined()

      const pos = mesh.geometry.attributes.position
      expect(pos.count).toBeGreaterThan(0)

      const idx = mesh.geometry.index
      expect(idx!.count).toBeGreaterThan(0)

      expect(mesh.material).toBeInstanceOf(THREE.MeshStandardMaterial)
    }
  })

  it('produces unique materials for distinct colors', async () => {
    const filePath = path.join(FIXTURES_DIR, 'haus.ifc')
    const raw = fs.readFileSync(filePath)
    const buffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer

    const result = await loadIfcAsMeshes(buffer)

    const matSet = new Set<THREE.Material>()
    for (const mesh of result.meshes) {
      if (mesh.material) matSet.add(mesh.material as THREE.Material)
    }

    expect(matSet.size).toBeGreaterThan(1)
  })

  it('haus.ifc has expected mesh count range', async () => {
    const filePath = path.join(FIXTURES_DIR, 'haus.ifc')
    const raw = fs.readFileSync(filePath)
    const buffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer

    const result = await loadIfcAsMeshes(buffer)

    const totalTriangles = result.meshes.reduce((sum, m) => {
      const idx = m.geometry.index
      return sum + (idx ? idx.count / 3 : 0)
    }, 0)

    expect(totalTriangles).toBeGreaterThan(1000)
  })
})
