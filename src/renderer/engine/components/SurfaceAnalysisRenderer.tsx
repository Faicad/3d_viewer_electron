import { useEffect, useRef } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useSurfaceAnalysisStore } from '@/stores/surface-analysis-store'
import { useModelStore } from '@/stores/model-store'
import {
  collectSceneMeshes,
  applyToMeshes,
  updateUniforms,
  restoreMeshes,
  disposeAnalysis,
} from './SurfaceAnalysisCore'

export default function SurfaceAnalysisRenderer() {
  const enabled = useSurfaceAnalysisStore((s) => s.enabled)
  const mode = useSurfaceAnalysisStore((s) => s.mode)
  const analysisDirection = useSurfaceAnalysisStore((s) => s.analysisDirection)
  const fixedDirection = useSurfaceAnalysisStore((s) => s.fixedDirection)
  const stripesNumber = useSurfaceAnalysisStore((s) => s.stripesNumber)
  const stripesRatio = useSurfaceAnalysisStore((s) => s.stripesRatio)
  const color1 = useSurfaceAnalysisStore((s) => s.color1)
  const color2 = useSurfaceAnalysisStore((s) => s.color2)
  const shading = useSurfaceAnalysisStore((s) => s.shading)
  const rainbowAngle1 = useSurfaceAnalysisStore((s) => s.rainbowAngle1)
  const rainbowAngle2 = useSurfaceAnalysisStore((s) => s.rainbowAngle2)
  const isoAngles = useSurfaceAnalysisStore((s) => s.isoAngles)
  const isoTolerance = useSurfaceAnalysisStore((s) => s.isoTolerance)
  const modelBuffer = useModelStore((s) => s.modelBuffer)
  const modelVersion = useModelStore((s) => s.modelVersion)
  const loadedFiles = useModelStore((s) => s.loadedFiles)
  const { scene, camera } = useThree()

  const originalMapRef = useRef<Map<string, THREE.Material>>(new Map())
  const analysisMatsRef = useRef<Map<string, THREE.ShaderMaterial>>(new Map())
  const meshesRef = useRef<THREE.Mesh[]>([])

  useEffect(() => {
    if (!enabled) return
    useSurfaceAnalysisStore.getState().setEnabled(false)
    useSurfaceAnalysisStore.getState().resetToDefaults()
  }, [modelBuffer, modelVersion, loadedFiles])

  useEffect(() => {
    if (!scene) return

    if (!enabled) {
      if (meshesRef.current.length > 0) {
        restoreMeshes(meshesRef.current, originalMapRef.current)
      }
      disposeAnalysis(originalMapRef.current, analysisMatsRef.current)
      meshesRef.current = []
      analysisMatsRef.current = new Map()
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

      const s = useSurfaceAnalysisStore.getState()
      meshesRef.current = meshes
      const mats = applyToMeshes(meshes, originalMapRef.current, {
        mode: s.mode,
        analysisDirection: s.analysisDirection,
        fixedDirection: s.fixedDirection,
        stripesNumber: s.stripesNumber,
        stripesRatio: s.stripesRatio,
        color1: s.color1,
        color2: s.color2,
        shading: s.shading,
        rainbowAngle1: s.rainbowAngle1,
        rainbowAngle2: s.rainbowAngle2,
        isoAngles: s.isoAngles,
        isoTolerance: s.isoTolerance,
      })
      analysisMatsRef.current = mats
    }

    tryInit()
  }, [scene, enabled])

  useEffect(() => {
    if (!enabled || analysisMatsRef.current.size === 0) return
    const s = useSurfaceAnalysisStore.getState()
    updateUniforms(analysisMatsRef.current, {
      mode: s.mode,
      analysisDirection: s.analysisDirection,
      fixedDirection: s.fixedDirection,
      stripesNumber: s.stripesNumber,
      stripesRatio: s.stripesRatio,
      color1: s.color1,
      color2: s.color2,
      shading: s.shading,
      rainbowAngle1: s.rainbowAngle1,
      rainbowAngle2: s.rainbowAngle2,
      isoAngles: s.isoAngles,
      isoTolerance: s.isoTolerance,
    })
  }, [
    enabled, mode, analysisDirection, fixedDirection,
    stripesNumber, stripesRatio, color1, color2, shading,
    rainbowAngle1, rainbowAngle2, isoAngles, isoTolerance,
  ])

  useFrame(() => {
    if (!enabled || analysisMatsRef.current.size === 0) return
    if (fixedDirection) return

    const dir = new THREE.Vector3(0, 0, -1)
    dir.applyQuaternion(camera.quaternion)

    analysisMatsRef.current.forEach((material) => {
      material.uniforms.analysisDirection.value.copy(dir)
    })
  })

  useEffect(() => {
    return () => {
      if (meshesRef.current.length > 0) {
        restoreMeshes(meshesRef.current, originalMapRef.current)
      }
      disposeAnalysis(originalMapRef.current, analysisMatsRef.current)
      meshesRef.current = []
      analysisMatsRef.current = new Map()
    }
  }, [scene])

  return null
}
