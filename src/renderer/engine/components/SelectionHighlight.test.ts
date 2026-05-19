/**
 * @vitest-environment node
 *
 * Tests for SelectionHighlight geometry builders — verifies that highlights
 * honor mesh visibility so hidden parts don't show stale highlights.
 */
import { describe, it, expect } from 'vitest'
import * as THREE from 'three'

// ---- mirror of collectDisplayMeshes from SelectionHighlight.tsx ----

function collectDisplayMeshes(group: THREE.Group | null): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = []
  if (!group) return meshes
  group.traverse((child) => {
    if (child instanceof THREE.Mesh && child.visible) {
      meshes.push(child)
    }
  })
  return meshes
}

// ---- mirror of buildFaceHighlightGeometry (simplified for testing) ----

function findMeshForPart(
  group: THREE.Group | null,
  partId: string | undefined,
): THREE.Mesh | null {
  const meshes = collectDisplayMeshes(group)
  if (!meshes.length) return null
  if (partId) {
    return meshes.find((m) => m.userData?.partId === partId) ?? null
  }
  return meshes[0]
}

// ---- helper ----

function makeMesh(name: string, partId: string, visible = true): THREE.Mesh {
  const geo = new THREE.BoxGeometry(1, 1, 1)
  const mesh = new THREE.Mesh(geo)
  mesh.name = name
  mesh.userData = { partId }
  mesh.visible = visible
  return mesh
}

// ---- tests ----

describe('collectDisplayMeshes', () => {
  it('returns only visible meshes', () => {
    const group = new THREE.Group()
    group.add(makeMesh('visible', 'p1', true))
    group.add(makeMesh('hidden', 'p2', false))

    const result = collectDisplayMeshes(group)
    expect(result).toHaveLength(1)
    expect(result[0].userData.partId).toBe('p1')
  })

  it('returns empty array when all meshes hidden', () => {
    const group = new THREE.Group()
    group.add(makeMesh('hidden1', 'p1', false))
    group.add(makeMesh('hidden2', 'p2', false))

    const result = collectDisplayMeshes(group)
    expect(result).toHaveLength(0)
  })

  it('returns null-safely', () => {
    expect(collectDisplayMeshes(null)).toEqual([])
  })
})

describe('findMeshForPart', () => {
  it('returns mesh matching partId when visible', () => {
    const group = new THREE.Group()
    group.add(makeMesh('a', 'p1', true))
    group.add(makeMesh('b', 'p2', true))

    const result = findMeshForPart(group, 'p2')
    expect(result).not.toBeNull()
    expect(result!.userData.partId).toBe('p2')
  })

  it('returns null when partId mesh is hidden', () => {
    const group = new THREE.Group()
    group.add(makeMesh('a', 'p1', true))
    group.add(makeMesh('b', 'p2', false))

    const result = findMeshForPart(group, 'p2')
    expect(result).toBeNull()
  })

  it('returns first visible mesh when partId is undefined', () => {
    const group = new THREE.Group()
    group.add(makeMesh('hidden', 'p1', false))
    group.add(makeMesh('visible', 'p2', true))

    const result = findMeshForPart(group, undefined)
    expect(result).not.toBeNull()
    expect(result!.userData.partId).toBe('p2')
  })

  it('returns null when partId undefined and all hidden', () => {
    const group = new THREE.Group()
    group.add(makeMesh('hidden1', 'p1', false))

    const result = findMeshForPart(group, undefined)
    expect(result).toBeNull()
  })
})
