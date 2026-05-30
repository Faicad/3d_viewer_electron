import { useMemo } from 'react'
import * as THREE from 'three'
import { useEngineStore } from '@/stores/engine-store'
import { CORNER_RATIO, buildCornerGeometry } from './SelectionBoundingBoxUtils'

interface SelectionBoundingBoxProps {
  selectedPartIds: string[]
  modelGroupMapRef: React.RefObject<Map<string, THREE.Group>>
}

// eslint-disable-next-line react-refresh/only-export-components
export { CORNER_RATIO, buildCornerGeometry }

// Keep original function removed �� now imported from SelectionBoundingBoxUtils
function _unused_buildCornerGeometry(
  group: THREE.Group,
  selectedPartIds: string[],
  cornerRatio: number = CORNER_RATIO,
): THREE.BufferGeometry | null {
  if (selectedPartIds.length === 0) return null

  const partSet = new Set(selectedPartIds)
  const overallBox = new THREE.Box3()
  let foundAny = false

  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const partId = child.userData?.partId as string | undefined
    if (!partId || !partSet.has(partId)) return

    child.updateWorldMatrix(true, false)
    const geo = child.geometry
    if (!geo.boundingBox) geo.computeBoundingBox()
    if (!geo.boundingBox) return

    overallBox.expandByPoint(geo.boundingBox.min.clone().applyMatrix4(child.matrixWorld))
    overallBox.expandByPoint(geo.boundingBox.max.clone().applyMatrix4(child.matrixWorld))
    foundAny = true
  })

  if (!foundAny) return null

  const { min, max } = overallBox
  const sx = (max.x - min.x) * cornerRatio
  const sy = (max.y - min.y) * cornerRatio
  const sz = (max.z - min.z) * cornerRatio

  const positions: number[] = []

  function addSegment(from: THREE.Vector3, to: THREE.Vector3) {
    positions.push(from.x, from.y, from.z, to.x, to.y, to.z)
  }

  const signs: [number, number, number][] = [
    [-1, -1, -1], [-1, -1, 1], [-1, 1, -1], [-1, 1, 1],
    [1, -1, -1], [1, -1, 1], [1, 1, -1], [1, 1, 1],
  ]

  for (const [sxSign, sySign, szSign] of signs) {
    const corner = new THREE.Vector3(
      sxSign < 0 ? min.x : max.x,
      sySign < 0 ? min.y : max.y,
      szSign < 0 ? min.z : max.z,
    )
    addSegment(corner, new THREE.Vector3(corner.x - sxSign * sx, corner.y, corner.z))
    addSegment(corner, new THREE.Vector3(corner.x, corner.y - sySign * sy, corner.z))
    addSegment(corner, new THREE.Vector3(corner.x, corner.y, corner.z - szSign * sz))
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  return geo
}

function buildLineSegments(
  groupMap: Map<string, THREE.Group>,
  selectedPartIds: string[],
): THREE.LineSegments | null {
  const geo = buildCornerGeometry(groupMap, selectedPartIds)
  if (!geo) return null

  const mat = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.9,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
  })

  const ls = new THREE.LineSegments(geo, mat)
  ls.frustumCulled = false
  ls.renderOrder = 6
  return ls
}

export default function SelectionBoundingBox({
  selectedPartIds,
  modelGroupMapRef,
}: SelectionBoundingBoxProps) {
  const highlightVersion = useEngineStore((s) => s.highlightVersion)
  /* eslint-disable react-hooks/refs */
  const groupMap = modelGroupMapRef.current
  const lines = useMemo(
    () => (groupMap && groupMap.size > 0 ? buildLineSegments(groupMap, selectedPartIds) : null),
    [groupMap, selectedPartIds, highlightVersion],
  )
  /* eslint-enable react-hooks/refs */

  if (!lines) return null

  return <primitive object={lines} />
}
