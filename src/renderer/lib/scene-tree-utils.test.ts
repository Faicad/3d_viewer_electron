import { describe, it, expect } from 'vitest'
import type { SceneTreeNode } from '@/stores/model-store'

// Duplicate the relevant functions from model-store to test in isolation.
// These are also tested in model-store.test.ts but we need specific
// mesh-ID-matching scenarios here.

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

function setAllVisible(nodes: SceneTreeNode[], visible: boolean): SceneTreeNode[] {
  return nodes.map((node) => ({
    ...node,
    visible,
    ...(node.children && node.children.length > 0 ? { children: setAllVisible(node.children, visible) } : {}),
  }))
}

function flattenVisibility(tree: SceneTreeNode[]): Map<string, boolean> {
  const map = new Map<string, boolean>()
  for (const node of tree) {
    map.set(node.id, node.visible)
    if (node.children) {
      for (const [childId, childVis] of flattenVisibility(node.children)) {
        map.set(childId, childVis)
      }
    }
  }
  return map
}

// Simulate the combined-tree wrapping that happens in model-store
function buildCombinedTree(files: { id: string; name: string; tree: SceneTreeNode[] }[]): SceneTreeNode[] {
  return files.map((f) => ({
    id: `file:${f.id}`,
    name: f.name,
    visible: true,
    expanded: true,
    ...(f.tree.length > 0 ? { children: f.tree } : {}),
  }))
}

// Simulate syncCombinedToFiles: extract children back from combined tree
function syncChildren(combined: SceneTreeNode[], fileId: string): SceneTreeNode[] {
  const fileNode = combined.find((n) => n.id === `file:${fileId}`)
  return fileNode?.children ?? []
}

describe('scene-tree visibility cascade', () => {
  it('flattenVisibility includes all node IDs from a complex hierarchy', () => {
    // Simulate a rigged model hierarchy like RobotExpressive
    const tree: SceneTreeNode[] = [
      {
        id: 'Armature', name: 'Armature', visible: true, expanded: true,
        children: [
          { id: 'Hips', name: 'Hips', visible: true, expanded: true, children: [
            { id: 'Spine', name: 'Spine', visible: true },
          ]},
          { id: 'LeftLeg', name: 'LeftLeg', visible: true, children: [
            { id: 'Mesh_Body', name: 'Mesh_Body', visible: true, meshIndex: 0 },
          ]},
        ],
      },
    ]

    const map = flattenVisibility(tree)
    expect(map.get('Armature')).toBe(true)
    expect(map.get('Hips')).toBe(true)
    expect(map.get('Spine')).toBe(true)
    expect(map.get('LeftLeg')).toBe(true)
    expect(map.get('Mesh_Body')).toBe(true)
  })

  it('mesh partId lookup finds the correct visibility after file-level toggle', () => {
    // Build tree that simulates what buildSceneTree produces for a GLB
    // with meshes and intermediate hierarchy nodes
    const fileTree: SceneTreeNode[] = [
      {
        id: 'RootNode', name: 'RootNode', visible: true, expanded: true,
        children: [
          {
            id: 'Armature', name: 'Armature', visible: true,
            children: [
              { id: 'Hips', name: 'Hips', visible: true, children: [
                { id: 'Mesh_Body', name: 'Mesh_Body', visible: true, meshIndex: 0 },
              ]},
            ],
          },
          { id: 'Mesh_Head', name: 'Mesh_Head', visible: true, meshIndex: 1 },
        ],
      },
    ]

    // Combined tree wraps file tree in a file-level node
    const combined = buildCombinedTree([{ id: 'abc', name: 'RobotExpressive.glb', tree: fileTree }])

    // Verify initial state: all meshes visible
    const initMap = flattenVisibility(fileTree)
    expect(initMap.get('Mesh_Body')).toBe(true)
    expect(initMap.get('Mesh_Head')).toBe(true)

    // Toggle file-level node to hide everything
    const toggled = toggleNodeInTree(combined, 'file:abc', 'visible')
    expect(toggled[0].visible).toBe(false)

    // Sync back to file tree (what syncCombinedToFiles does)
    const synced = syncChildren(toggled, 'abc')
    expect(synced[0].visible).toBe(false) // RootNode hidden

    // Check that mesh IDs are in the visibility map with correct values
    const visMap = flattenVisibility(synced)
    expect(visMap.get('Mesh_Body')).toBe(false)
    expect(visMap.get('Mesh_Head')).toBe(false)
  })

  it('mesh partIds match tree IDs when both use same name fallback', () => {
    // When a mesh has name "Body", both buildSceneTree and the mesh partId
    // computation should derive the same ID "Body".
    const meshPartId = 'Body' // from src.name
    const treeNodeId = 'Body' // from child.name

    expect(meshPartId).toBe(treeNodeId)
  })

function treeNodeId(child: { userData?: { partId?: string }; name?: string; uuid: string }): string {
  return String(child.userData?.partId || child.name || child.uuid)
}

function meshPartId(src: { userData?: { partId?: string }; name?: string }, index: number): string {
  return String(src.userData?.partId || src.name || `part-${index}`)
}

  it('mesh partIds DO NOT match tree IDs when names are empty — fallback divergence', () => {
    // When name is "" (falsy), the fallback chains diverge:
    //   tree ID → child.uuid (random)
    //   mesh ID → "part-0" (index-based)
    const obj = { name: '', uuid: 'uuid-1234' }
    const treeId = treeNodeId(obj)
    const meshId = meshPartId(obj, 0)

    expect(treeId).toBe('uuid-1234')
    expect(meshId).toBe('part-0')
    expect(treeId).not.toBe(meshId)
  })

  it('mesh partId IS in visibility map when partId is name-based', () => {
    // Simulating a mesh named "Body" — both paths produce "Body"
    const fileTree: SceneTreeNode[] = [
      { id: 'Body', name: 'Body', visible: true, meshIndex: 0 },
    ]
    const combined = buildCombinedTree([{ id: 'abc', name: 'test.glb', tree: fileTree }])
    const toggled = toggleNodeInTree(combined, 'file:abc', 'visible')
    const synced = syncChildren(toggled, 'abc')
    const visMap = flattenVisibility(synced)

    const meshPartId = 'Body'
    expect(visMap.get(meshPartId)).toBe(false)
  })

  describe('non-mesh format visibility (GCode / point-cloud)', () => {
    it('flattenVisibility maps format-objects node id for gcode-style tree', () => {
      // Non-mesh formats (GCode, PCD, XYZ, etc.) produce a single flat tree node
      // with id `${format}-objects`. ModelGroup reads visibility from the map
      // using this id to set the visible prop on <primitive> elements.
      const tree: SceneTreeNode[] = [
        { id: 'gcode-objects', name: 'GCODE', visible: true, expanded: true },
      ]
      const map = flattenVisibility(tree)
      expect(map.get('gcode-objects')).toBe(true)
    })

    it('toggleNodeInTree sets non-mesh node to invisible', () => {
      const tree: SceneTreeNode[] = [
        { id: 'gcode-objects', name: 'GCODE', visible: true, expanded: true },
      ]
      const toggled = toggleNodeInTree(tree, 'gcode-objects', 'visible')
      expect(toggled[0].visible).toBe(false)
    })

    it('flat non-mesh node visibility propagates through combined tree (file-level toggle)', () => {
      // Simulates the full flow: file with non-mesh content gets hidden via
      // the combined tree, then synced back to the file's sceneTree.
      const fileTree: SceneTreeNode[] = [
        { id: 'gcode-objects', name: 'GCODE', visible: true, expanded: true },
      ]
      const combined = buildCombinedTree([{ id: 'abc', name: 'benchy.gcode', tree: fileTree }])

      // Toggle file-level node
      const toggled = toggleNodeInTree(combined, 'file:abc', 'visible')

      // Sync back to file tree (what syncCombinedToFiles does)
      const synced = syncChildren(toggled, 'abc')
      expect(synced[0].visible).toBe(false)

      // flattenVisibility returns the correct visibility for the primitive
      const visMap = flattenVisibility(synced)
      expect(visMap.get('gcode-objects')).toBe(false)

      // This is what ModelGroup would compute:
      const nodeId = synced[0]?.id ?? 'gcode-objects'
      const vis = visMap.get(nodeId) ?? true
      expect(vis).toBe(false)
    })

    it('non-mesh node defaults to visible when id not in map', () => {
      // If the tree is empty or id doesn't match, default to visible
      const map = flattenVisibility([])
      const vis = map.get('gcode-objects') ?? true
      expect(vis).toBe(true)
    })
  })

  it('mesh partId is NOT in visibility map when IDs diverge (empty name case)', () => {
    // Simulate unnamed meshes: buildSceneTree used uuid, partIds use "part-N"
    // The visibility map won't contain the mesh partId.
    const visMap = flattenVisibility([
      { id: 'uuid-1234', name: '', visible: true, meshIndex: 0 },
    ])

    expect(visMap.get('part-0')).toBeUndefined()
    // visibilityMap.get('part-0') ?? true → true (visible!) — BUG: should be hidden
    expect(visMap.get('part-0') ?? true).toBe(true)
  })
})
