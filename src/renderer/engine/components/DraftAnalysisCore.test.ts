/**
 * @vitest-environment node
 */
import { describe, it, expect, vi } from 'vitest'
import * as THREE from 'three'
import { computeAngles, createDraftMaterial, collectSceneMeshes, applyDraftToMeshes, restoreMeshes, disposeDraft, updateDraftUniforms } from './DraftAnalysisCore'
import type { DraftParams } from './DraftAnalysisCore'

const DEFAULT_PARAMS: DraftParams = {
  pullDirection: [0, 0, 1],
  draftAnglePos: 1.0,
  draftAngleNeg: 1.0,
  draftTolPos: 0.05,
  draftTolNeg: 0.05,
  shading: 0.2,
  colors: {
    inDraftPos: [0, 0, 1],
    inTolerancePos: [0, 1, 1],
    outOfDraftPos: [1, 0, 0],
    inDraftNeg: [0, 1, 0],
    inToleranceNeg: [1, 1, 0],
    outOfDraftNeg: [1, 0, 0],
  },
}

describe('computeAngles', () => {
  it('returns 7 boundary angles for default params', () => {
    const result = computeAngles(1, 1, 0.05, 0.05)
    expect(result).toHaveLength(7)
    expect(result[0]).toBe(0)
    expect(result[3]).toBe(90)
    expect(result[6]).toBe(180)
  })

  it('symmetrical: pos and neg with same values give symmetrical boundaries', () => {
    const result = computeAngles(5, 5, 0.5, 0.5)
    expect(result[1]).toBeCloseTo(84.5)
    expect(result[2]).toBeCloseTo(85)
    expect(result[3]).toBe(90)
    expect(result[4]).toBeCloseTo(95)
    expect(result[5]).toBeCloseTo(95.5)
  })

  it('zero angles produce only center boundary', () => {
    const result = computeAngles(0, 0, 0, 0)
    expect(result).toEqual([0, 90, 90, 90, 90, 90, 180])
  })

  it('large angles compress positive region', () => {
    const result = computeAngles(80, 1, 0.1, 0.05)
    expect(result[1]).toBeCloseTo(9.9)
    expect(result[2]).toBeCloseTo(10)
    expect(result[3]).toBe(90)
  })
})

describe('createDraftMaterial', () => {
  it('returns a THREE.ShaderMaterial', () => {
    const mat = createDraftMaterial(DEFAULT_PARAMS)
    expect(mat).toBeInstanceOf(THREE.ShaderMaterial)
  })

  it('has correct uniforms', () => {
    const mat = createDraftMaterial(DEFAULT_PARAMS)
    expect(mat.uniforms.pullDirection).toBeDefined()
    expect(mat.uniforms.angles).toBeDefined()
    expect(mat.uniforms.colors).toBeDefined()
    expect(mat.uniforms.shading).toBeDefined()
  })

  it('sets pullDirection uniform from params', () => {
    const mat = createDraftMaterial({ ...DEFAULT_PARAMS, pullDirection: [1, 0, 0] })
    expect(mat.uniforms.pullDirection.value.x).toBe(1)
    expect(mat.uniforms.pullDirection.value.y).toBe(0)
    expect(mat.uniforms.pullDirection.value.z).toBe(0)
  })

  it('normalizes pullDirection', () => {
    const mat = createDraftMaterial({ ...DEFAULT_PARAMS, pullDirection: [0, 0, 5] })
    expect(mat.uniforms.pullDirection.value.length()).toBeCloseTo(1)
  })

  it('sets shading uniform', () => {
    const mat = createDraftMaterial({ ...DEFAULT_PARAMS, shading: 0.5 })
    expect(mat.uniforms.shading.value).toBe(0.5)
  })

  it('has angles as 7 radian values', () => {
    const mat = createDraftMaterial(DEFAULT_PARAMS)
    expect(mat.uniforms.angles.value).toHaveLength(7)
    expect(mat.uniforms.angles.value[3]).toBeCloseTo(Math.PI / 2)
    expect(mat.uniforms.angles.value[6]).toBeCloseTo(Math.PI)
  })

  it('has 8 colors in colors uniform', () => {
    const mat = createDraftMaterial(DEFAULT_PARAMS)
    expect(mat.uniforms.colors.value).toHaveLength(8)
  })

  it('uses DoubleSide', () => {
    const mat = createDraftMaterial(DEFAULT_PARAMS)
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
})

describe('applyDraftToMeshes and restoreMeshes', () => {
  it('replaces mesh material with ShaderMaterial', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial())
    const originalMap = new Map<string, THREE.Material>()

    applyDraftToMeshes([mesh], originalMap, DEFAULT_PARAMS)

    expect(mesh.material).toBeInstanceOf(THREE.ShaderMaterial)
  })

  it('caches original material in originalMap', () => {
    const orig = new THREE.MeshStandardMaterial()
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), orig)
    const originalMap = new Map<string, THREE.Material>()

    applyDraftToMeshes([mesh], originalMap, DEFAULT_PARAMS)

    expect(originalMap.get(mesh.uuid)).toBe(orig)
  })

  it('restoreMeshes brings back original material', () => {
    const orig = new THREE.MeshStandardMaterial()
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), orig)
    const originalMap = new Map<string, THREE.Material>()

    applyDraftToMeshes([mesh], originalMap, DEFAULT_PARAMS)
    expect(mesh.material).not.toBe(orig)

    restoreMeshes([mesh], originalMap)
    expect(mesh.material).toBe(orig)
  })

  it('handles non-cached meshes gracefully', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry())
    const originalMap = new Map<string, THREE.Material>()

    restoreMeshes([mesh], originalMap)
  })
})

describe('updateDraftUniforms', () => {
  it('updates pullDirection on all materials', () => {
    const mat = createDraftMaterial(DEFAULT_PARAMS)
    const mats = new Map<string, THREE.ShaderMaterial>()
    mats.set('m1', mat)

    const newParams: DraftParams = {
      ...DEFAULT_PARAMS,
      pullDirection: [1, 0, 0],
    }

    updateDraftUniforms(mats, newParams)

    expect(mat.uniforms.pullDirection.value.x).toBe(1)
    expect(mat.uniforms.pullDirection.value.y).toBe(0)
  })

  it('updates shading on all materials', () => {
    const mat = createDraftMaterial(DEFAULT_PARAMS)
    const mats = new Map<string, THREE.ShaderMaterial>()
    mats.set('m1', mat)

    updateDraftUniforms(mats, { ...DEFAULT_PARAMS, shading: 0.8 })

    expect(mat.uniforms.shading.value).toBe(0.8)
  })

  it('updates colors on all materials', () => {
    const mat = createDraftMaterial(DEFAULT_PARAMS)
    const mats = new Map<string, THREE.ShaderMaterial>()
    mats.set('m1', mat)

    updateDraftUniforms(mats, {
      ...DEFAULT_PARAMS,
      colors: { ...DEFAULT_PARAMS.colors, inDraftPos: [1, 0, 0] },
    })

    expect(mat.uniforms.colors.value[1].r).toBe(1)
    expect(mat.uniforms.colors.value[1].g).toBe(0)
  })
})

describe('disposeDraft', () => {
  it('disposes all ShaderMaterials', () => {
    const mat = createDraftMaterial(DEFAULT_PARAMS)
    const disposeSpy = vi.spyOn(mat, 'dispose')

    const mats = new Map<string, THREE.ShaderMaterial>()
    mats.set('m1', mat)

    disposeDraft(new Map(), mats)

    expect(disposeSpy).toHaveBeenCalledTimes(1)
    expect(mats.size).toBe(0)
  })
})
