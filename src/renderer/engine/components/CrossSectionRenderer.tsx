import { useEffect, useRef } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useCrossSectionStore } from '@/stores/cross-section-store'
import { useModelStore } from '@/stores/model-store'
import {
  type CrossSectionObjects,
  buildPlanes,
  cameraDirs,
  createStencilGroup,
  createCapMesh,
  createClipPlaneVisual,
  computeVisibleBBox,
  collectModelMeshes,
  applyModelClippingPlanes,
  syncPlanes,
  findObjectColor,
  PLANE_COLORS,
  cleanupCrossSectionObjects,
} from './CrossSectionCore'

export default function CrossSectionRenderer() {
  const panelOpen = useCrossSectionStore((s) => s.panelOpen)
  const modelBuffer = useModelStore((s) => s.modelBuffer)
  const loadedFiles = useModelStore((s) => s.loadedFiles)
  const { scene, camera } = useThree()
  const modelVersion = useModelStore((s) => s.modelVersion)

  const objsRef = useRef<CrossSectionObjects | null>(null)

  useEffect(() => {
    if (!panelOpen) return
    useCrossSectionStore.getState().setPanelOpen(false)
    useCrossSectionStore.getState().resetToDefaults()
  }, [modelBuffer, modelVersion, loadedFiles])

  useEffect(() => {
    if (!scene) return

    if (!panelOpen) {
      if (objsRef.current) {
        cleanupCrossSectionObjects(objsRef.current, scene)
        objsRef.current = null
      }
      return
    }

    let retries = 0
    const maxRetries = 30

    const tryInit = () => {
      if (!scene) return
      const bbox = computeVisibleBBox(scene)
      if (!bbox) {
        if (++retries < maxRetries) { setTimeout(tryInit, 100); return }
        return
      }
      const meshData = collectModelMeshes(scene)
      if (meshData.length === 0) {
        if (++retries < maxRetries) { setTimeout(tryInit, 100); return }
        return
      }

      const bboxSize = bbox.getSize(new THREE.Vector3())
      const dirs = cameraDirs(
        camera instanceof THREE.PerspectiveCamera
          ? camera.position
          : new THREE.Vector3(0, 0, 0),
        bbox.getCenter(new THREE.Vector3()),
      )
      const csStore = useCrossSectionStore.getState()
      const positions: [number, number, number] = [
        csStore.planeX.position,
        csStore.planeY.position,
        csStore.planeZ.position,
      ]
      const planes = buildPlanes(bbox, dirs, positions)

      applyModelClippingPlanes(meshData, planes)

      const stencilGroups: THREE.Group[] = []
      const capPlanes: THREE.Mesh[] = []
      const clipPlaneVisuals: THREE.Mesh[] = []
      const objectColor = findObjectColor(meshData)

      for (let i = 0; i < 3; i++) {
        const sg = createStencilGroup(meshData, planes, 0.1 + i * 0.1)
        stencilGroups.push(sg); scene.add(sg)

        const otherPlanesForCap = planes.filter((_, j) => j !== i)
        const color = csStore.useObjectColor ? objectColor : new THREE.Color(PLANE_COLORS[i])
        const cap = createCapMesh(planes[i], otherPlanesForCap, color, bboxSize, 0.11 + i * 0.1)
        capPlanes.push(cap); scene.add(cap)

        const vis = createClipPlaneVisual(planes[i], otherPlanesForCap, color, bboxSize)
        vis.visible = csStore.showClipPlane
        clipPlaneVisuals.push(vis); scene.add(vis)
      }

      objsRef.current = { stencilGroups, capPlanes, clipPlaneVisuals, planes, meshData, bbox }
    }

    tryInit()
  }, [scene, camera, panelOpen])

  useFrame(() => {
    if (!panelOpen || !objsRef.current || !(camera instanceof THREE.PerspectiveCamera)) return
    const store = useCrossSectionStore.getState()
    const bboxCenter = objsRef.current.bbox.getCenter(new THREE.Vector3())
    const currentDirs = cameraDirs(camera.position, bboxCenter)
    const positions: [number, number, number] = [
      store.planeX.position,
      store.planeY.position,
      store.planeZ.position,
    ]
    syncPlanes(objsRef.current, currentDirs, positions)

    for (const vis of objsRef.current.clipPlaneVisuals) {
      if (vis) vis.visible = store.showClipPlane
    }
    if (store.useObjectColor) {
      const oc = findObjectColor(objsRef.current.meshData)
      for (let i = 0; i < 3; i++) {
        (objsRef.current.capPlanes[i].material as THREE.MeshBasicMaterial).color.copy(oc)
      }
    } else {
      for (let i = 0; i < 3; i++) {
        (objsRef.current.capPlanes[i].material as THREE.MeshBasicMaterial).color.set(PLANE_COLORS[i])
      }
    }
  })

  useEffect(() => {
    return () => {
      if (objsRef.current && scene) {
        cleanupCrossSectionObjects(objsRef.current, scene)
        objsRef.current = null
      }
    }
  }, [scene])

  return null
}
