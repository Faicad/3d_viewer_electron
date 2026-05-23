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
    const s = useEngineStore.getState()
    composer.setSsaoEnabled(s.aoIntensity > 0)
    composer.setSmaaEnabled(s.smaaEnabled)
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
    let prevSsao = useEngineStore.getState().aoIntensity > 0
    let prevSmaa = useEngineStore.getState().smaaEnabled
    let prevAo = useEngineStore.getState().aoIntensity
    const unsub = useEngineStore.subscribe((state) => {
      const c = composerRef.current
      if (!c) return
      const ssao = state.aoIntensity > 0
      const smaa = state.smaaEnabled
      const ao = state.aoIntensity
      if (ssao === prevSsao && smaa === prevSmaa && ao === prevAo) return
      prevSsao = ssao
      prevSmaa = smaa
      prevAo = ao
      c.setSsaoEnabled(ssao)
      c.setSmaaEnabled(smaa)
      c.setAoIntensity(ao)
    })
    return unsub
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
