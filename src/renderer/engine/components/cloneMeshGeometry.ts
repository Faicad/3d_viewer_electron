import * as THREE from 'three'

/**
 * Clone a mesh's geometry for use in a new Mesh.
 *
 * R3F creates a fresh THREE.Mesh (no geometry in constructor) then sets geometry
 * as a plain property, which does NOT call updateMorphTargets().  If the
 * geometry has morphAttributes the mesh will have undefined
 * morphTargetInfluences, and Three.js crashes in WebGLMorphtargets.update with
 * "Cannot read properties of undefined (reading 'length')".
 *
 * We clear morphAttributes since we don't animate morph targets.
 */
export function cloneMeshGeometry(src: THREE.Mesh): THREE.BufferGeometry {
  const geo = src.geometry.clone()
  // R3F assigns geometry as a plain property (not via constructor), which
  // does NOT call updateMorphTargets().  Clear morph attributes so Three.js
  // skips morph processing — otherwise WebGLMorphtargets.update crashes on
  // undefined morphTargetInfluences every render frame.
  if (geo.morphAttributes) {
    geo.morphAttributes = {}
  }
  return geo
}
