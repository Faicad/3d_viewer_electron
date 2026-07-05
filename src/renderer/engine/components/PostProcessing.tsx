/* eslint-disable react-hooks/immutability */

import { useEffect, useRef } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { AdaptiveComposer } from '../composer/AdaptiveComposer'
import { useEngineStore } from '@/stores/engine-store'

export default function PostProcessing() {
  const { gl, scene, camera, size } = useThree()
  const composerRef = useRef<AdaptiveComposer | null>(null)

  // Create composer on mount
  useEffect(() => {
    // Set outputColorSpace BEFORE composer creation so its FBOs use linear
    // color space, preventing the background shader from premature sRGB
    // encoding (which would clash with ToneMappingEffect's linear input).
    gl.outputColorSpace = THREE.LinearSRGBColorSpace
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
      gl.outputColorSpace = THREE.SRGBColorSpace
    }
    return () => {
      gl.toneMapping = THREE.NeutralToneMapping
      gl.outputColorSpace = THREE.SRGBColorSpace
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
    const s = useEngineStore.getState()
    if (s.postProcessingEnabled) {
      const composer = composerRef.current
      if (!composer) return
      composer.render(delta)
    } else {
      // CAD mode guard: R3F Canvas <shadows> prop or other internals may
      // re-enable shadowMap during interaction cycles. Force off each frame.
      if (!s.studioMode) gl.shadowMap.enabled = false
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
        gl.outputColorSpace = THREE.LinearSRGBColorSpace
        gl.autoClear = false
      } else {
        gl.toneMapping = THREE.NeutralToneMapping
        gl.outputColorSpace = THREE.SRGBColorSpace
        gl.autoClear = true
      }
    })
    return unsub
  }, [gl])

  // Sync renderer state when Studio/CAD mode is toggled (Alt+P uppercase).
  // Studio → post-processing on,  localClipping off, shadows on
  // CAD    → post-processing off, localClipping on,  shadows off
  useEffect(() => {
    const unsub = useEngineStore.subscribe((state, prevState) => {
      if (state.studioMode === prevState.studioMode) return
      if (state.studioMode) {
        gl.toneMapping = THREE.NoToneMapping
        gl.autoClear = false
        gl.localClippingEnabled = false
        gl.shadowMap.enabled = true
      } else {
        gl.toneMapping = THREE.NeutralToneMapping
        gl.autoClear = true
        gl.localClippingEnabled = true
        gl.shadowMap.enabled = false
      }
    })
    return unsub
  }, [gl])

  // Keyboard shortcut: Alt+p (lowercase) toggles post-processing only.
  // Keyboard shortcut: Alt+P (uppercase, with Shift) toggles Studio/CAD mode.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return

      if (e.altKey && e.key === 'p') {
        // Alt+p (lowercase) — toggle post-processing only
        e.preventDefault()
        const s = useEngineStore.getState()
        const next = !s.postProcessingEnabled
        s.setPostProcessingEnabled(next)
        return
      }

      if (e.altKey && e.key === 'P') {
        // Alt+P (uppercase, with Shift) — toggle Studio/CAD mode
        e.preventDefault()
        const s = useEngineStore.getState()
        const next = !s.studioMode
        s.setStudioMode(next)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return null
}
