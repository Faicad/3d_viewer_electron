import * as THREE from 'three'
import type {
  Bambu3mfMetadata,
} from './bambu-3mf'
import type { GlbPartInfo } from '@/stores/model-store'

export type ViewMode = 'print' | 'assembly' | 'import'

/** Convert a 12-value 4×3 row-major transform array to THREE.Matrix4.
 *
 *  Input: [M11, M12, M13, M21, M22, M23, M31, M32, M33, TX, TY, TZ]
 *  Output Matrix4 (column-major elements):
 *    [M11, M12, M13, TX, M21, M22, M23, TY, M31, M32, M33, TZ, 0, 0, 0, 1]
 */
export function mat4From12Values(v: number[]): THREE.Matrix4 {
  return new THREE.Matrix4().set(
    v[0], v[1], v[2], v[9],
    v[3], v[4], v[5], v[10],
    v[6], v[7], v[8], v[11],
    0, 0, 0, 1,
  )
}

/** Convert a 16-value 4×4 row-major array to THREE.Matrix4.
 *
 *  Input: [M11, M12, M13, M14, M21, M22, M23, M24, M31, M32, M33, M34, M41, M42, M43, M44]
 */
export function mat4From16Values(v: number[]): THREE.Matrix4 {
  return new THREE.Matrix4().fromArray(v)
}

/** Create a translation-only matrix from an offset tuple. */
export function makeTranslationMatrix(t: [number, number, number]): THREE.Matrix4 {
  return new THREE.Matrix4().makeTranslation(t[0], t[1], t[2])
}

/** Compute the delta matrix to transform a mesh from print-view to target view.
 *
 *  Formula: delta = M_target_object × M_build_object⁻¹
 *
 *  The component-level transforms cancel out in the delta, so applying this
 *  matrix to a geometry that already has M_build × M_component baked in
 *  yields a geometry with M_target × M_component.
 */
export function computeViewDelta(
  viewMode: ViewMode,
  bambuMeta: Bambu3mfMetadata,
  partInfo: GlbPartInfo,
): THREE.Matrix4 | null {
  const objectId = partInfo.objectId
  if (!objectId) return null

  const buildItem = bambuMeta.buildItems?.find(b => b.objectId === objectId)
  if (!buildItem?.transform) return null
  const buildMatrix = mat4From12Values(buildItem.transform)

  if (viewMode === 'assembly') {
    const assembleItem = bambuMeta.assembleTransforms?.get(objectId)
    if (!assembleItem) return null
    const assembleMatrix = mat4From12Values(assembleItem.transform)
    assembleMatrix.multiply(makeTranslationMatrix(assembleItem.offset))
    return assembleMatrix.multiply(buildMatrix.clone().invert())
  }

  if (viewMode === 'import') {
    const partId = partInfo.partId ?? '0'
    const importItem = bambuMeta.importTransforms?.get(`${objectId}:${partId}`)
    if (!importItem) return null
    const importMatrix = mat4From16Values(importItem.matrix)
    importMatrix.multiply(makeTranslationMatrix(importItem.sourceOffset))
    return importMatrix.multiply(buildMatrix.clone().invert())
  }

  return null
}

/** Check whether a view mode is available for a given bambu metadata object. */
export function hasViewData(
  viewMode: ViewMode,
  bambuMeta: Bambu3mfMetadata,
): boolean {
  if (viewMode === 'print') return true
  if (viewMode === 'assembly') return (bambuMeta.assembleTransforms?.size ?? 0) > 0
  if (viewMode === 'import') return (bambuMeta.importTransforms?.size ?? 0) > 0
  return false
}
