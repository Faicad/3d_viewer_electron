import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useSelectionStore } from '@/stores/selection-store'
import { useCurvatureCombStore } from '@/stores/curvature-comb-store'
import { useModelStore } from '@/stores/model-store'
import type { SelectorRuntime } from '@/lib/topology/types'
import { buildCombGeometry } from './CurvatureCombCore'

function findMeshInGroup(group: THREE.Group): THREE.Mesh | null {
  let mesh: THREE.Mesh | null = null
  group.traverse((child) => {
    if (!mesh && child instanceof THREE.Mesh) mesh = child
  })
  return mesh
}

interface Props {
  selectorRuntime: SelectorRuntime | null
  modelGroupMapRef?: React.RefObject<Map<string, THREE.Group>>
}

export default function CurvatureCombRenderer({ selectorRuntime, modelGroupMapRef }: Props) {
  const enabled = useCurvatureCombStore((s) => s.enabled)
  const scale = useCurvatureCombStore((s) => s.scale)
  const color = useCurvatureCombStore((s) => s.color)
  const selectedReferenceIds = useSelectionStore((s) => s.selectedReferenceIds)
  const modelVersion = useModelStore((s) => s.modelVersion)
  const loadedFiles = useModelStore((s) => s.loadedFiles)
  const modelBuffer = useModelStore((s) => s.modelBuffer)

  const ref = useRef<THREE.LineSegments>(null)
  const prevGeometryRef = useRef<THREE.BufferGeometry | null>(null)

  useEffect(() => {
    if (!enabled) return
    useCurvatureCombStore.getState().setEnabled(false)
  }, [modelBuffer, modelVersion, loadedFiles])

  useEffect(() => {
    if (!enabled || !selectorRuntime || selectedReferenceIds.length === 0) {
      if (ref.current) {
        ref.current.geometry = new THREE.BufferGeometry()
      }
      return
    }

    let matrixWorld: THREE.Matrix4 | undefined
    if (modelGroupMapRef?.current && modelGroupMapRef.current.size > 0) {
      const firstGroup = modelGroupMapRef.current.values().next().value as THREE.Group | undefined
      if (firstGroup) {
        firstGroup.updateWorldMatrix(true, false)
        const mesh = findMeshInGroup(firstGroup)
        if (mesh) matrixWorld = mesh.matrixWorld
      }
    }

    const geometry = buildCombGeometry(selectorRuntime, selectedReferenceIds, scale, matrixWorld)

    if (ref.current) {
      if (prevGeometryRef.current && prevGeometryRef.current !== geometry) {
        prevGeometryRef.current.dispose()
      }
      ref.current.geometry = geometry || new THREE.BufferGeometry()
      prevGeometryRef.current = geometry || null
    }

    return () => {
      if (prevGeometryRef.current) {
        prevGeometryRef.current.dispose()
        prevGeometryRef.current = null
      }
    }
  }, [enabled, selectorRuntime, selectedReferenceIds, scale, modelGroupMapRef])

  if (!enabled) return null

  return (
    <lineSegments ref={ref} frustumCulled={false} renderOrder={10}>
      <lineBasicMaterial
        color={new THREE.Color(color[0], color[1], color[2])}
        transparent
        opacity={0.9}
        depthTest={false}
      />
    </lineSegments>
  )
}
