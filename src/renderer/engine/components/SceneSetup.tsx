/* eslint-disable react-hooks/immutability */

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { EnvironmentManager } from '../environment/EnvironmentManager'
import { ShadowFloor } from '../environment/ShadowFloor'
import { Heatbed } from '../heatbed/Heatbed'
import {
  DEFAULT_BED_SIZE, calculateGridStep, computePlateLayout, squareBedDimensions,
} from '../heatbed/types'
import type { PlateLayoutEntry } from '../heatbed/types'
import { useEngineStore } from '@/stores/engine-store'
import { useModelStore } from '@/stores/model-store'
import { getSharedTextureCache } from '../material/MaterialFactory'
import { computeShadowFrustum } from './shadowFrustum'

/** Format plate dimensions for the label sprite (dims are in mm for 3MF). */
function dimensionsLabel(dims: BedDimensions): string {
  const w = Math.round(dims.width)
  const d = Math.round(dims.depth)
  return w === d ? `${w} × ${w} mm` : `${w} × ${d} mm`
}

export default function SceneSetup() {
  const { gl, scene, camera } = useThree()
  const envRef = useRef<EnvironmentManager | null>(null)

  const selectedEnv = useEngineStore((s) => s.selectedEnv)
  const pendingCustomLoad = useEngineStore((s) => s.pendingCustomLoad)
  const clearPendingCustomLoad = useEngineStore((s) => s.clearPendingCustomLoad)
  const envRotation = useEngineStore((s) => s.envRotation)
  const envBackground = useEngineStore((s) => s.envBackground)
  const activeUpAxis = useModelStore((s) => s.activeUpAxis)
  const movieMode = useEngineStore((s) => s.movieMode)

  useEffect(() => {
    const mgr = new EnvironmentManager(gl)
    mgr.initDefault()
    const initAxis = useModelStore.getState().activeUpAxis
    const initXRot = initAxis === 'y' ? 0 : Math.PI / 2
    mgr.setBackgroundMode(envBackground as Parameters<EnvironmentManager['setBackgroundMode']>[0])
    mgr.applyBackground(scene, envRotation, initAxis)
    scene.environment = mgr.currentTexture as THREE.Texture
    scene.environmentRotation.set(initXRot, 0, envRotation, 'YXZ')
    scene.environmentIntensity = useEngineStore.getState().envIntensity
    envRef.current = mgr

    return () => {
      scene.environment = null
      mgr.dispose()
      envRef.current = null
    }
  }, [gl, scene])

  const applyEnvToScene = (mgr: EnvironmentManager, rot: number) => {
    const axis = useModelStore.getState().activeUpAxis
    const exr = axis === 'y' ? 0 : Math.PI / 2
    scene.environment = mgr.currentTexture
    scene.environmentRotation.set(exr, 0, rot, 'YXZ')
    scene.environmentIntensity = useEngineStore.getState().envIntensity
    mgr.applyBackground(scene, rot, axis)
  }

  useEffect(() => {
    const mgr = envRef.current
    if (!mgr || !selectedEnv) return
    let cancelled = false
    mgr.fadeEnvironment(scene, camera, 1000, async () => {
      // For synchronous sources (studio, cleanroom), avoid await to prevent
      // a microtask gap that would let other effects (envBackground) read
      // a stale _currentTex (64px initial) before adaptStudioToModel runs.
      if (selectedEnv === 'studio' || selectedEnv === '__cleanroom__') {
        mgr.setEnvironment(selectedEnv)
      } else {
        await mgr.setEnvironment(selectedEnv)
      }
      if (cancelled) return

      // Adapt studio BEFORE applyEnvToScene, so the first frame (and any
      // interleaved effects like envBackground) see the already-adapted
      // high-res PMREM rather than the 64px initial version.
      const bbox = useEngineStore.getState().modelBbox
      if ((selectedEnv === 'studio' || selectedEnv === '__cleanroom__') && bbox) {
        mgr.adaptStudioToModel(bbox)
      }
      const rot = useEngineStore.getState().envRotation
      applyEnvToScene(mgr, rot)
    }, movieMode)
    return () => { cancelled = true }
  }, [selectedEnv, scene, camera, movieMode])

  // Load custom environment map from local file when a new one is added
  useEffect(() => {
    const mgr = envRef.current
    if (!mgr || !pendingCustomLoad) return
    const { id, path, name } = pendingCustomLoad
    let cancelled = false
    ;(async () => {
      try {
        const result = await window.electronAPI.readFile(path)
        if (cancelled || !result.success || !result.data) return
        await mgr.setEnvironmentFromFile(id, name, result.data)
        if (cancelled) return
        mgr.fadeEnvironment(scene, camera, 1000, async () => {
          if (cancelled) return
          applyEnvToScene(mgr, useEngineStore.getState().envRotation)
          clearPendingCustomLoad()
        }, movieMode)
      } catch (err) {
        console.warn('[SceneSetup] Failed to load custom environment:', err)
      }
    })()
    return () => { cancelled = true }
  }, [pendingCustomLoad, scene, camera, movieMode])

  // envRotation / upAxis: update the Euler without re-loading the texture
  useEffect(() => {
    if (!scene.environment) return
    const exr = activeUpAxis === 'y' ? 0 : Math.PI / 2
    scene.environmentRotation.set(exr, 0, envRotation, 'YXZ')
    envRef.current?.setBackgroundRotation(scene, envRotation, activeUpAxis)
    // Keep shadow floor synced with up-axis
    const bbox = useEngineStore.getState().modelBbox
    if (bbox && shadowFloorRef.current) {
      shadowFloorRef.current.configure(bbox, activeUpAxis)
    }
  }, [envRotation, activeUpAxis, scene])

  useEffect(() => {
    const mgr = envRef.current
    if (!mgr) return
    mgr.setBackgroundMode(envBackground as Parameters<EnvironmentManager['setBackgroundMode']>[0])
    mgr.applyBackground(scene, envRotation, activeUpAxis)
  }, [envBackground, activeUpAxis, scene])

  useEffect(() => {
    const unsub = useEngineStore.subscribe((state, prevState) => {
      if (state.envIntensity === prevState.envIntensity) return
      // Don't interrupt an active fade animation
      if (envRef.current?.isFading()) return
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
    if (s.modelBbox) floor.configure(s.modelBbox, activeUpAxis)
    // Shadow floor is only visible when enabled AND heatbed is not shown
    floor.setEnabled(s.shadowFloorEnabled && !s.showHeatbed)
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

      shadowFloorRef.current.configure(state.modelBbox, useModelStore.getState().activeUpAxis)

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
      if (state.shadowFloorEnabled === prevState.shadowFloorEnabled &&
          state.showHeatbed === prevState.showHeatbed) return
      // Shadow floor is only visible when enabled AND heatbed is NOT shown.
      // When heatbed is visible, shadows fall on the heatbed surface instead.
      const effective = state.shadowFloorEnabled && !state.showHeatbed
      shadowFloorRef.current?.setEnabled(effective)
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

  // ---------------------------------------------------------------------------
  // Heatbed(s)
  // ---------------------------------------------------------------------------
  // Two independent paths:
  //   a) Multi-plate (Bambu 3MF): one Heatbed per plate, positioned in a grid
  //   b) Single-bed fallback: one square Heatbed (non-Bambu files)
  const heatbedsRef = useRef<Map<number, Heatbed>>(new Map())
  const singleHeatbedRef = useRef<Heatbed | null>(null)

  // --- Multi-plate heatbeds (Bambu 3MF path) ---
  useEffect(() => {
    const store = useEngineStore.getState()
    const configs = store.bambuPlateConfigs

    // Only run when multi-plate is active
    if (!configs || configs.length === 0) return

    // Remove any existing single heatbed
    if (singleHeatbedRef.current) {
      scene.remove(singleHeatbedRef.current.group)
      singleHeatbedRef.current.dispose()
      singleHeatbedRef.current = null
    }

    // Build plate dims map for layout
    const plateDims = new Map<number, { width: number; depth: number }>()
    for (const c of configs) {
      plateDims.set(c.plateId, { width: c.dimensions.width, depth: c.dimensions.depth })
    }
    const layout = computePlateLayout(plateDims)

    // Create layout lookup
    const layoutByPlateId = new Map<number, PlateLayoutEntry>()
    for (const entry of layout) {
      layoutByPlateId.set(entry.plateId, entry)
    }

    // Create one Heatbed per plate
    for (const config of configs) {
      const layEntry = layoutByPlateId.get(config.plateId)
      if (!layEntry) continue

      const heatbed = new Heatbed({
        dimensions: config.dimensions,
        gridStep: calculateGridStep(config.dimensions),
      })
      heatbed.setPosition(layEntry.centerX, layEntry.centerY)
      heatbed.setVisible(store.showHeatbed)
      heatbed.setSelected(config.selected)
      heatbed.setLabel(dimensionsLabel(config.dimensions))
      scene.add(heatbed.group)
      heatbedsRef.current.set(config.plateId, heatbed)
    }

    return () => {
      for (const hb of heatbedsRef.current.values()) {
        scene.remove(hb.group)
        hb.dispose()
      }
      heatbedsRef.current.clear()
    }
  }, [scene])

  // React to bambuPlateConfigs changes
  useEffect(() => {
    const unsub = useEngineStore.subscribe((state, prevState) => {
      if (state.bambuPlateConfigs === prevState.bambuPlateConfigs) return

      // Dispose current heatbeds
      for (const hb of heatbedsRef.current.values()) {
        scene.remove(hb.group)
        hb.dispose()
      }
      heatbedsRef.current.clear()
      if (singleHeatbedRef.current) {
        scene.remove(singleHeatbedRef.current.group)
        singleHeatbedRef.current.dispose()
        singleHeatbedRef.current = null
      }

      const configs = state.bambuPlateConfigs
      if (!configs || configs.length === 0) return

      const plateDims = new Map<number, { width: number; depth: number }>()
      for (const c of configs) {
        plateDims.set(c.plateId, { width: c.dimensions.width, depth: c.dimensions.depth })
      }
      const layout = computePlateLayout(plateDims)
      const layoutByPlateId = new Map<number, PlateLayoutEntry>()
      for (const entry of layout) {
        layoutByPlateId.set(entry.plateId, entry)
      }

      for (const config of configs) {
        const layEntry = layoutByPlateId.get(config.plateId)
        if (!layEntry) continue

        const heatbed = new Heatbed({
          dimensions: config.dimensions,
          gridStep: calculateGridStep(config.dimensions),
        })
        heatbed.setPosition(layEntry.centerX, layEntry.centerY)
        heatbed.setVisible(state.showHeatbed)
        heatbed.setSelected(config.selected)
        heatbed.setLabel(dimensionsLabel(config.dimensions))
        scene.add(heatbed.group)
        heatbedsRef.current.set(config.plateId, heatbed)
      }
    })
    return unsub
  }, [scene])

  // --- Single heatbed (non-Bambu fallback path) ---
  useEffect(() => {
    const configs = useEngineStore.getState().bambuPlateConfigs
    if (configs && configs.length > 0) return // multi-plate path handles it

    const store = useEngineStore.getState()
    const sizeMM = Math.round(store.bedSize * store.bedRawToMM)
    const heatbed = new Heatbed({
      dimensions: squareBedDimensions(store.bedSize || DEFAULT_BED_SIZE),
    })
    heatbed.setVisible(store.showHeatbed)
    heatbed.setSelected(true)
    heatbed.setLabel(`${sizeMM} × ${sizeMM} mm`)
    scene.add(heatbed.group)
    singleHeatbedRef.current = heatbed

    return () => {
      scene.remove(heatbed.group)
      heatbed.dispose()
      singleHeatbedRef.current = null
    }
  }, [scene])

  // Multi-plate: react to selectedPlateId changes
  useEffect(() => {
    const unsub = useEngineStore.subscribe((state, prevState) => {
      if (state.selectedPlateId === prevState.selectedPlateId) return
      for (const [pid, hb] of heatbedsRef.current) {
        hb.setSelected(pid === state.selectedPlateId)
      }
    })
    return unsub
  }, [])

  // showHeatbed toggle (applies to both paths)
  useEffect(() => {
    const unsub = useEngineStore.subscribe((state, prevState) => {
      if (state.showHeatbed === prevState.showHeatbed) return
      for (const hb of heatbedsRef.current.values()) {
        hb.setVisible(state.showHeatbed)
      }
      singleHeatbedRef.current?.setVisible(state.showHeatbed)
      // Heatbed and shadow floor are mutually exclusive:
      // when heatbed is visible, shadows fall on the heatbed surface;
      // when hidden, the shadow floor takes over (if enabled).
      shadowFloorRef.current?.setEnabled(
        useEngineStore.getState().shadowFloorEnabled && !state.showHeatbed,
      )
    })
    return unsub
  }, [])

  // Single-bed: react to bedSize / bedRawToMM changes
  useEffect(() => {
    const unsub = useEngineStore.subscribe((state, prevState) => {
      // Skip when multi-plate is active
      if (state.bambuPlateConfigs && state.bambuPlateConfigs.length > 0) return
      if (state.bedSize === prevState.bedSize && state.bedRawToMM === prevState.bedRawToMM) return
      const sizeMM = state.bedSize * state.bedRawToMM
      singleHeatbedRef.current?.setConfig({
        dimensions: squareBedDimensions(state.bedSize),
        gridStep: calculateGridStep(
          squareBedDimensions(sizeMM),
        ) * (1 / state.bedRawToMM), // mm → scene units
      })
      singleHeatbedRef.current?.setLabel(`${Math.round(sizeMM)} × ${Math.round(sizeMM)} mm`)
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
      // R3F's `up` prop on <directionalLight> sets Object3D.up, NOT
      // shadow.camera.up. Without this, the shadow camera always uses
      // the Three.js default (0,1,0), which produces wrong shadow
      // orientation in Z-up scenes.
      light.shadow.camera.up.set(
        0,
        useModelStore.getState().activeUpAxis === 'y' ? 1 : 0,
        useModelStore.getState().activeUpAxis === 'z' ? 1 : 0,
      )
      // Dynamic shadow bias: use small depth bias for flat surfaces + normalBias
      // for sloped surfaces, avoiding Peter Panning while preventing acne.
      const mapSize = light.shadow.mapSize.width
      const texelSize = (2 * f.right) / mapSize // f.right === half
      light.shadow.bias = -(Math.max(texelSize * 0.2, 0.0001))
      light.shadow.normalBias = Math.max(texelSize * 0.5, 0.0002)
      light.shadow.camera.updateProjectionMatrix()
    })
    return unsub
  }, [])

  // Recompute shadow frustum when up-axis changes (light position changes with it)
  useEffect(() => {
    const light = dirLightRef.current
    const bbox = useEngineStore.getState().modelBbox
    if (!bbox || !light) return
    const f = computeShadowFrustum(bbox, light.position)
    light.shadow.camera.left = f.left
    light.shadow.camera.right = f.right
    light.shadow.camera.top = f.top
    light.shadow.camera.bottom = f.bottom
    light.shadow.camera.near = f.near
    light.shadow.camera.far = f.far
    light.shadow.camera.up.set(
      0,
      activeUpAxis === 'y' ? 1 : 0,
      activeUpAxis === 'z' ? 1 : 0,
    )
    const mapSize = light.shadow.mapSize.width
    const texelSize = (2 * f.right) / mapSize
    light.shadow.bias = -(Math.max(texelSize * 0.2, 0.0001))
    light.shadow.normalBias = Math.max(texelSize * 0.5, 0.0002)
    light.shadow.camera.updateProjectionMatrix()
  }, [activeUpAxis])

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
        color="#FFFFFF"
        intensity={0.8}
        position={activeUpAxis === 'y' ? [3, 8, -3] as const : [3, -3, 8] as const}
        up={activeUpAxis === 'y' ? [0, 1, 0] : [0, 0, 1]}
        castShadow
        shadow-mapSize-width={4096} shadow-mapSize-height={4096}
        shadow-camera-near={0.5} shadow-camera-far={500}
        shadow-bias={-0.001}
      />
      <ambientLight ref={ambientRef} color="#FFFFFF" intensity={0.15} />
    </>
  )
}
