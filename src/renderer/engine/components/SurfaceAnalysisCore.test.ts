/**
 * @vitest-environment node
 */
import { describe, it, expect, vi } from 'vitest'
import * as THREE from 'three'
import {
  createSurfaceAnalysisMaterial,
  collectSceneMeshes,
  applyToMeshes,
  restoreMeshes,
  disposeAnalysis,
  updateUniforms,
} from './SurfaceAnalysisCore'
import type { SurfaceAnalysisParams } from './SurfaceAnalysisCore'

const DEFAULT_PARAMS: SurfaceAnalysisParams = {
  mode: 'zebra',
  analysisDirection: [1, 0, 0],
  fixedDirection: false,
  stripesNumber: 12,
  stripesRatio: 0.5,
  color1: [1, 1, 1],
  color2: [0, 0, 0],
  shading: 0.2,
  rainbowAngle1: 0,
  rainbowAngle2: 180,
  isoAngles: [45, 90, 135],
  isoTolerance: 0.5,
}

describe('createSurfaceAnalysisMaterial', () => {
  it('returns a THREE.ShaderMaterial', () => {
    const mat = createSurfaceAnalysisMaterial(DEFAULT_PARAMS)
    expect(mat).toBeInstanceOf(THREE.ShaderMaterial)
  })

  it('has correct uniforms for zebra mode', () => {
    const mat = createSurfaceAnalysisMaterial(DEFAULT_PARAMS)
    expect(mat.uniforms.mode.value).toBe(0)
    expect(mat.uniforms.stripesNumber.value).toBe(12)
    expect(mat.uniforms.stripesRatio.value).toBe(0.5)
    expect(mat.uniforms.color1.value).toBeInstanceOf(THREE.Color)
    expect(mat.uniforms.color2.value).toBeInstanceOf(THREE.Color)
    expect(mat.uniforms.shading.value).toBe(0.2)
  })

  it('sets mode to 1 for rainbow', () => {
    const mat = createSurfaceAnalysisMaterial({ ...DEFAULT_PARAMS, mode: 'rainbow' })
    expect(mat.uniforms.mode.value).toBe(1)
  })

  it('sets mode to 2 for isophote', () => {
    const mat = createSurfaceAnalysisMaterial({ ...DEFAULT_PARAMS, mode: 'isophote' })
    expect(mat.uniforms.mode.value).toBe(2)
  })

  it('normalizes analysisDirection', () => {
    const mat = createSurfaceAnalysisMaterial({ ...DEFAULT_PARAMS, analysisDirection: [0, 0, 5] })
    expect(mat.uniforms.analysisDirection.value.length()).toBeCloseTo(1)
  })

  it('has 20 isoAngles in uniform', () => {
    const mat = createSurfaceAnalysisMaterial(DEFAULT_PARAMS)
    expect(mat.uniforms.isoAngles.value).toHaveLength(20)
    expect(mat.uniforms.isoAngles.value[0]).toBe(45)
    expect(mat.uniforms.isoAngles.value[1]).toBe(90)
    expect(mat.uniforms.isoAngles.value[2]).toBe(135)
    expect(mat.uniforms.isoAngles.value[3]).toBe(-1)
  })

  it('sets fixedDirection uniform', () => {
    const mat = createSurfaceAnalysisMaterial({ ...DEFAULT_PARAMS, fixedDirection: true })
    expect(mat.uniforms.fixedDirection.value).toBe(1)
  })

  it('sets rainbow angles uniform', () => {
    const mat = createSurfaceAnalysisMaterial({ ...DEFAULT_PARAMS, mode: 'rainbow', rainbowAngle1: 30, rainbowAngle2: 150 })
    expect(mat.uniforms.rainbowAngle1.value).toBe(30)
    expect(mat.uniforms.rainbowAngle2.value).toBe(150)
  })

  it('sets isoTolerance uniform', () => {
    const mat = createSurfaceAnalysisMaterial({ ...DEFAULT_PARAMS, mode: 'isophote', isoTolerance: 1.5 })
    expect(mat.uniforms.isoTolerance.value).toBe(1.5)
  })

  it('uses DoubleSide', () => {
    const mat = createSurfaceAnalysisMaterial(DEFAULT_PARAMS)
    expect(mat.side).toBe(THREE.DoubleSide)
  })
})

describe('collectSceneMeshes', () => {
  it('returns visible meshes from scene', () => {
    const scene = new THREE.Scene()
    const mesh1 = new THREE.Mesh(new THREE.BoxGeometry())
    const mesh2 = new THREE.Mesh(new THREE.BoxGeometry())
    mesh2.visible = false
    scene.add(mesh1)
    scene.add(mesh2)

    const result = collectSceneMeshes(scene)
    expect(result).toHaveLength(1)
    expect(result[0]).toBe(mesh1)
  })

  it('skips shadowFloor', () => {
    const scene = new THREE.Scene()
    const floor = new THREE.Mesh(new THREE.PlaneGeometry())
    floor.name = 'shadowFloor'
    scene.add(floor)

    expect(collectSceneMeshes(scene)).toHaveLength(0)
  })

  it('skips ShadowMaterial meshes', () => {
    const scene = new THREE.Scene()
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.ShadowMaterial())
    scene.add(mesh)

    expect(collectSceneMeshes(scene)).toHaveLength(0)
  })

  it('skips non-Mesh objects', () => {
    const scene = new THREE.Scene()
    scene.add(new THREE.Group())

    expect(collectSceneMeshes(scene)).toHaveLength(0)
  })

  it('skips meshes with _zebraInternal userData', () => {
    const scene = new THREE.Scene()
    const mesh = new THREE.Mesh(new THREE.BoxGeometry())
    mesh.userData['_zebraInternal'] = true
    scene.add(mesh)

    expect(collectSceneMeshes(scene)).toHaveLength(0)
  })

  it('skips meshes with _surfaceAnalysisInternal userData', () => {
    const scene = new THREE.Scene()
    const mesh = new THREE.Mesh(new THREE.BoxGeometry())
    mesh.userData['_surfaceAnalysisInternal'] = true
    scene.add(mesh)

    expect(collectSceneMeshes(scene)).toHaveLength(0)
  })

  it('skips meshes with renderOrder === 999', () => {
    const scene = new THREE.Scene()
    const mesh = new THREE.Mesh(new THREE.BoxGeometry())
    mesh.renderOrder = 999
    scene.add(mesh)

    expect(collectSceneMeshes(scene)).toHaveLength(0)
  })
})

describe('applyToMeshes and restoreMeshes', () => {
  it('replaces mesh material with ShaderMaterial', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial())
    const originalMap = new Map<string, THREE.Material>()

    applyToMeshes([mesh], originalMap, DEFAULT_PARAMS)

    expect(mesh.material).toBeInstanceOf(THREE.ShaderMaterial)
  })

  it('caches original material in originalMap', () => {
    const orig = new THREE.MeshStandardMaterial()
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), orig)
    const originalMap = new Map<string, THREE.Material>()

    applyToMeshes([mesh], originalMap, DEFAULT_PARAMS)

    expect(originalMap.get(mesh.uuid)).toBe(orig)
  })

  it('restoreMeshes brings back original material', () => {
    const orig = new THREE.MeshStandardMaterial()
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), orig)
    const originalMap = new Map<string, THREE.Material>()

    applyToMeshes([mesh], originalMap, DEFAULT_PARAMS)
    expect(mesh.material).not.toBe(orig)

    restoreMeshes([mesh], originalMap)
    expect(mesh.material).toBe(orig)
  })

  it('handles non-cached meshes gracefully', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry())
    const originalMap = new Map<string, THREE.Material>()

    restoreMeshes([mesh], originalMap)
  })

  it('returns a map of ShaderMaterials', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry())
    const originalMap = new Map<string, THREE.Material>()

    const result = applyToMeshes([mesh], originalMap, DEFAULT_PARAMS)

    const mat = result.get(mesh.uuid)
    expect(mat).toBeInstanceOf(THREE.ShaderMaterial)
  })

  it('reuses originalMap entry when mesh already cached', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry())
    const originalMap = new Map<string, THREE.Material>()
    const cached = new THREE.MeshStandardMaterial()
    originalMap.set(mesh.uuid, cached)

    applyToMeshes([mesh], originalMap, DEFAULT_PARAMS)

    expect(originalMap.size).toBe(1)
    expect(originalMap.get(mesh.uuid)).toBe(cached)
  })
})

describe('updateUniforms', () => {
  it('updates mode on all materials', () => {
    const mat = createSurfaceAnalysisMaterial(DEFAULT_PARAMS)
    const mats = new Map<string, THREE.ShaderMaterial>()
    mats.set('m1', mat)

    updateUniforms(mats, { ...DEFAULT_PARAMS, mode: 'rainbow' })

    expect(mat.uniforms.mode.value).toBe(1)
  })

  it('updates stripesNumber on all materials', () => {
    const mat = createSurfaceAnalysisMaterial(DEFAULT_PARAMS)
    const mats = new Map<string, THREE.ShaderMaterial>()
    mats.set('m1', mat)

    updateUniforms(mats, { ...DEFAULT_PARAMS, stripesNumber: 5 })

    expect(mat.uniforms.stripesNumber.value).toBe(5)
  })

  it('updates stripesRatio on all materials', () => {
    const mat = createSurfaceAnalysisMaterial(DEFAULT_PARAMS)
    const mats = new Map<string, THREE.ShaderMaterial>()
    mats.set('m1', mat)

    updateUniforms(mats, { ...DEFAULT_PARAMS, stripesRatio: 0.8 })

    expect(mat.uniforms.stripesRatio.value).toBe(0.8)
  })

  it('updates shading on all materials', () => {
    const mat = createSurfaceAnalysisMaterial(DEFAULT_PARAMS)
    const mats = new Map<string, THREE.ShaderMaterial>()
    mats.set('m1', mat)

    updateUniforms(mats, { ...DEFAULT_PARAMS, shading: 0.8 })

    expect(mat.uniforms.shading.value).toBe(0.8)
  })

  it('updates colors on all materials', () => {
    const mat = createSurfaceAnalysisMaterial(DEFAULT_PARAMS)
    const mats = new Map<string, THREE.ShaderMaterial>()
    mats.set('m1', mat)

    updateUniforms(mats, { ...DEFAULT_PARAMS, color1: [0.5, 0.5, 0.5] })

    expect(mat.uniforms.color1.value.r).toBe(0.5)
    expect(mat.uniforms.color1.value.g).toBe(0.5)
    expect(mat.uniforms.color1.value.b).toBe(0.5)
  })

  it('updates analysisDirection', () => {
    const mat = createSurfaceAnalysisMaterial(DEFAULT_PARAMS)
    const mats = new Map<string, THREE.ShaderMaterial>()
    mats.set('m1', mat)

    updateUniforms(mats, { ...DEFAULT_PARAMS, analysisDirection: [0, 1, 0] })

    expect(mat.uniforms.analysisDirection.value.x).toBe(0)
    expect(mat.uniforms.analysisDirection.value.y).toBe(1)
    expect(mat.uniforms.analysisDirection.value.z).toBe(0)
  })

  it('updates fixedDirection', () => {
    const mat = createSurfaceAnalysisMaterial(DEFAULT_PARAMS)
    const mats = new Map<string, THREE.ShaderMaterial>()
    mats.set('m1', mat)

    updateUniforms(mats, { ...DEFAULT_PARAMS, fixedDirection: true })

    expect(mat.uniforms.fixedDirection.value).toBe(1)
  })
})

describe('disposeAnalysis', () => {
  it('disposes all ShaderMaterials', () => {
    const mat = createSurfaceAnalysisMaterial(DEFAULT_PARAMS)
    const disposeSpy = vi.spyOn(mat, 'dispose')

    const mats = new Map<string, THREE.ShaderMaterial>()
    mats.set('m1', mat)

    const originalMap = new Map<string, THREE.Material>()

    disposeAnalysis(originalMap, mats)

    expect(disposeSpy).toHaveBeenCalledTimes(1)
    expect(mats.size).toBe(0)
    expect(originalMap.size).toBe(0)
  })
})
