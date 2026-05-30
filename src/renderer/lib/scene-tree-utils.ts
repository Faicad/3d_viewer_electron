import type { SceneTreeNode } from '@/stores/model-store'

export function flattenVisibility(tree: SceneTreeNode[]): Map<string, boolean> {
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

function findInChildren(children: SceneTreeNode[], nodeId: string): boolean {
  for (const child of children) {
    if (child.id === nodeId) return true
    if (child.children && findInChildren(child.children, nodeId)) return true
  }
  return false
}

/** Find the fileId ancestor for a given node ID in the scene tree.
 *  File IDs are the UUID portion after the "file:" prefix. */
export function findFileIdForNode(tree: SceneTreeNode[], nodeId: string): string | null {
  for (const node of tree) {
    if (node.id.startsWith('file:')) {
      const fileId = node.id.slice(5)
      if (node.id === nodeId) return fileId
      if (node.children) {
        const found = findInChildren(node.children, nodeId)
        if (found) return fileId
      }
    } else {
      if (node.id === nodeId) return null
      if (node.children) {
        const found = findInChildren(node.children, nodeId)
        if (found) return null
      }
    }
  }
  return null
}

/** Given selected node IDs from the scene tree, return the set of unique file IDs
 *  they belong to. Skips IDs that don't resolve to a file ancestor. */
export function collectFileIdsFromSelection(
  sceneTree: SceneTreeNode[],
  selectedIds: string[],
): Set<string> {
  const fileIds = new Set<string>()
  for (const nodeId of selectedIds) {
    const fileId = findFileIdForNode(sceneTree, nodeId)
    if (fileId) fileIds.add(fileId)
  }
  return fileIds
}