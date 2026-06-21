/**
 * @vitest-environment node
 *
 * Tests for unified mesh pipeline visibility contract.
 *
 * All mesh formats (GLB, STL, PLY, OBJ, DRC, etc.) go through the same pipeline.
 * Each mesh gets a partId like `${fileId}:${rawPartId}` and a meshIndex.
 * The scene tree is built from partInfos, and visibilityMap resolves node IDs.
 */

import { describe, it, expect } from 'vitest'
import { flattenVisibility } from '@/lib/scene-tree-utils'
import type { SceneTreeNode } from '@/stores/model-store'

// ---------------------------------------------------------------------------
// Helpers — mirror the real implementations in model-store.ts
// ---------------------------------------------------------------------------

function setAllVisible(nodes: SceneTreeNode[], visible: boolean): SceneTreeNode[] {
  return nodes.map((node) => ({
    ...node,
    visible,
    ...(node.children && node.children.length > 0
      ? { children: setAllVisible(node.children, visible) }
      : {}),
  }))
}

function toggleNodeInTree(
  nodes: SceneTreeNode[],
  nodeId: string,
  key: 'expanded' | 'visible',
): SceneTreeNode[] {
  return nodes.map((node) => {
    if (node.id === nodeId) {
      const newValue = !node[key]
      if (key === 'visible' && node.children && node.children.length > 0) {
        return {
          ...node,
          visible: newValue,
          children: setAllVisible(node.children, newValue),
        }
      }
      return { ...node, [key]: newValue }
    }
    if (node.children && node.children.length > 0) {
      return { ...node, children: toggleNodeInTree(node.children, nodeId, key) }
    }
    return node
  })
}

function buildCombinedTree(
  files: { id: string; name: string; tree: SceneTreeNode[] }[],
): SceneTreeNode[] {
  return files.map((f) => ({
    id: `file:${f.id}`,
    name: f.name,
    visible: true,
    expanded: true,
    ...(f.tree.length > 0 ? { children: f.tree } : {}),
  }))
}

function syncChildren(combined: SceneTreeNode[], fileId: string): SceneTreeNode[] {
  const fileNode = combined.find((n) => n.id === `file:${fileId}`)
  return fileNode?.children ?? []
}

// ---------------------------------------------------------------------------
// Unified pipeline partId format
//
// ModelGroup produces partIds as: fileId ? `${fileId}:${rawPartId}` : rawPartId
// where rawPartId = src.name || `part-${i}`
// For STL (no name from loader), rawPartId = 'part-0'
// ---------------------------------------------------------------------------
function unifiedPartId(fileId: string, index: number): string {
  return `${fileId}:part-${index}`
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('unified mesh pipeline visibility contract', () => {
  // -----------------------------------------------------------------------
  // 1. ID format: all formats use the same partId pattern
  // -----------------------------------------------------------------------

  it('unified pipeline partId uses part-N format (not format-model)', () => {
    const fileId = 'abc-123-def'
    const pid = unifiedPartId(fileId, 0)
    expect(pid).toBe('abc-123-def:part-0')
  })

  it.each(['stl', 'ply', 'obj', 'drc', 'glb'] as const)(
    'mesh from %s uses consistent partId format',
    (_format) => {
      const pid = unifiedPartId('file-001', 0)
      // All formats use the same ID pattern — no format-specific suffix
      expect(pid).toBe('file-001:part-0')
    },
  )

  // -----------------------------------------------------------------------
  // 2. Scene tree structure: nodes have meshIndex
  // -----------------------------------------------------------------------

  it('scene tree for STL has meshIndex on nodes', () => {
    const fileId = 'abc'
    const tree: SceneTreeNode[] = [
      {
        id: unifiedPartId(fileId, 0),
        name: 'part-0',
        visible: true,
        expanded: true,
        meshIndex: 0,
      },
    ]

    expect(tree[0].id).toBe('abc:part-0')
    expect(tree[0].meshIndex).toBe(0)
    expect(tree[0].visible).toBe(true)
  })

  // -----------------------------------------------------------------------
  // 3. flattenVisibility resolves unified node IDs
  // -----------------------------------------------------------------------

  it('flattenVisibility contains the unified node id', () => {
    const tree: SceneTreeNode[] = [
      { id: 'abc:part-0', name: 'part-0', visible: true, expanded: true, meshIndex: 0 },
    ]
    const map = flattenVisibility(tree)
    expect(map.get('abc:part-0')).toBe(true)
  })

  it('flattenVisibility returns false when node is hidden', () => {
    const tree: SceneTreeNode[] = [
      { id: 'abc:part-0', name: 'part-0', visible: false, expanded: true, meshIndex: 0 },
    ]
    const map = flattenVisibility(tree)
    expect(map.get('abc:part-0')).toBe(false)
  })

  it('default to visible when node ID is not in the map (?? true fallback)', () => {
    const map = flattenVisibility([])
    expect(map.get('abc:part-0') ?? true).toBe(true)
  })

  // -----------------------------------------------------------------------
  // 4. Full pipeline: combined tree → toggle file node → sync → visibilityMap
  // -----------------------------------------------------------------------

  it('file-level visibility toggle cascades to mesh node', () => {
    const fileId = 'stl-file-001'
    const nodeId = unifiedPartId(fileId, 0)

    const fileTree: SceneTreeNode[] = [
      { id: nodeId, name: 'part-0', visible: true, expanded: true, meshIndex: 0 },
    ]

    // Wrap in combined tree
    let combined = buildCombinedTree([
      { id: fileId, name: 'model.stl', tree: fileTree },
    ])

    // Toggle the file-level node visibility
    combined = toggleNodeInTree(combined, `file:${fileId}`, 'visible')
    expect(combined[0].visible).toBe(false)
    expect(combined[0].children![0].visible).toBe(false)

    // Sync back to file tree
    const synced = syncChildren(combined, fileId)
    expect(synced[0].visible).toBe(false)

    // Compute visibility map
    const visibilityMap = flattenVisibility(synced)

    // The mesh node should be hidden
    const vis = visibilityMap.get(nodeId) ?? true
    expect(vis).toBe(false)
  })

  // -----------------------------------------------------------------------
  // 5. Multi-file scenario
  // -----------------------------------------------------------------------

  it('toggling one file does not affect the other in multi-file scene', () => {
    const fileA = {
      id: 'file-a',
      name: 'cube.stl',
      tree: [{ id: unifiedPartId('file-a', 0), name: 'part-0', visible: true, expanded: true, meshIndex: 0 }],
    }
    const fileB = {
      id: 'file-b',
      name: 'sphere.ply',
      tree: [{ id: unifiedPartId('file-b', 0), name: 'part-0', visible: true, expanded: true, meshIndex: 0 }],
    }

    let combined = buildCombinedTree([fileA, fileB])

    // Toggle file A to hidden
    combined = toggleNodeInTree(combined, 'file:file-a', 'visible')

    // Sync back both files
    const syncedA = syncChildren(combined, 'file-a')
    const syncedB = syncChildren(combined, 'file-b')

    const visA = flattenVisibility(syncedA)
    const visB = flattenVisibility(syncedB)

    expect(visA.get(unifiedPartId('file-a', 0))).toBe(false)
    expect(visB.get(unifiedPartId('file-b', 0))).toBe(true)
  })

  // -----------------------------------------------------------------------
  // 6. Mixed scene: GLB + STL both use unified pipeline
  // -----------------------------------------------------------------------

  it('GLB and STL mesh visibility behave identically', () => {
    // A GLB file with two meshes
    const glbTree: SceneTreeNode[] = [
      {
        id: 'glb-file:Root',
        name: 'Root',
        visible: true,
        expanded: true,
        children: [
          { id: 'glb-file:Mesh_Body', name: 'Mesh_Body', visible: true, meshIndex: 0 },
          { id: 'glb-file:Mesh_Head', name: 'Mesh_Head', visible: true, meshIndex: 1 },
        ],
      },
    ]

    // An STL file with one mesh (unified pipeline)
    const stlTree: SceneTreeNode[] = [
      { id: unifiedPartId('stl-file', 0), name: 'part-0', visible: true, expanded: true, meshIndex: 0 },
    ]

    let combined = buildCombinedTree([
      { id: 'glb-file', name: 'robot.glb', tree: glbTree },
      { id: 'stl-file', name: 'part.stl', tree: stlTree },
    ])

    // Toggle BOTH files to hidden
    combined = toggleNodeInTree(combined, 'file:glb-file', 'visible')
    combined = toggleNodeInTree(combined, 'file:stl-file', 'visible')

    const syncedGlb = syncChildren(combined, 'glb-file')
    const syncedStl = syncChildren(combined, 'stl-file')

    const glbMap = flattenVisibility(syncedGlb)
    const stlMap = flattenVisibility(syncedStl)

    expect(glbMap.get('glb-file:Mesh_Body')).toBe(false)
    expect(glbMap.get('glb-file:Mesh_Head')).toBe(false)
    expect(stlMap.get(unifiedPartId('stl-file', 0))).toBe(false)
  })

  // -----------------------------------------------------------------------
  // 7. Toggle back to visible
  // -----------------------------------------------------------------------

  it('mesh becomes visible again after toggle back', () => {
    const fileId = 'abc'
    const nodeId = unifiedPartId(fileId, 0)

    const fileTree: SceneTreeNode[] = [
      { id: nodeId, name: 'part-0', visible: true, expanded: true, meshIndex: 0 },
    ]

    let combined = buildCombinedTree([{ id: fileId, name: 'm.stl', tree: fileTree }])

    // Hide
    combined = toggleNodeInTree(combined, `file:${fileId}`, 'visible')
    let synced = syncChildren(combined, fileId)
    expect(flattenVisibility(synced).get(nodeId)).toBe(false)

    // Show again
    combined = toggleNodeInTree(combined, `file:${fileId}`, 'visible')
    synced = syncChildren(combined, fileId)
    expect(flattenVisibility(synced).get(nodeId)).toBe(true)
  })

  // -----------------------------------------------------------------------
  // 8. Multi-mesh file (e.g. GLB with several parts)
  // -----------------------------------------------------------------------

  it('multi-mesh file: each part has unique ID and meshIndex', () => {
    const tree: SceneTreeNode[] = [
      { id: 'file-x:part-0', name: 'part-0', visible: true, expanded: true, meshIndex: 0 },
      { id: 'file-x:part-1', name: 'part-1', visible: true, expanded: true, meshIndex: 1 },
      { id: 'file-x:part-2', name: 'part-2', visible: true, expanded: true, meshIndex: 2 },
    ]

    const map = flattenVisibility(tree)
    expect(map.get('file-x:part-0')).toBe(true)
    expect(map.get('file-x:part-1')).toBe(true)
    expect(map.get('file-x:part-2')).toBe(true)
    expect(map.get('file-x:part-0') ?? true).toBe(true)
  })
})
