/* eslint-disable react-hooks/immutability */

import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { EnvironmentManager } from '../environment/EnvironmentManager'
import { ShadowFloor } from '../environment/ShadowFloor'
import { useEngineStore } from '@/stores/engine-store'

/**
 * Scene-wide setup: IBL environment + single key directional light with shadows.
 *
 * IBL (via scene.environment) replaces ambient + fill + rim lights.
 * The remaining directional light provides a sharp specular lobe and
 * contact shadows.
 *
 * NOTE: This file disables react-hooks/immutability because
 * Three.js scene management inherently requires direct mutation
 * of scene properties (environment, background, etc.).
 */
export default function SceneSetup() {
  const { gl, scene } = useThree()
  const envRef = useRef<EnvironmentManager | null>(null)

  // IBL environment
  const selectedEnv = useEngineStore((s) => s.selectedEnv)
  const envRotation = useEngineStore((s) => s.envRotation)
  const envBackground = useEngineStore((s) => s.envBackground)

  // One-time: create EnvironmentManager + Tier-1 default
  useEffect(() => {
    const mgr = new EnvironmentManager(gl)
    mgr.initDefault()
    mgr.setBackgroundMode(envBackground as Parameters<EnvironmentManager['setBackgroundMode']>[0])
    mgr.applyBackground(scene, envRotation)
    scene.environment = mgr.currentTexture as THREE.Texture
    envRef.current = mgr

    return () => {
      mgr.dispose()
      envRef.current = null
    }
  }, [gl, scene])

  // React to environment preset changes
  useEffect(() => {
    const mgr = envRef.current
    if (!mgr || !selectedEnv) return

    let cancelled = false
    mgr.setEnvironment(selectedEnv).then((tex) => {
      if (cancelled) return
      scene.environment = tex
      scene.environmentRotation = envRotation
      scene.environmentIntensity = useEngineStore.getState().envIntensity
    })

    return () => { cancelled = true }
  }, [selectedEnv, envRotation, scene])

  // React to background mode changes
  useEffect(() => {
    const mgr = envRef.current
    if (!mgr) return
    mgr.setBackgroundMode(envBackground as Parameters<EnvironmentManager['setBackgroundMode']>[0])
    mgr.applyBackground(scene, envRotation)
  }, [envBackground, envRotation, scene])

  // React to envIntensity changes
  useEffect(() => {
    const unsub = useEngineStore.subscribe(
      (s) => s.envIntensity,
      (v) => { scene.environmentIntensity = v },
    )
    return unsub
  }, [scene])

  // ---------------------------------------------------------------------------
  // Shadow floor
  // ---------------------------------------------------------------------------

  const shadowFloorRef = useRef<ShadowFloor | null>(null)

  // One-time: create ShadowFloor and add to scene
  useEffect(() => {
    const floor = new ShadowFloor()
    scene.add(floor.group)
    shadowFloorRef.current = floor
    return () => {
      scene.remove(floor.group)
      floor.dispose()
      shadowFloorRef.current = null
    }
  }, [scene])

  // React to model bounding box changes
  useEffect(() => {
    const unsub = useEngineStore.subscribe(
      (s) => s.modelBbox,
      (bbox) => {
        const floor = shadowFloorRef.current
        if (!floor || !bbox) return
        const upAxis = 'y'
        floor.configure(bbox, upAxis)
      },
      { fireImmediately: false },
    )
    return unsub
  }, [scene])

  // Sync shadow floor enabled state
  useEffect(() => {
    const unsub = useEngineStore.subscribe(
      (s) => s.shadowFloorEnabled,
      (v) => { shadowFloorRef.current?.setEnabled(v) },
    )
    return unsub
  }, [])

  // Sync shadow floor opacity
  useEffect(() => {
    const unsub = useEngineStore.subscribe(
      (s) => s.shadowOpacity,
      (v) => { shadowFloorRef.current?.setOpacity(v) },
    )
    return unsub
  }, [])

  return (
    <>
      {/* Key light — the sole directional light providing specular lobe + shadows.
          IBL (via scene.environment) handles diffuse ambient and specular reflections,
          so fill / rim lights are no longer needed. */}
      <directionalLight
        color="#FFFFFF"
        intensity={0.8}
        position={[5, 5, 10]}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={0.5}
        shadow-camera-far={500}
        shadow-camera-left={-50}
        shadow-camera-right={50}
        shadow-camera-top={50}
        shadow-camera-bottom={-50}
        shadow-bias={-0.001}
      />
    </>
  )
}
