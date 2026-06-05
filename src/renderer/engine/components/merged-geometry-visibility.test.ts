/**
 * @vitest-environment node
 *
 * Tests for merged-geometry visibility contract.
 *
 * ModelGroup has three render paths:
 *   1. Non-mesh objects (GCode, point-cloud) — correctly uses visible={vis}
 *   2. GLB multi-mesh — correctly uses visible={vis}
 *   3. Merged geometry (STL/PLY/OBJ/DRC/AMF/3DS/WRL/VOX/KMZ/…) — MISSING visible
 *
 * This suite documents the contract that path (3) must follow so that
 * scene-tree eye-icon toggles actually hide/show the 3D model.
 *
 * The node ID for merged geometry is `${fileId}:${format}-model`
 * (see ModelGroup.tsx lines 641 and 892).
 * This must match the ID that buildSceneTree / onSceneTreeChangeRef emits
 * so that flattenVisibility(sceneTree) contains the key ModelGroup looks up.
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
// The ID pattern used by ModelGroup for merged-geometry formats
// ---------------------------------------------------------------------------
function mergedPartId(fileId: string, format: string): string {
  return `${fileId}:${format}-model`
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('merged-geometry visibility contract', () => {
  const FORMATS = ['stl', 'ply', 'obj', 'drc', 'amf', '3ds', 'wrl', 'vox', 'kmz'] as const

  // -----------------------------------------------------------------------
  // 1. ID format contract
  // -----------------------------------------------------------------------

  it('merged geometry partId format matches scene-tree node id', () => {
    const fileId = 'abc-123-def'
    const format = 'stl'
    const pid = mergedPartId(fileId, format)

    expect(pid).toBe('abc-123-def:stl-model')
  })

  it.each(FORMATS)('merged geometry partId for %s matches expected pattern', (format) => {
    const pid = mergedPartId('file-001', format)
    expect(pid).toBe(`file-001:${format}-model`)
  })

  // -----------------------------------------------------------------------
  // 2. Scene tree structure for merged geometry
  // -----------------------------------------------------------------------

  it('scene tree for merged geometry has the expected single-node structure', () => {
    // This mirrors what ModelGroup does at line 642-645:
    //   [{ id: stlPartId, name: format.toUpperCase(), visible: true, expanded: true }]
    const fileId = 'abc'
    const format = 'stl'
    const tree: SceneTreeNode[] = [
      {
        id: mergedPartId(fileId, format),
        name: format.toUpperCase(),
        visible: true,
        expanded: true,
      },
    ]

    expect(tree[0].id).toBe('abc:stl-model')
    expect(tree[0].visible).toBe(true)
  })

  // -----------------------------------------------------------------------
  // 3. flattenVisibility resolves merged geometry node IDs
  // -----------------------------------------------------------------------

  it('flattenVisibility contains the merged geometry node id', () => {
    const tree: SceneTreeNode[] = [
      { id: 'abc:stl-model', name: 'STL', visible: true, expanded: true },
    ]
    const map = flattenVisibility(tree)
    expect(map.get('abc:stl-model')).toBe(true)
  })

  it('flattenVisibility returns false when merged geometry node is hidden', () => {
    const tree: SceneTreeNode[] = [
      { id: 'abc:stl-model', name: 'STL', visible: false, expanded: true },
    ]
    const map = flattenVisibility(tree)
    expect(map.get('abc:stl-model')).toBe(false)
  })

  it('default to visible when node ID is not in the map (?? true fallback)', () => {
    const map = flattenVisibility([])
    expect(map.get('abc:stl-model') ?? true).toBe(true)
  })

  // -----------------------------------------------------------------------
  // 4. Full pipeline: combined tree → toggle file node → sync → visibilityMap
  // -----------------------------------------------------------------------

  it('file-level visibility toggle cascades to merged geometry node', () => {
    // Build a scene tree for a single merged-geometry STL file
    const fileId = 'stl-file-001'
    const format = 'stl'
    const nodeId = mergedPartId(fileId, format)

    const fileTree: SceneTreeNode[] = [
      { id: nodeId, name: 'STL', visible: true, expanded: true },
    ]

    // Wrap in combined tree (what buildCombinedTree does)
    let combined = buildCombinedTree([
      { id: fileId, name: 'model.stl', tree: fileTree },
    ])

    // Toggle the file-level node visibility (what toggleNodeVisible does)
    combined = toggleNodeInTree(combined, `file:${fileId}`, 'visible')
    expect(combined[0].visible).toBe(false)
    expect(combined[0].children![0].visible).toBe(false)

    // Sync back to file tree (what syncCombinedToFiles does)
    const synced = syncChildren(combined, fileId)
    expect(synced[0].visible).toBe(false)

    // Compute visibility map (what ModelGroup does at lines 164-166)
    const visibilityMap = flattenVisibility(synced)

    // THIS is what ModelGroup should be doing for merged geometry:
    const vis = visibilityMap.get(nodeId) ?? true
    expect(vis).toBe(false)
  })

  // -----------------------------------------------------------------------
  // 5. Multi-file scenario: two merged-geometry files from different folders
  // -----------------------------------------------------------------------

  it('toggling one file does not affect the other in multi-file scene', () => {
    const fileA = { id: 'file-a', name: 'cube.stl', tree: [
      { id: mergedPartId('file-a', 'stl'), name: 'STL', visible: true, expanded: true },
    ]}
    const fileB = { id: 'file-b', name: 'sphere.stl', tree: [
      { id: mergedPartId('file-b', 'stl'), name: 'STL', visible: true, expanded: true },
    ]}

    let combined = buildCombinedTree([fileA, fileB])

    // Toggle file A to hidden
    combined = toggleNodeInTree(combined, 'file:file-a', 'visible')

    // Sync back both files
    const syncedA = syncChildren(combined, 'file-a')
    const syncedB = syncChildren(combined, 'file-b')

    const visA = flattenVisibility(syncedA)
    const visB = flattenVisibility(syncedB)

    // File A model should be hidden
    expect(visA.get(mergedPartId('file-a', 'stl'))).toBe(false)
    // File B model should still be visible
    expect(visB.get(mergedPartId('file-b', 'stl'))).toBe(true)
  })

  // -----------------------------------------------------------------------
  // 6. Mixed scene: GLB (correctly handled) + STL (merged geometry)
  // -----------------------------------------------------------------------

  it('merged-geometry visibility matches GLB mesh visibility behavior', () => {
    // A GLB file with two meshes
    const glbTree: SceneTreeNode[] = [
      {
        id: 'glb-file:Root', name: 'Root', visible: true, expanded: true,
        children: [
          { id: 'glb-file:Mesh_Body', name: 'Mesh_Body', visible: true, meshIndex: 0 },
          { id: 'glb-file:Mesh_Head', name: 'Mesh_Head', visible: true, meshIndex: 1 },
        ],
      },
    ]

    // A merged-geometry STL file
    const stlTree: SceneTreeNode[] = [
      { id: mergedPartId('stl-file', 'stl'), name: 'STL', visible: true, expanded: true },
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

    // GLB meshes are hidden (this already works in ModelGroup)
    expect(glbMap.get('glb-file:Mesh_Body')).toBe(false)
    expect(glbMap.get('glb-file:Mesh_Head')).toBe(false)

    // STL merged geometry SHOULD be hidden (this is what we're fixing)
    // If ModelGroup reads visibilityMap.get(mergedPartId) ?? true,
    // this would return false — and the mesh would be hidden.
    expect(stlMap.get(mergedPartId('stl-file', 'stl'))).toBe(false)
  })

  // -----------------------------------------------------------------------
  // 7. Toggle back to visible
  // -----------------------------------------------------------------------

  it('merged geometry becomes visible again after toggle back', () => {
    const fileId = 'abc'
    const format = 'stl'

    const fileTree: SceneTreeNode[] = [
      { id: mergedPartId(fileId, format), name: 'STL', visible: true, expanded: true },
    ]

    let combined = buildCombinedTree([{ id: fileId, name: 'm.stl', tree: fileTree }])

    // Hide
    combined = toggleNodeInTree(combined, `file:${fileId}`, 'visible')
    let synced = syncChildren(combined, fileId)
    expect(flattenVisibility(synced).get(mergedPartId(fileId, format))).toBe(false)

    // Show again
    combined = toggleNodeInTree(combined, `file:${fileId}`, 'visible')
    synced = syncChildren(combined, fileId)
    expect(flattenVisibility(synced).get(mergedPartId(fileId, format))).toBe(true)
  })
})
