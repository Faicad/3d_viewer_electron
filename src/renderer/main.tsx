import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from 'sonner'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { useModelStore } from '@/stores/model-store'
import { useAnimationStore } from '@/stores/animation-store'
import { useEngineStore } from '@/stores/engine-store'
import { collectSceneMeshes, meshesToStl } from '@/engine/exporters'
import { useMaterialStore } from '@/stores/material-store'
import { useToolStore } from '@/stores/tool-store'
import { useSelectionStore } from '@/stores/selection-store'
import { useUIStore } from '@/stores/ui-store'
import { useSvgWorkspaceStore, parseSvgViewBox, parseSvgLayers } from '@/stores/svg-workspace-store'
import { generateSvgThumbnail } from '@/lib/thumbnail-cache/thumbnailGenerator'
import { putThumbnail } from '@/lib/thumbnail-cache/thumbnailCache'
import { clearStepCache, memCache } from '@/lib/step-converter/stepCache'
import { initLogger } from '@/lib/logger'
import { detectFormat, FORMAT_MAP, isStepFile } from '@/config/file-formats'
import { loadFormat, parseStepHeader } from '@/engine/formatLoaders'
import { setCachedResult } from '@/engine/loaderResultCache'
import { stepToGlbCached } from '@/lib/step-converter'
import { scadToStl } from '@/lib/scad-converter'
import { meshesToGlb } from '@/engine/exporters'
import { collectPartKeys, findNodeInTree } from '@/lib/scene-tree-utils'
import { MATERIAL_PRESETS, getPreset } from '@/engine/material/presets'
import * as THREE from 'three'
import gsap from 'gsap'
import App from './App'
import './i18n'
import './index.css'

// Polyfill crypto.randomUUID
if (globalThis.crypto && !globalThis.crypto.randomUUID) {
  globalThis.crypto.randomUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
    })
  }
}

// Expose GSAP and THREE on window for AI-injected code
window.__gsap = gsap
window.__THREE = THREE

window.__demoGSAPRotate = () => {
  import('@/ai-injection/demos/gsap-rotate-demo').then(({ buildGSAPRotatePayload }) => {
    const msg = JSON.parse(buildGSAPRotatePayload())
    executeCommand(msg)
    hideDemoPanelIfMovieMode()
  })
}
window.__demoGSAPAssemble = () => {
  import('@/ai-injection/demos/gsap-assemble-demo').then(({ buildGSAPAssemblePayload }) => {
    const msg = JSON.parse(buildGSAPAssemblePayload())
    executeCommand(msg)
    hideDemoPanelIfMovieMode()
  })
}
window.__demoGSAPExplode = () => {
  import('@/ai-injection/demos/gsap-explode-demo').then(({ buildGSAPExplodePayload }) => {
    const msg = JSON.parse(buildGSAPExplodePayload())
    executeCommand(msg)
    hideDemoPanelIfMovieMode()
  })
}

// ---- camera animation helper (GSAP proxy pattern) ----
window.__animateCamera = (opts: { to?: { x: number; y: number; z: number }; factor?: number; duration?: number }): Promise<void> => {
  return new Promise((resolve) => {
    const dev = window.__r3f_dev
    const controls = dev?.controls
    if (!controls) { resolve(); return }
    const cam = controls.object
    const center = controls.target.clone()
    let targetPos: THREE.Vector3
    if (opts.to) {
      targetPos = new THREE.Vector3(opts.to.x, opts.to.y, opts.to.z)
    } else {
      const factor = opts.factor ?? 1
      const dir = cam.position.clone().sub(center).normalize()
      const dist = cam.position.distanceTo(center)
      targetPos = center.clone().add(dir.multiplyScalar(dist * factor))
    }
    const dur = opts.duration ?? 1
    const proxy = { x: cam.position.x, y: cam.position.y, z: cam.position.z }
    gsap.to(proxy, {
      x: targetPos.x, y: targetPos.y, z: targetPos.z,
      duration: dur, ease: 'power2.inOut',
      onUpdate: () => {
        cam.position.set(proxy.x, proxy.y, proxy.z)
        controls.update()
      },
      onComplete: resolve,
    })
  })
}

function hideDemoPanelIfMovieMode() {
  if (useEngineStore.getState().movieMode) {
    const panel = document.getElementById('gsap-panel')
    if (panel) {
      panel.style.opacity = '0'
      panel.style.background = 'rgba(13,13,26,0)'
    }
  }
}

// Suppress console.log/warn/debug/info in production
initLogger()

// Expose export helper for E2E round-trip tests
window.__exportSceneToStlBase64 = async (): Promise<{ data: string; byteLength: number }> => {
  const scene = useEngineStore.getState().scene
  if (!scene) throw new Error('No scene available')
  const meshes = collectSceneMeshes(scene)
  if (meshes.length === 0) throw new Error('No exportable geometry')
  const buffer = await meshesToStl(meshes)
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
  return { data: btoa(binary), byteLength: buffer.byteLength }
}

// Expose state for E2E test access
window.__modelStore = useModelStore
window.__animationStore = useAnimationStore
window.__materialStore = useMaterialStore
window.__toolStore = useToolStore
window.__selectionStore = useSelectionStore
window.__svgWorkspaceStore = useSvgWorkspaceStore
window.__svgFixtures = {}
window.__svgHelpers = {
  parseSvgViewBox,
  parseSvgLayers,
  generateSvgThumbnail,
  putThumbnail,
  convertDxfToSvg: async (dxfText: string) => {
    const { convertDxfToSvg } = await import('@/lib/dxf-to-svg')
    return convertDxfToSvg(dxfText)
  },
}
window.__errors = []
window.__clearStepCache = clearStepCache
window.__stepMemCacheHas = (filePath: string, mtimeMs: number) => {
  const key = `${filePath.replace(/\\/g, '/')}|${Math.trunc(mtimeMs)}`
  return memCache.has(key)
}
window.__sceneHasFaceIds = () => {
  const dev = window.__r3f_dev
  if (!dev?.scene) return false
  let found = false
  dev.scene.traverse((obj: any) => {
    if (obj?.isMesh && obj?.userData?.faceIds) found = true
  })
  return found
}

// ---- AI control: shared command executor ----
type ApiResponse = { type: '3d-viewer'; id?: string; command: string; status: 'success' | 'error'; data?: unknown; error?: string; event?: string }
type CommandResult = ApiResponse | Promise<ApiResponse>
interface MaterialTarget { fileId: string; key: string; name: string }

function resolveMaterialTargets(partName?: string): MaterialTarget[] {
  const ms = useModelStore.getState()
  if (!ms.activeFileId) throw new Error('No model loaded')
  const file = ms.loadedFiles.find((f) => f.id === ms.activeFileId)
  if (!file || file.glbPartInfos.length === 0) throw new Error('Model has no parts')
  if (partName !== undefined && partName !== '') {
    const match = file.glbPartInfos.find((p) => p.name === partName)
    if (!match) throw new Error(`Part not found: ${partName}`)
    return [{ fileId: ms.activeFileId, key: match.partId, name: match.name }]
  }
  const selIds = useSelectionStore.getState().selectedReferenceIds
  if (selIds.length > 0) {
    const node = findNodeInTree(ms.sceneTree, selIds[0])
    if (node) {
      const keys = collectPartKeys(node)
      if (keys.length > 0) {
        return keys.map((k) => {
          const info = file.glbPartInfos.find((p) => p.partId === k)
          return { fileId: ms.activeFileId, key: k, name: info?.name ?? k }
        })
      }
    }
  }
  const firstFileNode = ms.sceneTree.find((n) => n.id === `file:${ms.activeFileId}`)
  if (firstFileNode) {
    const keys = collectPartKeys(firstFileNode)
    if (keys.length > 0) {
      return keys.map((k) => {
        const info = file.glbPartInfos.find((p) => p.partId === k)
        return { fileId: ms.activeFileId, key: k, name: info?.name ?? k }
      })
    }
  }
  throw new Error('No parts found')
}

function executeCommand(msg: { type?: string; id?: string; command?: string; params?: Record<string, unknown>; status?: string }): CommandResult {
  const cmd = msg.command ?? ''
  const params = msg.params ?? {}
  const stores = {
    ui: useUIStore.getState(),
    engine: useEngineStore.getState(),
    anim: useAnimationStore.getState(),
    mat: useMaterialStore.getState(),
    tool: useToolStore.getState(),
    sel: useSelectionStore.getState(),
    model: useModelStore.getState(),
  }
  try {
    switch (cmd) {
      case 'setTheme': {
        if (!['light', 'dark', 'system'].includes(params.value as string)) throw new Error('Invalid theme: ' + params.value)
        stores.ui.setTheme(params.value as 'light' | 'dark' | 'system')
        return { type: '3d-viewer', id: msg.id, command: cmd, status: 'success', data: { theme: params.value } }
      }
      case 'getTheme': {
        return { type: '3d-viewer', id: msg.id, command: cmd, status: 'success', data: { theme: useUIStore.getState().theme } }
      }
      case 'setLanguage': {
        stores.ui.setLanguage(params.value as string)
        return { type: '3d-viewer', id: msg.id, command: cmd, status: 'success', data: { language: params.value } }
      }
      case 'getLanguage': {
        return { type: '3d-viewer', id: msg.id, command: cmd, status: 'success', data: { language: useUIStore.getState().language } }
      }
      case 'setEnv': {
        stores.engine.setSelectedEnv(params.value as string)
        return { type: '3d-viewer', id: msg.id, command: cmd, status: 'success', data: { env: params.value } }
      }
      case 'getEnv': {
        return { type: '3d-viewer', id: msg.id, command: cmd, status: 'success', data: { env: useEngineStore.getState().selectedEnv } }
      }
      case 'setEnvIntensity': {
        stores.engine.setEnvIntensity(params.value as number)
        return { type: '3d-viewer', id: msg.id, command: cmd, status: 'success' }
      }
      case 'setEnvRotation': {
        stores.engine.setEnvRotation(params.value as number)
        return { type: '3d-viewer', id: msg.id, command: cmd, status: 'success' }
      }
      case 'setCameraMode': {
        if (!['perspective', 'orthographic'].includes(params.value as string)) throw new Error('Invalid camera mode: ' + params.value)
        stores.ui.setCameraMode(params.value as 'perspective' | 'orthographic')
        return { type: '3d-viewer', id: msg.id, command: cmd, status: 'success' }
      }
      case 'setCameraPosition': {
        const dev = window.__r3f_dev
        if (!dev?.camera) throw new Error('Camera not ready')
        const pos = params.position as [number, number, number] | undefined
        const target = params.target as [number, number, number] | undefined
        if (pos) dev.camera.position.set(pos[0], pos[1], pos[2])
        if (target) dev.camera.lookAt(target[0], target[1], target[2])
        if (dev.controls) {
          if (target) dev.controls.target.set(target[0], target[1], target[2])
          dev.controls.update()
        }
        return { type: '3d-viewer', id: msg.id, command: cmd, status: 'success' }
      }
      case 'resetCamera': {
        const dev = window.__r3f_dev
        if (!dev?.camera) throw new Error('Camera not ready')
        dev.camera.position.set(0, -6, 4)
        if (dev.controls) {
          dev.controls.target.set(0, 0, 0)
          dev.controls.update()
        }
        return { type: '3d-viewer', id: msg.id, command: cmd, status: 'success' }
      }
      case 'animateCamera': {
        const to = params.to ? (params.to as { x: number; y: number; z: number }) : undefined
        return window.__animateCamera({ to, factor: params.factor as number | undefined, duration: params.duration as number | undefined }).then(() => ({
          type: '3d-viewer', id: msg.id, command: cmd, status: 'success',
        }))
      }
      case 'zoomToFit': {
        const dev = window.__r3f_dev
        if (!dev?.camera || !dev?.scene) throw new Error('Scene not ready')
        const box = new THREE.Box3()
        let hasGeom = false
        dev.scene.traverse((obj: THREE.Object3D) => {
          if (obj instanceof THREE.Mesh && obj.visible && obj.geometry) {
            const geo = obj.geometry
            if (geo.boundingBox === null) geo.computeBoundingBox()
            if (geo.boundingBox) {
              const worldBox = geo.boundingBox.clone()
              worldBox.applyMatrix4(obj.matrixWorld)
              box.union(worldBox)
              hasGeom = true
            }
          }
        })
        if (!hasGeom) throw new Error('No visible geometry to fit')
        const center = box.getCenter(new THREE.Vector3())
        const size = box.getSize(new THREE.Vector3())
        const maxDim = Math.max(size.x, size.y, size.z)
        const padding = (params.padding as number) ?? 1.5
        const dist = maxDim * padding
        const cam = dev.camera
        if (cam instanceof THREE.PerspectiveCamera) {
          const fitDist = maxDim / (2 * Math.tan((cam.fov * Math.PI) / 360))
          const finalDist = Math.max(fitDist, dist)
          cam.position.set(center.x - finalDist * 0.3, center.y - finalDist * 0.6, center.z + finalDist * 0.7)
        } else {
          cam.position.set(center.x, center.y - dist * 0.5, center.z + dist)
        }
        if (dev.controls) {
          dev.controls.target.copy(center)
          dev.controls.update()
        }
        cam.lookAt(center)
        return { type: '3d-viewer', id: msg.id, command: cmd, status: 'success' }
      }
      case 'getModelInfo': {
        const ms = useModelStore.getState()
        if (!ms.activeFileId) throw new Error('No model loaded')
        const file = ms.loadedFiles.find((f) => f.id === ms.activeFileId) ?? null
        return { type: '3d-viewer', id: msg.id, command: cmd, status: 'success', data: {
          fileId: ms.activeFileId,
          fileName: file?.fileName ?? null,
          format: file?.format ?? null,
          sourceUnit: file?.sourceUnit ?? null,
          partCount: ms.glbPartInfos.length,
          parts: ms.glbPartInfos.map((p) => ({ partId: p.partId, name: p.name, triangleCount: p.triangleCount })),
        } }
      }
      case 'getMaterialPresets': {
        return { type: '3d-viewer', id: msg.id, command: cmd, status: 'success',
          data: { presets: MATERIAL_PRESETS } }
      }
      case 'setPartMaterialByPreset': {
        const presetName = params.preset as string
        if (!presetName) throw new Error('Missing preset name')
        const preset = getPreset(presetName)
        if (!preset) throw new Error(`Unknown preset: ${presetName}`)
        const targets = resolveMaterialTargets(params.partName as string | undefined)
        for (const t of targets) {
          const rawPartId = t.key.split(':').slice(1).join(':')
          stores.mat.setMaterialOverride(t.fileId, rawPartId, preset)
          useMaterialStore.setState((s) => ({
            overridePresetRefs: { ...s.overridePresetRefs, [t.key]: presetName },
          }))
        }
        return { type: '3d-viewer', id: msg.id, command: cmd, status: 'success',
          data: { fileId: targets[0]?.fileId ?? null, parts: targets.map(t => ({ partId: t.key, partName: t.name })), partCount: targets.length, preset: presetName } }
      }
      case 'setPartMaterial': {
        const app = params.appearance
        if (!app) throw new Error('Missing appearance')
        const targets = resolveMaterialTargets(params.partName as string | undefined)
        for (const t of targets) {
          const rawPartId = t.key.split(':').slice(1).join(':')
          stores.mat.setMaterialOverride(t.fileId, rawPartId, app as any)
          useMaterialStore.setState((s) => ({
            overridePresetRefs: { ...s.overridePresetRefs, [t.key]: null },
          }))
        }
        return { type: '3d-viewer', id: msg.id, command: cmd, status: 'success',
          data: { fileId: targets[0]?.fileId ?? null, parts: targets.map(t => ({ partId: t.key, partName: t.name })), partCount: targets.length } }
      }
      case 'getPartMaterial': {
        const targets = resolveMaterialTargets(params.partName as string | undefined)
        const mat = useMaterialStore.getState()
        const partsData = targets.map(t => ({
          partId: t.key,
          partName: t.name,
          override: mat.materialOverrides[t.key] ?? null,
          original: mat.materialOriginals[t.key] ?? null,
          preset: mat.overridePresetRefs[t.key] ?? null,
        }))
        return { type: '3d-viewer', id: msg.id, command: cmd, status: 'success',
          data: { fileId: targets[0]?.fileId ?? null, parts: partsData, partCount: partsData.length } }
      }
      case 'setDefaultMaterial': {
        const app = params.appearance
        if (!app) throw new Error('Missing appearance')
        stores.mat.setDefaultMaterial(app as MaterialAppearance)
        return { type: '3d-viewer', id: msg.id, command: cmd, status: 'success', data: { appearance: app } }
      }
      case 'getAnimationInfo': {
        const s = useAnimationStore.getState()
        const activeFile = useModelStore.getState().loadedFiles.find(
          (f) => f.id === useModelStore.getState().activeFileId,
        )
        return { type: '3d-viewer', id: msg.id, command: cmd, status: 'success', data: {
          hasAnimations: s.clips.length > 0,
          clips: s.clips.map((c, i) => ({ index: i, name: c.name, duration: c.duration })),
          currentIndex: s.currentIndex, isPlaying: s.isPlaying, currentTime: s.currentTime,
          speed: s.speed, duration: s.duration, repeat: s.repeat, pingpong: s.pingpong,
          fileName: activeFile?.fileName ?? null,
        } }
      }
      case 'playAnimation': {
        if (!useModelStore.getState().animDialogFileId) {
          const activeFile = useModelStore.getState().loadedFiles.find(
            (f) => f.id === useModelStore.getState().activeFileId && f.animations?.length,
          ) ?? useModelStore.getState().loadedFiles.find((f) => f.animations?.length)
          if (!activeFile) throw new Error('No file with animations loaded')
          useModelStore.getState().openAnimDialog(activeFile.id)
        }
        stores.anim.setPlaying(true)
        return { type: '3d-viewer', id: msg.id, command: cmd, status: 'success' }
      }
      case 'pauseAnimation': {
        stores.anim.setPlaying(false)
        return { type: '3d-viewer', id: msg.id, command: cmd, status: 'success' }
      }
      case 'stopAnimation': {
        stores.anim.setPlaying(false)
        stores.anim.seek(0)
        return { type: '3d-viewer', id: msg.id, command: cmd, status: 'success' }
      }
      case 'setAnimationMaximized': {
        stores.anim.setMaximized(params.value as boolean)
        return { type: '3d-viewer', id: msg.id, command: cmd, status: 'success' }
      }
      case 'selectAnimation': {
        stores.anim.selectAnimation(params.index as number)
        return { type: '3d-viewer', id: msg.id, command: cmd, status: 'success' }
      }
      case 'setSpeed': {
        stores.anim.setSpeed(params.value as number)
        return { type: '3d-viewer', id: msg.id, command: cmd, status: 'success' }
      }
      case 'seek': {
        stores.anim.seek(params.time as number)
        return { type: '3d-viewer', id: msg.id, command: cmd, status: 'success' }
      }
      case 'clearSelection': {
        stores.sel.clearSelection()
        return { type: '3d-viewer', id: msg.id, command: cmd, status: 'success' }
      }
      case 'getSelection': {
        const selIds = useSelectionStore.getState().selectedReferenceIds
        const { activeFileId, loadedFiles } = useModelStore.getState()
        const file = activeFileId ? loadedFiles.find((f) => f.id === activeFileId) : undefined
        const infos = file?.glbPartInfos ?? []
        const parts = selIds.map((id) => {
          const info = infos.find((p) => p.partId === id)
          return { id, name: info?.name ?? null, isPart: !!info }
        })
        return { type: '3d-viewer', id: msg.id, command: cmd, status: 'success', data: { selectedParts: parts } }
      }
      case 'setActiveTool': {
        if (!['view', 'objectTransform'].includes(params.value as string)) throw new Error('Invalid tool mode')
        stores.tool.setActiveToolMode(params.value as 'view' | 'objectTransform')
        return { type: '3d-viewer', id: msg.id, command: cmd, status: 'success' }
      }
      case 'setTransformMode': {
        if (!['translate', 'rotate', 'scale'].includes(params.value as string)) throw new Error('Invalid transform mode')
        stores.tool.setTransformMode(params.value as 'translate' | 'rotate' | 'scale')
        return { type: '3d-viewer', id: msg.id, command: cmd, status: 'success' }
      }
      case 'takeScreenshot': {
        const gl = window.__r3f_dev?.gl
        if (!gl) throw new Error('Renderer not ready')
        const { width, height } = params as { width?: number; height?: number }
        const canvas = gl.domElement as HTMLCanvasElement
        let dataUrl: string
        if (width || height) {
          const origW = canvas.width
          const origH = canvas.height
          canvas.width = width ?? origW
          canvas.height = height ?? origH
          gl.render()
          dataUrl = canvas.toDataURL('image/png')
          canvas.width = origW
          canvas.height = origH
        } else {
          dataUrl = canvas.toDataURL('image/png')
        }
        return { type: '3d-viewer', id: msg.id, command: cmd, status: 'success', data: { image: dataUrl } }
      }
      case 'toggleLeftPanel': {
        stores.ui.toggleLeftPanel()
        return { type: '3d-viewer', id: msg.id, command: cmd, status: 'success' }
      }
      case 'toggleRightPanel': {
        stores.ui.toggleRightPanel()
        return { type: '3d-viewer', id: msg.id, command: cmd, status: 'success' }
      }
      case 'toggleModelInfo': {
        stores.ui.toggleModelInfo()
        return { type: '3d-viewer', id: msg.id, command: cmd, status: 'success' }
      }
      case 'toggleEnvPanel': {
        stores.ui.toggleEnvironmentPanel()
        return { type: '3d-viewer', id: msg.id, command: cmd, status: 'success' }
      }
      case 'setUIVisible': {
        const visible = params.visible as boolean
        stores.ui.setHeaderVisible(visible)
        if (visible !== stores.ui.rightPanelOpen) {
          stores.ui.toggleRightPanel()
        }
        return { type: '3d-viewer', id: msg.id, command: cmd, status: 'success' }
      }
      case 'loadModel': {
        const { url, data, AutoRotate } = params as { url?: string; data?: string; AutoRotate?: boolean }
        if (AutoRotate !== undefined) useEngineStore.getState().setAutoRotate(AutoRotate)
        if (!url && !data) throw new Error('Must provide url or data')
        const doLoad = async (): Promise<ApiResponse> => {
          try {
            let buffer: ArrayBuffer
            let fileName: string
            if (url) {
              const resp = await fetch(url)
              if (!resp.ok) throw new Error(`Failed to fetch: HTTP ${resp.status}`)
              buffer = await resp.arrayBuffer()
              fileName = url.split('/').pop() || 'model'
              const disposition = resp.headers.get('Content-Disposition')
              if (disposition) {
                const m = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/)
                if (m) fileName = m[1].replace(/['"]/g, '')
              }
              const ext = fileName.split('.').pop()?.toLowerCase()
              if (!ext || !detectFormat(fileName)) {
                const guessed = url.match(/\.\w{2,5}(?=[?#]|$)/)
                if (guessed) fileName = 'model' + guessed[0]
              }
            } else {
              const resp = await fetch(data!)
              buffer = await resp.arrayBuffer()
              fileName = 'model.glb'
            }
            let format = detectFormat(fileName)
            if (!format) throw new Error(`Unsupported file format: ${fileName}`)
            let fileMeta: { step: ReturnType<typeof parseStepHeader> } | undefined
            if (isStepFile(fileName)) {
              const stepHeader = parseStepHeader(buffer)
              if (stepHeader) fileMeta = { step: stepHeader }
            }
            if (isStepFile(fileName)) {
              const { buffer: glbBuffer } = await stepToGlbCached(buffer,
                { filePath: fileName, mtimeMs: Date.now() },
                { wasmPath: '/wasm/occt-import-js.wasm' },
              )
              buffer = glbBuffer
              format = 'glb'
            }
            const loadResult = await loadFormat(buffer, format, fileName)
            const fileId = crypto.randomUUID()
            setCachedResult(fileId, loadResult)
            useModelStore.getState().addLoadedFile({
              id: fileId, fileName, filePath: fileName, mtimeMs: Date.now(), buffer,
              format, sceneTree: [], glbPartInfos: [], modelCenteringOffset: null,
              sourceUnit: loadResult.sourceUnit ?? FORMAT_MAP[format].defaultUnit,
              fileGroup: FORMAT_MAP[format].group, loadingPhase: 'loading',
              bambuMetadata: loadResult.bambuMetadata, fileMeta,
            })
            await new Promise(r => setTimeout(r, 100))
            const ms = useModelStore.getState()
            const file = ms.loadedFiles.find((f) => f.id === fileId)
            return { type: '3d-viewer', id: msg.id, command: cmd, status: 'success',
              data: { fileId, fileName, format, sourceUnit: file?.sourceUnit ?? loadResult.sourceUnit,
                partCount: ms.glbPartInfos.length,
                parts: ms.glbPartInfos.map((p) => ({ partId: p.partId, name: p.name, triangleCount: p.triangleCount })),
                animations: file?.animations?.map((a) => ({ name: a.name, duration: a.duration })) ?? [],
              } }
          } catch (err) {
            return { type: '3d-viewer', id: msg.id, command: cmd, status: 'error',
              error: err instanceof Error ? err.message : String(err) }
          }
        }
        return doLoad()
      }
      case 'startRotate': {
        window.dispatchEvent(new CustomEvent('startRotate'))
        return { type: '3d-viewer', id: msg.id, command: cmd, status: 'success', data: { enabled: true } }
      }
      case 'stopRotate': {
        window.dispatchEvent(new CustomEvent('stopRotate'))
        return { type: '3d-viewer', id: msg.id, command: cmd, status: 'success', data: { enabled: false } }
      }
      case 'getRotate': {
        const enabled = !!(window as any).__viewerRotating?.()
        return { type: '3d-viewer', id: msg.id, command: cmd, status: 'success', data: { enabled } }
      }
      case 'resetViewer': {
        useModelStore.getState().reset()
        useSelectionStore.getState().clearSelection()
        useAnimationStore.getState().reset()
        return { type: '3d-viewer', id: msg.id, command: cmd, status: 'success' }
      }
      case 'generateScadModel': {
        const { code, name = 'generated-model', mode = 'replace' } = params as { code: string; name?: string; mode?: string }
        if (!code?.trim()) throw new Error('Missing required parameter: code')
        const doGenerate = async (): Promise<ApiResponse> => {
          try {
            useModelStore.getState().showProgress('Compiling OpenSCAD model...', -1)
            const result = await scadToStl(code, (phase) => {
              if (phase === 'init') useModelStore.getState().updateProgress('Loading OpenSCAD engine...', 20)
              if (phase === 'compile') useModelStore.getState().updateProgress('Compiling...', 60)
              if (phase === 'export') useModelStore.getState().updateProgress('Finalizing...', 90)
            })
            const loadResult = await loadFormat(result.stlBuffer, 'stl', `${name}.stl`)
            const fileId = crypto.randomUUID()
            setCachedResult(fileId, loadResult)
            if (mode === 'replace') useModelStore.getState().reset()
            useModelStore.getState().addLoadedFile({
              id: fileId, fileName: `${name}.stl`, filePath: `${name}.stl`, mtimeMs: Date.now(),
              buffer: result.stlBuffer, format: 'stl', sceneTree: [], glbPartInfos: [],
              modelCenteringOffset: null, sourceUnit: 'millimeter', fileGroup: 'mesh', loadingPhase: 'loading',
            })
            useModelStore.getState().hideProgress()
            await new Promise(r => setTimeout(r, 100))
            return { type: '3d-viewer', id: msg.id, command: cmd, status: 'success',
              data: { fileId, format: 'stl', triangleCount: result.triangleCount, renderMs: result.renderMs } }
          } catch (err) {
            useModelStore.getState().hideProgress()
            return { type: '3d-viewer', id: msg.id, command: cmd, status: 'error',
              error: err instanceof Error ? err.message : String(err) }
          }
        }
        return doGenerate()
      }
      case 'exportModel': {
        const format = (params as { format?: string }).format
        if (format !== 'stl' && format !== 'glb') {
          return { type: '3d-viewer', id: msg.id, command: cmd, status: 'error', error: 'format is required and must be "stl" or "glb"' }
        }
        const doExport = async (): Promise<ApiResponse> => {
          const scene = useEngineStore.getState().scene
          if (!scene) throw new Error('No scene available')
          const meshes = collectSceneMeshes(scene)
          if (meshes.length === 0) throw new Error('No exportable geometry in scene')
          let buffer: ArrayBuffer
          let ext: string
          if (format === 'stl') { buffer = await meshesToStl(meshes); ext = 'stl' }
          else { buffer = await meshesToGlb(meshes); ext = 'glb' }
          const bytes = new Uint8Array(buffer)
          let binary = ''
          for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
          return { type: '3d-viewer', id: msg.id, command: cmd, status: 'success',
            data: { base64: btoa(binary), byteLength: buffer.byteLength, format: ext } }
        }
        return doExport()
      }
      case 'executeCode': {
        const inj = window.__aiInjection
        if (!inj) throw new Error('AI injection not available')
        inj.execute(params.html as string | undefined, params.css as string | undefined, params.js as string | undefined, params.mode as string | undefined)
        return { type: '3d-viewer', id: msg.id, command: cmd, status: 'success', data: { injected: true, mode: params.mode ?? 'replace' } }
      }
      default: {
        return { type: '3d-viewer', id: msg.id, command: cmd, status: 'error', error: 'Unknown command: ' + cmd }
      }
    }
  } catch (err) {
    return { type: '3d-viewer', id: msg.id, command: cmd, status: 'error', error: err instanceof Error ? err.message : String(err) }
  }
}

// ---- Embed event broadcast (iframe → parent) ----
function broadcastEmbedEvent(event: string, data: unknown) {
  const resp: ApiResponse = { type: '3d-viewer', id: undefined, command: '', status: 'success', event, data }
  try { window.parent.postMessage(resp, '*') } catch { /* ignore */ }
}

// ---- postMessage handler (same-origin / iframe) ----
function postResponse(e: MessageEvent, resp: ApiResponse) {
  try { e.source?.postMessage(resp, { targetOrigin: e.origin }) } catch { /* ignore cross-origin */ }
}

window.addEventListener('message', (e) => {
  const msg = e.data
  if (!msg || msg.type !== '3d-viewer' || !msg.command || msg.status) return
  const result = executeCommand(msg)
  if (!(result instanceof Promise)) {
    postResponse(e, result)
    return
  }
  postResponse(e, { type: '3d-viewer', id: msg.id, command: msg.command, status: 'success', data: { loading: true } })
  result.then((final) => {
    if (final.status === 'success') broadcastEmbedEvent('modelLoaded', final.data)
    else broadcastEmbedEvent('modelLoadError', (final.data as any)?.error)
  })
})

// ---- IPC listener (replaces SSE) ----
try {
  const _unsub = window.electronAPI.onAIAction(async (msg: any) => {
    if (!msg || msg.type !== '3d-viewer' || !msg.command) return
    const result = executeCommand(msg)
    const resp = result instanceof Promise ? await result : result
    if (msg.id) {
      window.electronAPI.postAIResult({
        id: msg.id,
        data: resp.status === 'success' ? resp : undefined,
        error: resp.status === 'error' ? resp.error : undefined,
      })
    }
  })
} catch { /* electronAPI not available */ }

// ---- Embed event subscriptions (animation state, selection) ----
try {
  let prevPlaying = useAnimationStore.getState().isPlaying
  useAnimationStore.subscribe((state) => {
    if (state.isPlaying && !prevPlaying) {
      broadcastEmbedEvent('animationPlay', { clipName: state.clips[state.currentIndex]?.name ?? null, duration: state.duration })
    } else if (!state.isPlaying && prevPlaying && state.currentTime > 0) {
      broadcastEmbedEvent('animationPause', { currentTime: state.currentTime })
    }
    if (state.currentTime >= state.duration && prevPlaying) {
      broadcastEmbedEvent('animationEnd', { clipName: state.clips[state.currentIndex]?.name ?? null })
    }
    prevPlaying = state.isPlaying
  })
  let prevSel = useSelectionStore.getState().selectedReferenceIds
  useSelectionStore.subscribe((state) => {
    if (state.selectedReferenceIds !== prevSel) {
      broadcastEmbedEvent('selectionChanged', { selectedParts: state.selectedReferenceIds })
      prevSel = state.selectedReferenceIds
    }
  })
} catch { /* ignore subscription errors */ }

// Global error handlers
window.addEventListener('error', (event) => {
  if (event.message?.includes('ResizeObserver loop')) return
  const err = event.error
  if (err instanceof Error) {
    const detail = { message: err.message, stack: err.stack ?? '', timestamp: Date.now() }
    window.__errors.push(detail)
    console.error('[Global Error]', err.message, '\n', err.stack)
  } else {
    const detail = { message: event.message, stack: `${event.filename}:${event.lineno}:${event.colno}`, timestamp: Date.now() }
    window.__errors.push(detail)
    console.error('[Global Error]', event.message, '\n', event.filename, ':', event.lineno, ':', event.colno)
  }
})

window.addEventListener('unhandledrejection', (event) => {
  window.__errors.push({ message: String(event.reason), stack: '', timestamp: Date.now() })
  console.error('[Unhandled Promise Rejection]', event.reason)
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <HashRouter>
        <TooltipProvider delayDuration={300}>
          <App />
          <Toaster position="bottom-right" />
        </TooltipProvider>
      </HashRouter>
    </ErrorBoundary>
  </StrictMode>
)

// Broadcast viewerReady after initial render
setTimeout(() => { broadcastEmbedEvent('viewerReady', {}) }, 1000)

// ---- AI Code Injection ----
setTimeout(() => {
  import('@/ai-injection').then(({ registerAIInjection, startEventLoop }) => {
    try {
      registerAIInjection()
      startEventLoop()
      console.log('[ai-injection] registered')
    } catch (err) {
      console.error('[ai-injection] register failed:', err)
    }
  }).catch((err) => {
    console.error('[ai-injection] module load failed:', err)
  })
}, 0)
