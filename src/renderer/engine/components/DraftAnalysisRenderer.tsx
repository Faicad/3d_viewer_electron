import { useEffect, useRef } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useDraftAnalysisStore } from '@/stores/draft-analysis-store'
import { useModelStore } from '@/stores/model-store'
import {
  collectSceneMeshes,
  applyDraftToMeshes,
  updateDraftUniforms,
  restoreMeshes,
  disposeDraft,
} from './DraftAnalysisCore'

const _viewDir = new THREE.Vector3()
const _worldDir = new THREE.Vector3()
const _viewRot = new THREE.Matrix3()

export default function DraftAnalysisRenderer() {
  const enabled = useDraftAnalysisStore((s) => s.enabled)
  const pullDirection = useDraftAnalysisStore((s) => s.pullDirection)
  const draftAnglePos = useDraftAnalysisStore((s) => s.draftAnglePos)
  const draftAngleNeg = useDraftAnalysisStore((s) => s.draftAngleNeg)
  const draftTolPos = useDraftAnalysisStore((s) => s.draftTolPos)
  const draftTolNeg = useDraftAnalysisStore((s) => s.draftTolNeg)
  const shading = useDraftAnalysisStore((s) => s.shading)
  const colors = useDraftAnalysisStore((s) => s.colors)
  const modelBuffer = useModelStore((s) => s.modelBuffer)
  const modelVersion = useModelStore((s) => s.modelVersion)
  const loadedFiles = useModelStore((s) => s.loadedFiles)
  const { scene, camera } = useThree()

  const originalMapRef = useRef<Map<string, THREE.Material>>(new Map())
  const draftMatsRef = useRef<Map<string, THREE.ShaderMaterial>>(new Map())
  const meshesRef = useRef<THREE.Mesh[]>([])

  useEffect(() => {
    if (!enabled) return
    useDraftAnalysisStore.getState().setEnabled(false)
    useDraftAnalysisStore.getState().resetToDefaults()
  }, [modelBuffer, modelVersion, loadedFiles])

  useEffect(() => {
    if (!scene) return

    if (!enabled) {
      if (meshesRef.current.length > 0) {
        restoreMeshes(meshesRef.current, originalMapRef.current)
      }
      disposeDraft(originalMapRef.current, draftMatsRef.current)
      meshesRef.current = []
      draftMatsRef.current = new Map()
      return
    }

    let retries = 0
    const maxRetries = 30

    const tryInit = () => {
      if (!scene) return
      const meshes = collectSceneMeshes(scene)
      if (meshes.length === 0) {
        if (++retries < maxRetries) { setTimeout(tryInit, 100); return }
        return
      }

      const s = useDraftAnalysisStore.getState()
      const pullDir = s.pullDirection
      meshesRef.current = meshes
      const draftMats = applyDraftToMeshes(meshes, originalMapRef.current, {
        pullDirection: pullDir,
        draftAnglePos: s.draftAnglePos,
        draftAngleNeg: s.draftAngleNeg,
        draftTolPos: s.draftTolPos,
        draftTolNeg: s.draftTolNeg,
        shading: s.shading,
        colors: s.colors,
      })
      draftMatsRef.current = draftMats
    }

    tryInit()
  }, [scene, enabled])

  useEffect(() => {
    if (!enabled || draftMatsRef.current.size === 0) return
    const s = useDraftAnalysisStore.getState()
    updateDraftUniforms(draftMatsRef.current, {
      pullDirection: s.pullDirection,
      draftAnglePos: s.draftAnglePos,
      draftAngleNeg: s.draftAngleNeg,
      draftTolPos: s.draftTolPos,
      draftTolNeg: s.draftTolNeg,
      shading: s.shading,
      colors: s.colors,
    })
  }, [enabled, pullDirection, draftAnglePos, draftAngleNeg, draftTolPos, draftTolNeg, shading, colors])

  useFrame(() => {
    if (!enabled || draftMatsRef.current.size === 0) return
    const dir = useDraftAnalysisStore.getState().pullDirection
    _worldDir.set(dir[0], dir[1], dir[2]).normalize()
    _viewRot.setFromMatrix4(camera.matrixWorldInverse)
    _viewDir.copy(_worldDir).applyMatrix3(_viewRot)
    draftMatsRef.current.forEach((mat) => {
      mat.uniforms.pullDirection.value.copy(_viewDir)
    })
  })

  useEffect(() => {
    return () => {
      if (meshesRef.current.length > 0) {
        restoreMeshes(meshesRef.current, originalMapRef.current)
      }
      disposeDraft(originalMapRef.current, draftMatsRef.current)
      meshesRef.current = []
      draftMatsRef.current = new Map()
    }
  }, [scene])

  return null
}
