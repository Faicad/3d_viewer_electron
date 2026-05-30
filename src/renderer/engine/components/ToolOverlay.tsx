import { useMemo } from 'react'
import { useToolStore } from '@/stores/tool-store'
import { TransformControls } from '@react-three/drei'
import * as THREE from 'three'

interface ToolOverlayProps {
  modelGroupMapRef: React.RefObject<Map<string, THREE.Group>>
}

/** Wraps the first group from the map in a stable RefObject for TransformControls. */
function useFirstGroupRef(
  mapRef: React.RefObject<Map<string, THREE.Group>>,
): React.RefObject<THREE.Group | null> {
  /* eslint-disable react-hooks/refs */
  const firstGroup = mapRef.current.size > 0
    ? [...mapRef.current.values()][0]
    : null
  /* eslint-enable react-hooks/refs */
  return useMemo(() => ({ current: firstGroup }), [firstGroup])
}

export default function ToolOverlay({ modelGroupMapRef }: ToolOverlayProps) {
  const mode = useToolStore((s) => s.activeToolMode)
  const transformMode = useToolStore((s) => s.transformMode)
  const firstGroupRef = useFirstGroupRef(modelGroupMapRef)

  if (mode !== 'objectTransform') return null

  return (
    <TransformControls
      object={firstGroupRef as React.RefObject<THREE.Object3D>}
      mode={transformMode}
    />
  )
}
