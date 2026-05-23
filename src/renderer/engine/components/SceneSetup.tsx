/* eslint-disable react-hooks/immutability */

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { EnvironmentManager } from '../environment/EnvironmentManager'
import { ShadowFloor } from '../environment/ShadowFloor'
import { useEngineStore } from '@/stores/engine-store'
import { getSharedTextureCache } from '../material/MaterialFactory'

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
    const use4k = useEngineStore.getState().use4kEnvMaps
    mgr.setEnvironment(selectedEnv, use4k).then((_tex) => {
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
    const unsub = useEngineStore.subscribe((state) => {
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
    let prevKey = ''
    const unsub = useEngineStore.subscribe((state) => {
      if (!state.modelBbox || !shadowFloorRef.current) return
      const b = state.modelBbox
      const key = `${b[0]},${b[1]},${b[2]},${b[3]},${b[4]},${b[5]}`
      if (key === prevKey) return
      prevKey = key

      shadowFloorRef.current.configure(b, 'z')

      // Adapt the procedural studio floor to model size
      const mgr = envRef.current
      if (!mgr) return
      const env = useEngineStore.getState().selectedEnv
      if (env !== 'studio' && env !== '__cleanroom__') return

      mgr.adaptStudioToModel(b)
      applyEnvToScene(mgr, useEngineStore.getState().envRotation)
    })
    return unsub
  }, [])
  useEffect(() => {
    const unsub = useEngineStore.subscribe((state) => { shadowFloorRef.current?.setEnabled(state.shadowFloorEnabled) })
    return unsub
  }, [])
  useEffect(() => {
    const unsub = useEngineStore.subscribe((state) => { shadowFloorRef.current?.setOpacity(state.shadowOpacity) })
    return unsub
  }, [])

  // Re-apply environment when 4K toggle changes
  useEffect(() => {
    const unsub = useEngineStore.subscribe((state, prevState) => {
      if (state.use4kEnvMaps === prevState.use4kEnvMaps) return
      const mgr = envRef.current
      const env = state.selectedEnv
      if (!mgr || !env) return
      let cancelled = false
      mgr.setEnvironment(env, state.use4kEnvMaps).then((tex) => {
        if (cancelled) return
        scene.environment = tex
        scene.environmentRotation.set(Math.PI / 2, 0, useEngineStore.getState().envRotation, 'YXZ')
        scene.environmentIntensity = useEngineStore.getState().envIntensity
        mgr.applyBackground(scene, useEngineStore.getState().envRotation)
      })
      return () => { cancelled = true }
    })
    return unsub
  }, [scene])

  // Anisotropy: sync engine-store → TextureCache
  useEffect(() => {
    const unsub = useEngineStore.subscribe((state) => { getSharedTextureCache().maxAnisotropy = state.anisotropy })
    return unsub
  }, [])

  const dirLightRef = useRef<THREE.DirectionalLight>(null)

  // Dynamically size the shadow camera frustum to match the model.
  // Keep a generous minimum so tiny models still get usable shadow-map coverage.
  useEffect(() => {
    const unsub = useEngineStore.subscribe((state) => {
      const bbox = state.modelBbox
      const light = dirLightRef.current
      if (!bbox || !light) return
      const extent = Math.max(
        bbox[3] - bbox[0],
        bbox[4] - bbox[1],
        bbox[5] - bbox[2],
      )
      // Scale frustum so the shadow extends well beyond the model footprint,
      // with a minimum of ±3 so the ortho depth range stays balanced.
      const half = Math.max(extent * 4, 3)
      light.shadow.camera.left = -half
      light.shadow.camera.right = half
      light.shadow.camera.top = half
      light.shadow.camera.bottom = -half
      light.shadow.camera.updateProjectionMatrix()
    })
    return unsub
  }, [])

  return (
    <directionalLight
      ref={dirLightRef}
      color="#FFFFFF" intensity={0.8} position={[3, -3, 8]} up={[0, 0, 1]}
      castShadow
      shadow-mapSize-width={1024} shadow-mapSize-height={1024}
      shadow-camera-near={0.5} shadow-camera-far={500}
      shadow-bias={-0.001}
    />
  )
}
