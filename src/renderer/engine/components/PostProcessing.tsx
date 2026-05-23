/* eslint-disable react-hooks/immutability */

import { useEffect, useRef } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { AdaptiveComposer } from '../composer/AdaptiveComposer'
import { useEngineStore } from '@/stores/engine-store'

export default function PostProcessing() {
  const { gl, scene, camera, size, controls } = useThree()
  const composerRef = useRef<AdaptiveComposer | null>(null)

  // Create composer on mount
  useEffect(() => {
    const composer = new AdaptiveComposer(gl, scene, camera as THREE.PerspectiveCamera)
    // Disable renderer tone mapping — composer handles it
    gl.toneMapping = THREE.NoToneMapping
    // SSAO requires PerspectiveCamera
    if (camera.isPerspectiveCamera) {
      composer.enableSsao(scene, camera as THREE.PerspectiveCamera)
    }
    // Apply initial store values
    composer.setSsaoEnabled(useEngineStore.getState().ssaoEnabled)
    composer.setSmaaEnabled(useEngineStore.getState().smaaEnabled)
    const s = useEngineStore.getState()
    composer.setShadowMaskEnabled(s.shadowIntensity > 0)
    composer.setShadowMaskOpacity(s.shadowIntensity / 100)
    composer.setShadowMaskSoftness(s.shadowSoftness / 100)
    composerRef.current = composer
    return () => {
      gl.toneMapping = THREE.ACESFilmicToneMapping
      composer.dispose()
      composerRef.current = null
    }
  }, [gl, scene, camera])

  // Resize
  useEffect(() => {
    composerRef.current?.setSize(size.width, size.height)
  }, [size.width, size.height])

  // Render loop — priority > 0 disables R3F's internal gl.render() so
  // the composer is the sole renderer. State is still flushed each frame.
  useFrame((_, delta) => {
    composerRef.current?.render(delta)
  }, 1)

  // Store subscriptions
  useEffect(() => {
    const unsub1 = useEngineStore.subscribe(
      (s) => s.ssaoEnabled,
      (v) => composerRef.current?.setSsaoEnabled(v),
    )
    const unsub2 = useEngineStore.subscribe(
      (s) => s.smaaEnabled,
      (v) => composerRef.current?.setSmaaEnabled(v),
    )
    const unsub3 = useEngineStore.subscribe(
      (s) => s.aoIntensity,
      (v) => {
        const c = composerRef.current
        if (!c) return
        c.setSsaoEnabled(v > 0)
        c.setAoIntensity(v)
      },
    )
    const unsub4 = useEngineStore.subscribe(
      (s) => s.shadowIntensity,
      (v) => {
        const c = composerRef.current
        if (!c) return
        c.setShadowMaskEnabled(v > 0)
        c.setShadowMaskOpacity(v / 100)
      },
    )
    const unsub5 = useEngineStore.subscribe(
      (s) => s.shadowSoftness,
      (v) => {
        composerRef.current?.setShadowMaskSoftness(v / 100)
      },
    )
    return () => { unsub1(); unsub2(); unsub3(); unsub4(); unsub5() }
  }, [])

  // Interaction degradation via OrbitControls events
  useEffect(() => {
    const ctrl = controls as OrbitControlsImpl | null
    if (!ctrl) return
    const onStart = () => composerRef.current?.onInteractionStart()
    const onEnd = () => composerRef.current?.onInteractionEnd()
    ctrl.addEventListener('start', onStart)
    ctrl.addEventListener('end', onEnd)
    return () => {
      ctrl.removeEventListener('start', onStart)
      ctrl.removeEventListener('end', onEnd)
    }
  }, [controls])

  return null
}
