/* eslint-disable react-hooks/immutability */

import { useEffect, useRef } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { toast } from 'sonner'
import { AdaptiveComposer } from '../composer/AdaptiveComposer'
import { useEngineStore } from '@/stores/engine-store'

export default function PostProcessing() {
  const { gl, scene, camera, size } = useThree()
  const composerRef = useRef<AdaptiveComposer | null>(null)

  // Create composer on mount
  useEffect(() => {
    const composer = new AdaptiveComposer(gl, scene, camera as THREE.PerspectiveCamera)
    gl.toneMapping = THREE.NoToneMapping
    const s = useEngineStore.getState()
    composer.setSmaaEnabled(s.smaaEnabled)
    composerRef.current = composer
    // EffectComposer's constructor always sets autoClear=false, but when
    // post-processing is disabled we need autoClear=true for gl.render().
    // Sync state here because the store subscribe (see below) only fires
    // on *changes* — it won't run after a camera-triggered re-init.
    if (!s.postProcessingEnabled) {
      gl.autoClear = true
      gl.toneMapping = THREE.NeutralToneMapping
    }
    return () => {
      gl.toneMapping = THREE.NeutralToneMapping
      gl.autoClear = true
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
    const composer = composerRef.current
    if (!composer) return
    if (useEngineStore.getState().postProcessingEnabled) {
      composer.render(delta)
    } else {
      gl.render(scene, camera)
    }
  }, 1)

  // Store subscriptions
  useEffect(() => {
    const unsub = useEngineStore.subscribe((state, prevState) => {
      const c = composerRef.current
      if (!c) return
      if (state.smaaEnabled === prevState.smaaEnabled) return
      c.setSmaaEnabled(state.smaaEnabled)
    })
    return unsub
  }, [])

  useEffect(() => {
    const unsub = useEngineStore.subscribe((state, prevState) => {
      const c = composerRef.current
      if (!c) return
      if (state.toneMappingMode === prevState.toneMappingMode) return
      c.setToneMappingMode(state.toneMappingMode)
    })
    return unsub
  }, [])

  // Sync renderer state when post-processing is toggled.
  // Enabled  → composer handles rendering: NoToneMapping, autoClear=false
  // Disabled → gl.render() directly:       NeutralToneMapping, autoClear=true
  //
  // Both paths use Neutral tone mapping (composer via ToneMappingEffect,
  // direct via built-in NeutralToneMapping), so toneMappingExposure=1.0
  // produces identical brightness — no compensation needed.
  //
  // autoClear: EffectComposer sets renderer.autoClear=false in its ctor.
  // When bypassing the composer, gl.render() needs autoClear=true or the
  // depth buffer from the previous frame culls new geometry.
  useEffect(() => {
    const unsub = useEngineStore.subscribe((state, prevState) => {
      if (state.postProcessingEnabled === prevState.postProcessingEnabled) return
      if (state.postProcessingEnabled) {
        gl.toneMapping = THREE.NoToneMapping
        gl.autoClear = false
      } else {
        gl.toneMapping = THREE.NeutralToneMapping
        gl.autoClear = true
      }
    })
    return unsub
  }, [gl])

  // Keyboard shortcut: Alt+P to toggle post-processing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
      if (e.altKey && e.key === 'p') {
        e.preventDefault()
        const s = useEngineStore.getState()
        const next = !s.postProcessingEnabled
        s.setPostProcessingEnabled(next)
        toast.info(next ? '后处理已开启' : '后处理已关闭')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return null
}
