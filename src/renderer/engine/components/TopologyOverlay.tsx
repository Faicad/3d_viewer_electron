import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { SelectorRuntime } from '@/lib/topology/types'
import { useModelStore } from '@/stores/model-store'
import { useEngineStore } from '@/stores/engine-store'
import {
  buildFacePickMesh,
  buildEdgePickLines,
  buildPointPickPoints,
} from '@/lib/topology/build-pick-geometry'

interface TopologyOverlayProps {
  selectorRuntime: SelectorRuntime | null
  /** Part IDs of currently selected objects (used to match mesh position in multi-object / post-drag scenes). */
  selectedPartIds?: string[]
}

/**
 * Invisible pick-proxy overlay for topology selection.
 *
 * Face picking is two-layer (see useTopologyPicking.ts):
 * - PRIMARY:   display meshes (rendered by ModelGroup with per-part faceIds)
 * - FALLBACK:  face-pick-mesh built here (raw STEP_T geometry)
 *
 * The fallback exists for modes where display meshes are hidden — e.g.
 * wireframe mode where ModelGroup returns null. In normal solid mode the
 * primary path handles everything; the fallback is never reached.
 *
 * All three pick geometries (face mesh, edge lines, vertex points) are
 * fully invisible — opacity 0, colorWrite false, depthWrite false.
 * They only serve as raycaster targets.
 */
export default function TopologyOverlay({ selectorRuntime, selectedPartIds }: TopologyOverlayProps) {
  const { scene } = useThree()
  const groupRef = useRef<THREE.Group | null>(null)
  const centeringOffset = useModelStore((s) => s.modelCenteringOffset)
  const modelTransform = useEngineStore((s) => s.modelTransform)
  const highlightVersion = useEngineStore((s) => s.highlightVersion)

  useEffect(() => {
    // Remove previous group
    if (groupRef.current) {
      disposePickGroup(groupRef.current)
      scene.remove(groupRef.current)
      groupRef.current = null
    }

    if (!selectorRuntime) return

    const group = new THREE.Group()
    group.name = 'topology-pick-overlay'

    // Align topology pick overlay with the centered display meshes.
    // ModelGroup centers display meshes by offsetting each mesh by -center.
    // Drag-to-move adds an offset: mesh.position = -center + dragDelta.
    // We start with -centeringOffset, then scan scene display meshes to
    // pick up any additional drag offset from their position.
    const basePos = centeringOffset
      ? new THREE.Vector3(-centeringOffset[0], -centeringOffset[1], -centeringOffset[2])
      : new THREE.Vector3(0, 0, 0)
    const partSet = selectedPartIds && selectedPartIds.length > 0
      ? new Set(selectedPartIds)
      : null
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh && child.userData?.partId && child.visible && !child.renderOrder) {
        // If we have selected part IDs, only use matching meshes.
        // If no selection, use any display mesh (single-object fallback).
        if (partSet) {
          const childPartId = child.userData.partId as string
          if (partSet.has(childPartId)) {
            basePos.copy(child.position)
          }
        } else {
          basePos.copy(child.position)
        }
      }
    })
    if (modelTransform) {
      basePos.applyMatrix4(modelTransform)
    }
    group.position.copy(basePos)

    const faceMesh = buildFacePickMesh(selectorRuntime)
    if (faceMesh) {
      faceMesh.name = 'face-pick-mesh'
      group.add(faceMesh)
    }

    const edgeLines = buildEdgePickLines(selectorRuntime)
    if (edgeLines) {
      edgeLines.name = 'edge-pick-lines'
      group.add(edgeLines)
    }

    const vertexPoints = buildPointPickPoints(selectorRuntime)
    if (vertexPoints) {
      vertexPoints.name = 'point-pick-points'
      group.add(vertexPoints)
    }

    scene.add(group)
    groupRef.current = group
    console.log('[TopologyOverlay] pick group created, children:', group.children.length,
      'groupPos:', group.position.toArray(),
      'centeringOffset:', centeringOffset,
      'hasFacePick:', !!faceMesh,
      'hasEdgePick:', !!edgeLines,
      'hasVertexPick:', !!vertexPoints)

    return () => {
      if (groupRef.current) {
        disposePickGroup(groupRef.current)
        scene.remove(groupRef.current)
        groupRef.current = null
      }
    }
  }, [selectorRuntime, scene, centeringOffset, modelTransform, highlightVersion, selectedPartIds])

  return null
}

function disposePickGroup(group: THREE.Group) {
  group.traverse((child) => {
    if (
      child instanceof THREE.Mesh ||
      child instanceof THREE.LineSegments ||
      child instanceof THREE.Points
    ) {
      child.geometry?.dispose()
      if (Array.isArray(child.material)) {
        child.material.forEach((m) => m.dispose())
      } else {
        child.material?.dispose()
      }
    }
  })
}
