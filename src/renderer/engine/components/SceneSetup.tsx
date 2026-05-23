/* eslint-disable react-hooks/immutability */

import { useEffect, useRef } from 'react'
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

  useEffect(() => {
    const mgr = envRef.current
    if (!mgr || !selectedEnv) return
    let cancelled = false
    const use4k = useEngineStore.getState().use4kEnvMaps
    mgr.setEnvironment(selectedEnv, use4k).then((tex) => {
      if (cancelled) return
      const rot = useEngineStore.getState().envRotation
      scene.environment = tex
      scene.environmentRotation.set(0, rot, 0)
      scene.environmentIntensity = useEngineStore.getState().envIntensity
      mgr.applyBackground(scene, rot)
    })
    return () => { cancelled = true }
  }, [selectedEnv, scene])

  // envRotation-only: update the Euler without re-loading the texture
  useEffect(() => {
    if (!scene.environment) return
    scene.environmentRotation.set(0, envRotation, 0)
    envRef.current?.setBackgroundRotation(scene, envRotation)
  }, [envRotation, scene])

  useEffect(() => {
    const mgr = envRef.current
    if (!mgr) return
    mgr.setBackgroundMode(envBackground as Parameters<EnvironmentManager['setBackgroundMode']>[0])
    mgr.applyBackground(scene, envRotation)
  }, [envBackground, scene])

  useEffect(() => {
    const unsub = useEngineStore.subscribe(
      (s) => s.envIntensity,
      (v) => { scene.environmentIntensity = v },
    )
    return unsub
  }, [scene])

  // Shadow floor
  const shadowFloorRef = useRef<ShadowFloor | null>(null)
  useEffect(() => {
    const floor = new ShadowFloor()
    scene.add(floor.group)
    shadowFloorRef.current = floor
    return () => { scene.remove(floor.group); floor.dispose(); shadowFloorRef.current = null }
  }, [scene])
  useEffect(() => {
    const unsub = useEngineStore.subscribe((s) => s.modelBbox, (bbox) => {
      if (!bbox || !shadowFloorRef.current) return
      shadowFloorRef.current.configure(bbox, 'y')
    }, { fireImmediately: true })
    return unsub
  }, [scene])
  useEffect(() => {
    const unsub = useEngineStore.subscribe((s) => s.shadowFloorEnabled, (v) => { shadowFloorRef.current?.setEnabled(v) }, { fireImmediately: true })
    return unsub
  }, [])
  useEffect(() => {
    const unsub = useEngineStore.subscribe((s) => s.shadowOpacity, (v) => { shadowFloorRef.current?.setOpacity(v) })
    return unsub
  }, [])

  // Re-apply environment when 4K toggle changes
  useEffect(() => {
    const unsub = useEngineStore.subscribe(
      (s) => s.use4kEnvMaps,
      (use4k) => {
        const mgr = envRef.current
        const env = useEngineStore.getState().selectedEnv
        if (!mgr || !env) return
        let cancelled = false
        mgr.setEnvironment(env, use4k).then((tex) => {
          if (cancelled) return
          scene.environment = tex
          scene.environmentRotation.set(0, useEngineStore.getState().envRotation, 0)
          scene.environmentIntensity = useEngineStore.getState().envIntensity
          mgr.applyBackground(scene, useEngineStore.getState().envRotation)
        })
        return () => { cancelled = true }
      },
    )
    return unsub
  }, [scene])

  // Anisotropy: sync engine-store → TextureCache
  useEffect(() => {
    const unsub = useEngineStore.subscribe(
      (s) => s.anisotropy,
      (v) => { getSharedTextureCache().maxAnisotropy = v },
    )
    return unsub
  }, [])

  return (
    <directionalLight
      color="#FFFFFF" intensity={0.8} position={[5, 5, 10]}
      castShadow
      shadow-mapSize-width={1024} shadow-mapSize-height={1024}
      shadow-camera-near={0.5} shadow-camera-far={500}
      shadow-camera-left={-50} shadow-camera-right={50}
      shadow-camera-top={50} shadow-camera-bottom={-50}
      shadow-bias={-0.001}
    />
  )
}
