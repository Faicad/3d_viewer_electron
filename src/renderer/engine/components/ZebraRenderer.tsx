import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useZebraStore } from '@/stores/zebra-store'
import { useModelStore } from '@/stores/model-store'
import {
  createZebraTexture,
  collectSceneMeshes,
  applyZebraToMeshes,
  updateZebraTexture,
  updateZebraDirection,
  updateZebraOpacity,
  updateZebraMappingMode,
  restoreMeshes,
  disposeZebra,
} from './ZebraCore'

export default function ZebraRenderer() {
  const enabled = useZebraStore((s) => s.enabled)
  const stripeCount = useZebraStore((s) => s.stripeCount)
  const stripeOpacity = useZebraStore((s) => s.stripeOpacity)
  const stripeDirection = useZebraStore((s) => s.stripeDirection)
  const colorScheme = useZebraStore((s) => s.colorScheme)
  const mappingMode = useZebraStore((s) => s.mappingMode)
  const modelBuffer = useModelStore((s) => s.modelBuffer)
  const modelVersion = useModelStore((s) => s.modelVersion)
  const loadedFiles = useModelStore((s) => s.loadedFiles)
  const { scene } = useThree()

  const originalMapRef = useRef<Map<string, THREE.Material>>(new Map())
  const zebraMatsRef = useRef<Map<string, THREE.ShaderMaterial>>(new Map())
  const textureRef = useRef<THREE.CanvasTexture | null>(null)
  const meshesRef = useRef<THREE.Mesh[]>([])

  useEffect(() => {
    if (!enabled) return
    useZebraStore.getState().setEnabled(false)
    useZebraStore.getState().resetToDefaults()
  }, [modelBuffer, modelVersion, loadedFiles])

  useEffect(() => {
    if (!scene) return

    if (!enabled) {
      if (meshesRef.current.length > 0) {
        restoreMeshes(meshesRef.current, originalMapRef.current)
      }
      disposeZebra(originalMapRef.current, zebraMatsRef.current, textureRef.current)
      textureRef.current = null
      meshesRef.current = []
      zebraMatsRef.current = new Map()
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

      const s = useZebraStore.getState()
      const texture = createZebraTexture(s.stripeCount, s.colorScheme)
      textureRef.current = texture

      meshesRef.current = meshes
      const zebraMats = applyZebraToMeshes(
        meshes,
        originalMapRef.current,
        texture,
        {
          stripeCount: s.stripeCount,
          stripeOpacity: s.stripeOpacity,
          stripeDirection: s.stripeDirection,
          colorScheme: s.colorScheme,
          mappingMode: s.mappingMode,
        },
      )
      zebraMatsRef.current = zebraMats
    }

    tryInit()
  }, [scene, enabled])

  useEffect(() => {
    if (!enabled || zebraMatsRef.current.size === 0) return
    if (!textureRef.current) return
    const newTex = createZebraTexture(stripeCount, colorScheme)
    textureRef.current.dispose()
    textureRef.current = newTex
    updateZebraTexture(zebraMatsRef.current, newTex)
  }, [enabled, stripeCount, colorScheme])

  useEffect(() => {
    if (!enabled || zebraMatsRef.current.size === 0) return
    updateZebraDirection(zebraMatsRef.current, stripeDirection)
  }, [enabled, stripeDirection])

  useEffect(() => {
    if (!enabled || zebraMatsRef.current.size === 0) return
    updateZebraOpacity(zebraMatsRef.current, stripeOpacity)
  }, [enabled, stripeOpacity])

  useEffect(() => {
    if (!enabled || zebraMatsRef.current.size === 0) return
    updateZebraMappingMode(zebraMatsRef.current, mappingMode)
  }, [enabled, mappingMode])

  useEffect(() => {
    return () => {
      if (meshesRef.current.length > 0) {
        restoreMeshes(meshesRef.current, originalMapRef.current)
      }
      disposeZebra(originalMapRef.current, zebraMatsRef.current, textureRef.current)
      textureRef.current = null
      meshesRef.current = []
      zebraMatsRef.current = new Map()
    }
  }, [scene])

  return null
}
