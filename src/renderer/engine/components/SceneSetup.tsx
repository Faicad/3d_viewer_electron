/* eslint-disable react-hooks/immutability */

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { EnvironmentManager } from '../environment/EnvironmentManager'
import { ShadowFloor } from '../environment/ShadowFloor'
import { useEngineStore } from '@/stores/engine-store'
import { useCrossSectionStore } from '@/stores/cross-section-store'
import { getSharedTextureCache } from '../material/MaterialFactory'
import { computeShadowFrustum } from './shadowFrustum'

export default function SceneSetup() {
  const { gl, scene } = useThree()
  const envRef = useRef<EnvironmentManager | null>(null)

  const selectedEnv = useEngineStore((s) => s.selectedEnv)
  const envRotation = useEngineStore((s) => s.envRotation)
  const envBackground = useEngineStore((s) => s.envBackground)

  useEffect(() => {
    const mgr = new EnvironmentManager(gl)
    mgr.initDefault()
    mgr.setBackgroundMode(envBackground as Parameters<EnvironmentManager['setBackgroundMode']>[0])
    mgr.applyBackground(scene, envRotation)
    scene.environment = mgr.currentTexture as THREE.Texture
    scene.environmentIntensity = useEngineStore.getState().envIntensity
    envRef.current = mgr

    return () => {
      scene.environment = null
      mgr.dispose()
      envRef.current = null
    }
  }, [gl, scene])

  const applyEnvToScene = (mgr: EnvironmentManager, rot: number) => {
    scene.environment = mgr.currentTexture
    scene.environmentRotation.set(Math.PI / 2, 0, rot, 'YXZ')
    scene.environmentIntensity = useEngineStore.getState().envIntensity
    mgr.applyBackground(scene, rot)
  }

  useEffect(() => {
    const mgr = envRef.current
    if (!mgr || !selectedEnv) return
    let cancelled = false
    mgr.setEnvironment(selectedEnv).then((_tex) => {
      if (cancelled) return
      const rot = useEngineStore.getState().envRotation
      applyEnvToScene(mgr, rot)

      // When switching to studio with a model already loaded, adapt floor height
      if ((selectedEnv === 'studio' || selectedEnv === '__cleanroom__') && useEngineStore.getState().modelBbox) {
        mgr.adaptStudioToModel(useEngineStore.getState().modelBbox!)
        applyEnvToScene(mgr, rot)
      }
    })
    return () => { cancelled = true }
  }, [selectedEnv, scene])

  // envRotation-only: update the Euler without re-loading the texture
  useEffect(() => {
    if (!scene.environment) return
    scene.environmentRotation.set(Math.PI / 2, 0, envRotation, 'YXZ')
    envRef.current?.setBackgroundRotation(scene, envRotation)
  }, [envRotation, scene])

  useEffect(() => {
    const mgr = envRef.current
    if (!mgr) return
    mgr.setBackgroundMode(envBackground as Parameters<EnvironmentManager['setBackgroundMode']>[0])
    mgr.applyBackground(scene, envRotation)
  }, [envBackground, scene])

  useEffect(() => {
    const unsub = useEngineStore.subscribe((state, prevState) => {
      if (state.envIntensity === prevState.envIntensity) return
      scene.environmentIntensity = state.envIntensity
    })
    return unsub
  }, [scene])

  // Shadow floor
  const shadowFloorRef = useRef<ShadowFloor | null>(null)
  useEffect(() => {
    const floor = new ShadowFloor()
    scene.add(floor.group)
    shadowFloorRef.current = floor

    // Apply initial state immediately — subscriptions may fire before the ref
    // is captured, so we read current values directly.
    const s = useEngineStore.getState()
    if (s.modelBbox) floor.configure(s.modelBbox, 'z')
    floor.setEnabled(s.shadowFloorEnabled)
    floor.setOpacity(s.shadowOpacity)

    return () => { scene.remove(floor.group); floor.dispose(); shadowFloorRef.current = null }
  }, [scene])
  useEffect(() => {
    const unsub = useEngineStore.subscribe((state, prevState) => {
      if (!state.modelBbox || !shadowFloorRef.current) return
      if (prevState.modelBbox &&
          state.modelBbox[0] === prevState.modelBbox[0] &&
          state.modelBbox[1] === prevState.modelBbox[1] &&
          state.modelBbox[2] === prevState.modelBbox[2] &&
          state.modelBbox[3] === prevState.modelBbox[3] &&
          state.modelBbox[4] === prevState.modelBbox[4] &&
          state.modelBbox[5] === prevState.modelBbox[5]) return

      shadowFloorRef.current.configure(state.modelBbox, 'z')

      // Adapt the procedural studio floor to model size
      const mgr = envRef.current
      if (!mgr) return
      const env = useEngineStore.getState().selectedEnv
      if (env !== 'studio' && env !== '__cleanroom__') return

      mgr.adaptStudioToModel(state.modelBbox)
      applyEnvToScene(mgr, useEngineStore.getState().envRotation)
    })
    return unsub
  }, [])
  useEffect(() => {
    const unsub = useEngineStore.subscribe((state, prevState) => {
      if (state.shadowFloorEnabled === prevState.shadowFloorEnabled) return
      shadowFloorRef.current?.setEnabled(state.shadowFloorEnabled)
    })
    return unsub
  }, [])
  useEffect(() => {
    const unsub = useEngineStore.subscribe((state, prevState) => {
      if (state.shadowOpacity === prevState.shadowOpacity) return
      shadowFloorRef.current?.setOpacity(state.shadowOpacity)
    })
    return unsub
  }, [])

  // Disable shadow floor while cross-section is active
  useEffect(() => {
    const unsub = useCrossSectionStore.subscribe((state, prevState) => {
      if (state.panelOpen === prevState.panelOpen) return
      const floor = shadowFloorRef.current
      if (!floor) return
      if (state.panelOpen) {
        floor.setEnabled(false)
      } else {
        floor.setEnabled(useEngineStore.getState().shadowFloorEnabled)
      }
    })
    return unsub
  }, [])

  // Anisotropy: sync engine-store → TextureCache
  useEffect(() => {
    const unsub = useEngineStore.subscribe((state, prevState) => {
      if (state.anisotropy === prevState.anisotropy) return
      getSharedTextureCache().maxAnisotropy = state.anisotropy
    })
    return unsub
  }, [])

  const dirLightRef = useRef<THREE.DirectionalLight>(null)
  const ambientRef = useRef<THREE.AmbientLight>(null)

  // Dynamically size the shadow camera frustum and near/far to match the model.
  useEffect(() => {
    const unsub = useEngineStore.subscribe((state, prevState) => {
      const bbox = state.modelBbox
      const light = dirLightRef.current
      if (!bbox || !light) return
      if (prevState.modelBbox &&
          bbox[0] === prevState.modelBbox[0] &&
          bbox[1] === prevState.modelBbox[1] &&
          bbox[2] === prevState.modelBbox[2] &&
          bbox[3] === prevState.modelBbox[3] &&
          bbox[4] === prevState.modelBbox[4] &&
          bbox[5] === prevState.modelBbox[5]) return
      const f = computeShadowFrustum(bbox, light.position)
      light.shadow.camera.left = f.left
      light.shadow.camera.right = f.right
      light.shadow.camera.top = f.top
      light.shadow.camera.bottom = f.bottom
      light.shadow.camera.near = f.near
      light.shadow.camera.far = f.far
      light.shadow.camera.updateProjectionMatrix()
    })
    return unsub
  }, [])

  // Shadow softness: maps UI 0–100% to light.shadow.radius (0–5)
  useEffect(() => {
    const s = useEngineStore.getState()
    const light = dirLightRef.current
    if (light) light.shadow.radius = (s.shadowSoftness / 100) * 5
    const unsub = useEngineStore.subscribe((state, prevState) => {
      if (state.shadowSoftness === prevState.shadowSoftness) return
      const l = dirLightRef.current
      if (l) l.shadow.radius = (state.shadowSoftness / 100) * 5
    })
    return unsub
  }, [])

  // Shadow intensity: maps UI 0–100% to ambient light (inverse, 0–0.3)
  useEffect(() => {
    const s = useEngineStore.getState()
    const ambient = ambientRef.current
    if (ambient) ambient.intensity = (1 - s.shadowIntensity / 100) * 0.3
    const unsub = useEngineStore.subscribe((state, prevState) => {
      if (state.shadowIntensity === prevState.shadowIntensity) return
      const a = ambientRef.current
      if (a) a.intensity = (1 - state.shadowIntensity / 100) * 0.3
    })
    return unsub
  }, [])

  return (
    <>
      <directionalLight
        ref={dirLightRef}
        color="#FFFFFF" intensity={0.8} position={[3, -3, 8]} up={[0, 0, 1]}
        castShadow
        shadow-mapSize-width={4096} shadow-mapSize-height={4096}
        shadow-camera-near={0.5} shadow-camera-far={500}
        shadow-bias={-0.001}
      />
      <ambientLight ref={ambientRef} color="#FFFFFF" intensity={0.15} />
    </>
  )
}
