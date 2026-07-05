import { useRef, useCallback, useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import gsap from 'gsap'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { useModelStore } from '@/stores/model-store'
import type { UnitSystem, FileGroup } from '@/config/file-formats'
import { UNIT_TO_MM } from '@/config/file-formats'
import { useEngineStore } from '@/stores/engine-store'
import { useUIStore } from '@/stores/ui-store'
import { useMaterialStore } from '@/stores/material-store'
import { useToolStore } from '@/stores/tool-store'
import { useSelectionStore } from '@/stores/selection-store'
import type { SnapCandidate } from '@/lib/topology/snap'
import { extractSelectorBundle } from '@/lib/topology/parse-glb-topology'
import { buildSelectorRuntime } from '@/lib/topology/build-selector-runtime'
import AnimationPlayerDialog from '@/components/panels/AnimationPlayerDialog'
import SceneSetup from '@/engine/components/SceneSetup'
import PostProcessing from '@/engine/components/PostProcessing'
import ModelGroup from '@/engine/components/ModelGroup'
import TopologyOverlay from '@/engine/components/TopologyOverlay'
import SelectionHighlight from '@/engine/components/SelectionHighlight'
import SelectionBoundingBox from '@/engine/components/SelectionBoundingBox'
import SelectionToolbar from '@/engine/components/SelectionToolbar'
import DisplayModeDropdown from '@/engine/components/DisplayModeDropdown'
import DebugTopologyOverlay from '@/engine/components/DebugTopologyOverlay'
import type { DisplayMode } from '@/engine/components/DisplayModeDropdown'
import SelectionInfoOverlay from '@/engine/components/SelectionInfoOverlay'
import CrossSectionRenderer from '@/engine/components/CrossSectionRenderer'
import CrossSectionPanel from '@/engine/components/CrossSectionPanel'
import ZebraRenderer from '@/engine/components/ZebraRenderer'
import ZebraPanel from '@/engine/components/ZebraPanel'
import DraftAnalysisRenderer from '@/engine/components/DraftAnalysisRenderer'
import DraftAnalysisPanel from '@/engine/components/DraftAnalysisPanel'
import SurfaceAnalysisRenderer from '@/engine/components/SurfaceAnalysisRenderer'
import SurfaceAnalysisPanel from '@/engine/components/SurfaceAnalysisPanel'
import CurvatureCombRenderer from '@/engine/components/CurvatureCombRenderer'
import CurvatureCombPanel from '@/engine/components/CurvatureCombPanel'
import { generateThumbnailFromResult } from '@/lib/thumbnail-cache/thumbnailGenerator'
import { putThumbnail } from '@/lib/thumbnail-cache/thumbnailCache'

import AxesIndicator from '@/engine/components/AxesIndicator'
import ToolOverlay from '@/engine/components/ToolOverlay'
import TopologyPicker from '@/engine/components/TopologyPicker'
import TexturePreviewDialog from '@/components/panels/TexturePreviewDialog'
import { getCheckerDataUri } from '@/engine/material/checkerTexture'
import { getSharedTextureCache } from '@/engine/material/MaterialFactory'
import { getMapColorSpace } from '@/engine/material/TextureCache'
import { computeCameraFitTarget, autoSelectBedSize, computePlateLayout } from '@/engine/heatbed'
import { toast } from 'sonner'

/** Default entry animation duration in milliseconds (all three modes). */
const DEFAULT_ENTRY_DURATION_MS = 2000

/** X offset is 0 so the world X-axis stays horizontal-right on screen.
 *  Camera is positioned in the YZ plane (front-top) looking at origin. */
const DEFAULT_CAM_POS: [number, number, number] = [0, -6, 4]

/** Triggers camera animation when the user toggles up-axis. The animation rotates
 *  the camera around the world X axis so the model appears stationary while the
 *  "up" direction smoothly transitions. Does NOT touch the model at all. */
function UpAxisAnimator({
  upAxis,
  animateCamera,
}: {
  upAxis: 'y' | 'z'
  animateCamera: (targetPos: THREE.Vector3, targetUp: THREE.Vector3) => void
}) {
  const { camera } = useThree()
  const prevUpAxis = useRef(upAxis)

  useEffect(() => {
    if (prevUpAxis.current === upAxis) return

    const targetUp = upAxis === 'y'
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(0, 0, 1)

    if (camera.up.clone().normalize().distanceTo(targetUp) < 0.001) {
      prevUpAxis.current = upAxis
      return
    }

    prevUpAxis.current = upAxis

    // Rotate camera position around world X axis through origin.
    // Z-up → Y-up: -π/2 around X.  Y-up → Z-up: +π/2 around X.
    const currentUp = camera.up.clone().normalize()
    const isCurrentlyYUp = Math.abs(currentUp.y - 1) < 0.01
    const angle = isCurrentlyYUp ? Math.PI / 2 : -Math.PI / 2
    const targetPos = camera.position.clone().applyAxisAngle(
      new THREE.Vector3(1, 0, 0), angle,
    )

    animateCamera(targetPos, targetUp)
  }, [upAxis, camera, animateCamera])

  return null
}

function ModelTransformTracker({ modelGroupMapRef }: { modelGroupMapRef: React.RefObject<Map<string, THREE.Group>> }) {
  const setModelTransform = useEngineStore((s) => s.setModelTransform)

  useFrame(() => {
    const map = modelGroupMapRef.current
    if (map && map.size > 0) {
      // Track the first group's world matrix for topology overlay alignment
      const firstGroup = [...map.values()][0]
      firstGroup.updateWorldMatrix(true, false)
      setModelTransform(firstGroup.matrixWorld.clone())
    } else {
      setModelTransform(null)
    }
  })

  return null
}

function CameraModeSwitcher() {
  const cameraMode = useUIStore((s) => s.cameraMode)
  const { camera, set: setThree, size, controls } = useThree()

  useEffect(() => {
    const aspect = size.width / size.height
    const orbitControls = controls as OrbitControlsImpl | null
    const target = orbitControls?.target ?? new THREE.Vector3(0, 0, 0)

    if (cameraMode === 'perspective' && !(camera instanceof THREE.PerspectiveCamera)) {
      const pos = camera.position.clone()
      const up = camera.up.clone()
      const near = camera.near
      const far = camera.far

      const orthoCam = camera as THREE.OrthographicCamera
      const zoom = orthoCam.zoom || 1
      const effectiveHalfHeight = orthoCam.top / zoom
      const dist = effectiveHalfHeight / Math.tan(THREE.MathUtils.degToRad(25))

      const perspCam = new THREE.PerspectiveCamera(50, aspect, near, far)
      const viewDir = pos.clone().sub(target).normalize()
      perspCam.position.copy(target).addScaledVector(viewDir, dist)
      perspCam.up.copy(up)
      perspCam.lookAt(target)
      setThree({ camera: perspCam })
    } else if (cameraMode === 'orthographic' && !(camera instanceof THREE.OrthographicCamera)) {
      const pos = camera.position.clone()
      const up = camera.up.clone()
      const near = camera.near
      const far = camera.far

      const dist = pos.distanceTo(target)
      const halfHeight = dist * Math.tan(THREE.MathUtils.degToRad(25))

      const orthoCam = new THREE.OrthographicCamera(
        -halfHeight * aspect, halfHeight * aspect,
        halfHeight, -halfHeight,
        near, far,
      )
      orthoCam.position.copy(pos)
      orthoCam.up.copy(up)
      orthoCam.lookAt(target)
      setThree({ camera: orthoCam })
    }
  }, [cameraMode, camera, setThree, size, controls])

  return null
}

export default function ViewportContainer() {
  const { t } = useTranslation()
  const controlsRef = useRef<OrbitControlsImpl>(null)
  /** Map of fileId → model group root. Supports multi-file drag, pick, and highlight. */
  const modelGroupMapRef = useRef<Map<string, THREE.Group>>(new Map())
  const mainCamera = useEngineStore((s) => s.camera)
  const initShowHeatbed = useEngineStore((s) => s.initShowHeatbed)
  const controlsEnabled = useEngineStore((s) => s.controlsEnabled)
  const modelBuffer = useModelStore((s) => s.modelBuffer)
  const modelFormat = useModelStore((s) => s.modelFormat)
  const activeUpAxis = useModelStore((s) => s.activeUpAxis)
  const loadedFiles = useModelStore((s) => s.loadedFiles)
  const activeFileId = useModelStore((s) => s.activeFileId)
  const updateFileSceneTree = useModelStore((s) => s.updateFileSceneTree)
  const updateFilePartInfos = useModelStore((s) => s.updateFilePartInfos)
  const updateFileCenteringOffset = useModelStore((s) => s.updateFileCenteringOffset)
  const updateFileLoadingPhase = useModelStore((s) => s.updateFileLoadingPhase)

  const activeToolMode = useToolStore((s) => s.activeToolMode)
  const centeringOffset = useModelStore((s) => s.modelCenteringOffset)
  const theme = useUIStore((s) => s.theme)
  const isFullscreen = useUIStore((s) => s.isFullscreen)
  const bottomVisible = useUIStore((s) => s.bottomVisible)

  const canvasBackground = useMemo(() => {
    const isDark = theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : theme === 'dark'
    return isDark ? '#1a1a2e' : '#EEF3F5'
  }, [theme])

  // ---- camProxy: single proxy for all GSAP camera animations ----
  const camProxyRef = useRef({ x: 0, y: 0, z: 0, upX: 0, upY: 0, upZ: 0 })
  const tweenRef = useRef<gsap.core.Tween | null>(null)
  const [rotating, setRotating] = useState(false)
  const [isCameraAnimating, setIsCameraAnimating] = useState(false)
  const modelLoadCompletedRef = useRef(false)

  // camProxy initial sync
  useEffect(() => {
    const cam = controlsRef.current?.object
    if (!cam) return
    const p = camProxyRef.current
    p.x = cam.position.x; p.y = cam.position.y; p.z = cam.position.z
    p.upX = cam.up.x; p.upY = cam.up.y; p.upZ = cam.up.z
  }, [])

  // ---- Rotation ----
  const startRotation = useCallback(() => {
    gsap.killTweensOf(camProxyRef.current)
    if (tweenRef.current?.isActive()) return
    const controls = controlsRef.current
    if (!controls) return
    const camera = controls.object
    const center = controls.target.clone()
    // Sync proxy with current camera position to avoid jump on first onUpdate
    const p = camProxyRef.current
    p.x = camera.position.x
    p.y = camera.position.y
    p.z = camera.position.z
    const upAxis = useModelStore.getState().activeUpAxis
    const dx = camera.position.x - center.x
    const dy = upAxis === 'z' ? camera.position.y - center.y : camera.position.z - center.z
    const initialAngle = Math.atan2(dy, dx)
    const radius = Math.sqrt(dx * dx + dy * dy)

    const proxy = { angle: initialAngle }
    tweenRef.current = gsap.to(proxy, {
      angle: initialAngle + Math.PI * 2,
      duration: 30, repeat: -1, ease: 'none',
      onUpdate: () => {
        const { angle } = proxy
        if (upAxis === 'z') {
          p.x = center.x + radius * Math.cos(angle)
          p.y = center.y + radius * Math.sin(angle)
        } else {
          p.x = center.x + radius * Math.cos(angle)
          p.z = center.z + radius * Math.sin(angle)
        }
        camera.position.set(p.x, p.y, p.z)
        controls.update()
      },
    })
    setRotating(true)
  }, [])

  const stopRotation = useCallback(() => {
    tweenRef.current?.kill()
    tweenRef.current = null
    setRotating(false)
  }, [])

  // Keyboard shortcut: Alt+R to toggle rotation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
      if (e.altKey && e.key === 'r') {
        e.preventDefault()
        if (tweenRef.current?.isActive()) {
          stopRotation()
          toast.info('旋转已停止')
        } else {
          startRotation()
          toast.info('旋转已开始')
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [startRotation, stopRotation])

  // ---- Camera fit / upAxis transition (replaces CameraAnimator) ----
  const animateCamera = useCallback((targetPos: THREE.Vector3, targetUp: THREE.Vector3, onDone?: () => void, durationMs?: number, centerTarget?: THREE.Vector3) => {
    gsap.killTweensOf(camProxyRef.current)
    setRotating(false)
    setIsCameraAnimating(true)
    useEngineStore.getState().set__animActive(true)

    const dur = (durationMs ?? 2000) / 1000
    const p = camProxyRef.current
    gsap.to(p, {
      x: targetPos.x, y: targetPos.y, z: targetPos.z,
      upX: targetUp.x, upY: targetUp.y, upZ: targetUp.z,
      duration: dur, ease: 'power2.inOut',
      onUpdate: () => {
        const cam = controlsRef.current!.object
        cam.position.set(p.x, p.y, p.z)
        cam.up.set(p.upX, p.upY, p.upZ).normalize()
        if (centerTarget) {
          controlsRef.current!.target.copy(centerTarget)
        } else {
          controlsRef.current!.target.set(0, 0, 0)
        }
        controlsRef.current!.update()
      },
      onComplete: () => {
        setIsCameraAnimating(false)
        useEngineStore.getState().set__animActive(false)
        onDone?.()
      },
    })
  }, [])

  // Expose rotation query for getRotate API
  useEffect(() => {
    (window as any).__viewerRotating = () => tweenRef.current?.isActive() ?? false
    return () => { delete (window as any).__viewerRotating }
  }, [])

  // Listen for startRotate / stopRotate CustomEvent
  useEffect(() => {
    window.addEventListener('startRotate', startRotation)
    window.addEventListener('stopRotate', stopRotation)
    return () => {
      window.removeEventListener('startRotate', startRotation)
      window.removeEventListener('stopRotate', stopRotation)
      stopRotation()
    }
  }, [startRotation, stopRotation])

  // Expose entry animation trigger for movie scripts and manual replay
  useEffect(() => {
    window.__triggerEntryAnimation = (opts) => playEntryAnimationRef.current!(opts)
    return () => { delete (window as any).__triggerEntryAnimation }
  }, [])

  const pendingBoxRef = useRef<THREE.Box3 | null>(null)
  // Track largest bounding box across all loaded models for multi-file camera fit
  const largestBoxRef = useRef<THREE.Box3 | null>(null)
  // Which file's bbox is currently in largestBoxRef (for correct unit lookup)
  const largestBoxFileIdRef = useRef<string | null>(null)
  const prevFileCountRef = useRef(0)

  // Reset largest-box tracker when files are cleared (new file dialog selection)
  useEffect(() => {
    if (loadedFiles.length === 0 && prevFileCountRef.current > 0) {
      largestBoxRef.current = null
      useEngineStore.getState().setModelBbox(null)
    }
    prevFileCountRef.current = loadedFiles.length
  }, [loadedFiles])

  // Topology selection state — only available for GLB (not glTF, which
  // doesn't support embedded STEP_T extensions)
  const selectorRuntime = useMemo(() => {
    if (modelFormat !== 'glb' || !modelBuffer) return null
    try {
      const bundle = extractSelectorBundle(modelBuffer)
      if (!bundle) return null
      return buildSelectorRuntime(bundle, {})
    } catch {
      return null
    }
  }, [modelBuffer, modelFormat])
  const hasTopology = selectorRuntime !== null
  const hasEdges = hasTopology && selectorRuntime.edges.length > 0
  const selectionMode = useToolStore((s) => s.selectionMode)
  const hoveredReferenceId = useSelectionStore((s) => s.hoveredReferenceId)
  const selectedReferenceIds = useSelectionStore((s) => s.selectedReferenceIds)
  const setHoveredReference = useSelectionStore((s) => s.setHoveredReference)
  const setSelectedReference = useSelectionStore((s) => s.setSelectedReference)
  const [snapCandidate, setSnapCandidate] = useState<SnapCandidate | null>(null)
  const [rawClickWorldPoint, setRawClickWorldPoint] = useState<THREE.Vector3 | null>(null)
  const clickWorldPoint = activeToolMode === 'view' && selectionMode === 'face' ? rawClickWorldPoint : null
  const displayMode = useUIStore((s) => s.displayMode)
  const setDisplayMode = useUIStore((s) => s.setDisplayMode)
  const [debugSelectedFaceRow, setDebugSelectedFaceRow] = useState<number | null>(null)
  const [debugSelectedEdgeRow, setDebugSelectedEdgeRow] = useState<number | null>(null)
  const savedShadowFloorRef = useRef<boolean | null>(null)
  const [isObjectDragging, setIsObjectDragging] = useState(false)

  // Animation dialog state (shared with DesktopLayout via model-store)
  const animDialogFileId = useModelStore((s) => s.animDialogFileId)
  const closeAnimDialog = useModelStore((s) => s.closeAnimDialog)

  const animDialogFile = animDialogFileId
    ? loadedFiles.find((f) => f.id === animDialogFileId) ?? null
    : null

  // Texture preview dialog state
  const texturePreviewSlot = useMaterialStore((s) => s.texturePreviewSlot)
  const texturePreviewLabel = useMaterialStore((s) => s.texturePreviewLabel)
  const textureThumbnails = useMaterialStore((s) => s.textureThumbnails)
  const materialOverrides = useMaterialStore((s) => s.materialOverrides)
  const materialOriginals = useMaterialStore((s) => s.materialOriginals)
  const editingOverrideKey = useMaterialStore((s) => s.editingOverrideKey)

  // Auto-switch to solid mode when MaterialEditor opens
  const materialEditorVisible = useMaterialStore((s) => s.materialEditorVisible)
  const prevEditorVisible = useRef(materialEditorVisible)
  useEffect(() => {
    const justOpened = materialEditorVisible && !prevEditorVisible.current
    prevEditorVisible.current = materialEditorVisible
    if (justOpened && displayMode !== 'solid') {
      setDisplayMode('solid')
    }
  }, [materialEditorVisible, displayMode])
  const [checkerEnabled, setCheckerEnabled] = useState(false)
  const [swappedDataUri, setSwappedDataUri] = useState<string | null>(null)

  const closeTexturePreview = useCallback(() => {
    useMaterialStore.getState().closeTexturePreview()
    setCheckerEnabled(false)
    setSwappedDataUri(null)
  }, [])

  const handleCheckerToggle = useCallback((enabled: boolean) => {
    setCheckerEnabled(enabled)
  }, [])

  const handleSwapImage = useCallback(async (slot: string, dataUri: string) => {
    setCheckerEnabled(false)
    setSwappedDataUri(dataUri)

    const primaryKey = editingOverrideKey
    if (!primaryKey) return
    const { fileId, partId } = (() => {
      const idx = primaryKey.indexOf(':')
      return { fileId: primaryKey.slice(0, idx), partId: primaryKey.slice(idx + 1) }
    })()

    // Pre-load the texture into the shared cache so that
    // MaterialFactory._applyCachedTextures can find it synchronously
    // when createMaterial() is called from the store override effect.
    const cs = getMapColorSpace(slot)
    await getSharedTextureCache().load(dataUri, cs)

    // Read current override or original, update the texture slot
    const store = useMaterialStore.getState()
    const currentOverride = store.materialOverrides[primaryKey]
    const original = store.materialOriginals[primaryKey]
    const base = currentOverride ?? original
    if (!base) return

    const updated = { ...base }
    ;(updated as Record<string, unknown>)[slot] = dataUri
    store.setMaterialOverride(fileId, partId, updated)
  }, [editingOverrideKey])

  // Compute the effective texture source for the preview dialog.
  // Material appearance data is guaranteed to exist because openMaterialEditor
  // calls ensureAppearance before the editor mounts; texture preview is only
  // accessible from within the open editor.
  const effectiveTextureSrc = useMemo(() => {
    if (!texturePreviewSlot) return ''
    if (checkerEnabled) return getCheckerDataUri()
    if (swappedDataUri) return swappedDataUri
    const primaryKey = editingOverrideKey
    if (!primaryKey) {
      const thumbs = primaryKey ? textureThumbnails[primaryKey] : undefined
      return thumbs?.[texturePreviewSlot] ?? ''
    }
    const override = materialOverrides[primaryKey]
    const original = materialOriginals[primaryKey]
    const appearance = override ?? original
    if (appearance) {
      const url = (appearance as Record<string, unknown>)[texturePreviewSlot]
      if (typeof url === 'string' && url.length > 0) return url
    }
    // Fall back to thumbnail
    const thumbs = textureThumbnails[primaryKey]
    return thumbs?.[texturePreviewSlot] ?? ''
  }, [texturePreviewSlot, checkerEnabled, swappedDataUri, editingOverrideKey, materialOverrides, materialOriginals, textureThumbnails])

  const handleDisplayModeChange = useCallback((mode: DisplayMode) => {
    const isWireframeOrMesh = mode === 'wireframe' || mode === 'mesh'
    const store = useEngineStore.getState()

    if (isWireframeOrMesh) {
      if (savedShadowFloorRef.current === null) {
        savedShadowFloorRef.current = store.shadowFloorEnabled
      }
      store.setShadowFloorEnabled(false)
    } else {
      if (savedShadowFloorRef.current !== null) {
        store.setShadowFloorEnabled(savedShadowFloorRef.current)
        savedShadowFloorRef.current = null
      }
    }

    setDisplayMode(mode)
    if (mode !== 'debug') {
      setDebugSelectedFaceRow(null)
      setDebugSelectedEdgeRow(null)
    }
  }, [])

  // Ensure the dropdown value is always valid (wireframe options hidden when !hasEdges)
  const resolvedDisplayMode: DisplayMode = !hasEdges && (displayMode === 'wireframe' || displayMode === 'solidWithWireframe')
    ? 'solid'
    : displayMode

  const handleSnap = useCallback((candidate: SnapCandidate | null) => {
    setSnapCandidate(candidate)
  }, [])

  const handleClickWorldPoint = useCallback((point: THREE.Vector3 | null) => {
    setRawClickWorldPoint(point)
  }, [])

  // In point mode, snap drives the hover highlight instead of raycasting
  const snapHoveredId = useMemo(() => {
    if (selectionMode !== 'point' || !snapCandidate || !selectorRuntime) return null
    const ref = selectorRuntime.vertexReferenceByRowIndex.get(snapCandidate.referenceRowIndex)
    return ref?.id ?? null
  }, [selectionMode, snapCandidate, selectorRuntime])

  const effectiveHoveredId = selectionMode === 'point' ? snapHoveredId : hoveredReferenceId

  // Memoized geometry: single point at origin for the click-position dot
  const clickDotGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3))
    return geo
  }, [])

  // Circular texture for the click dot (avoids square PointsMaterial default)
  const clickDotTexture = useMemo(() => {
    const size = 32
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2)
    ctx.fillStyle = 'white'
    ctx.fill()
    const tex = new THREE.CanvasTexture(canvas)
    tex.needsUpdate = true
    return tex
  }, [])

  // Clear selection when leaving view mode
  useEffect(() => {
    if (activeToolMode !== 'view') {
      useSelectionStore.getState().clearSelection()
    }
  }, [activeToolMode])

  // Expose selectorRuntime to window.__r3f_dev for integration tests
  useEffect(() => {
    const dev = window.__r3f_dev
    if (dev) dev.selectorRuntime = selectorRuntime
  }, [selectorRuntime])

  // Expose OrbitControls to window.__r3f_dev for AI control API (setCameraPosition, resetCamera, zoomToFit)
  useEffect(() => {
    const dev = window.__r3f_dev
    if (dev && controlsRef.current) dev.controls = controlsRef.current
  })

  // Resolve first selected reference for HUD
  const selectedReference = useMemo(() => {
    const id = selectedReferenceIds[0]
    if (!id || !selectorRuntime) return null
    return selectorRuntime.referenceMap.get(id) ?? null
  }, [selectedReferenceIds, selectorRuntime])

  const handleModelError = useCallback((msg: string) => {
    console.error('[ViewportContainer] model load error:', msg)
    toast.error(msg)
  }, [])

  // Per-file parsed handler factory
  const makeHandleParsed = useCallback((fileId: string) => {
    return (meshes: THREE.Mesh[], objects: THREE.Object3D[], upAxis: 'y' | 'z') => {
      const file = useModelStore.getState().loadedFiles.find(f => f.id === fileId)
      if (!file) return
      // 3MF: embedded thumbnail is already handled by FileListPanel / queue —
      // don't overwrite it with a WebGL render.
      if (file.format === '3mf' && file.bambuMetadata?.thumbnailBlob) return
      const key = `${file.filePath}|${file.mtimeMs ?? 0}`
      generateThumbnailFromResult(meshes, objects, upAxis).then(blob => {
        if (blob) putThumbnail(key, blob)
      })
    }
  }, [])

  // ── Entry animation helpers ──

  interface EntryAnimConfig {
    type: string
    duration: number
    direction: string
    zoomDist: number
    zoomEndDist: number
    slideDist: number
    targetShiftY: number
    ease: string
  }

  /** Helper: parse a float from URLSearchParams, return default if missing or NaN. */
  function parseFloatParam(params: URLSearchParams, key: string, defaultVal: number): number {
    const raw = params.get(key)
    if (!raw) return defaultVal
    const v = parseFloat(raw)
    return isNaN(v) ? defaultVal : v
  }

  /** Helper: read param from pending config or URL, fallback to default. */
  function entryParam(pending: Record<string, string> | undefined, params: URLSearchParams, key: string, defaultVal: number): number {
    const raw = pending?.[key] ?? params.get(key)
    if (!raw) return defaultVal
    const v = parseFloat(raw)
    return isNaN(v) ? defaultVal : v
  }

  /** Parse entryAnim config from pending (loadModel command), URL params, or movieMode. */
  function resolveEntryConfig(movieMode: boolean): EntryAnimConfig {
    const pending = (window as any).__pendingEntryConfig as Record<string, string> | undefined
    if (pending) delete (window as any).__pendingEntryConfig

    const hash = window.location.hash
    const qIdx = hash.indexOf('?')
    const params = qIdx >= 0 ? new URLSearchParams(hash.slice(qIdx)) : new URLSearchParams()

    const explicit = pending?.entryAnim ?? params.get('entryAnim')
    const type = explicit ?? (movieMode ? 'zoom' : 'auto')
    const rawDuration = pending?.entryDuration ?? params.get('entryDuration')
    const duration = rawDuration ? parseInt(rawDuration, 10) : DEFAULT_ENTRY_DURATION_MS
    const direction = pending?.entryDir ?? (params.get('entryDir') || 'top')
    const zoomDist = entryParam(pending, params, 'entryZoomDist', 20)
    const zoomEndDist = entryParam(pending, params, 'entryZoomEndDist', 1.0)
    const slideDist = entryParam(pending, params, 'entrySlideDist', 1.0)
    const targetShiftY = entryParam(pending, params, 'entryTargetShiftY', 0)
    const ease = pending?.entryEase ?? (params.get('entryEase') || 'power2.out')
    return { type, duration, direction, zoomDist, zoomEndDist, slideDist, targetShiftY, ease }
  }

  /** Compute camera start position for entry animation (zoom / slide). */
  function computeEntryStartPos(
    type: string,
    fitPos: THREE.Vector3,
    center: THREE.Vector3,
    direction: string,
    upAxis: string,
    fitDist: number,
    zoomDist: number,
    slideDist: number,
  ): THREE.Vector3 {
    if (type === 'zoom') {
      const dir = new THREE.Vector3().copy(fitPos).sub(center).normalize()
      return center.clone().add(dir.multiplyScalar(fitDist * zoomDist))
    }
    if (type === 'slide') {
      const dir = new THREE.Vector3().copy(fitPos).sub(center).normalize()
      const worldUp = upAxis === 'y' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1)
      const right = new THREE.Vector3().crossVectors(dir, worldUp).normalize()
      const up = new THREE.Vector3().crossVectors(right, dir).normalize()
      const offsetMap: Record<string, THREE.Vector3> = {
        top:    up.clone().multiplyScalar(-fitDist * slideDist),
        bottom: up.clone().multiplyScalar(fitDist * slideDist),
        left:   right.clone().multiplyScalar(-fitDist * slideDist),
        right:  right.clone().multiplyScalar(fitDist * slideDist),
      }
      return fitPos.clone().add(offsetMap[direction] || offsetMap.top)
    }
    return fitPos.clone()
  }

  /**
   * Play entry animation (auto / zoom / slide / fade) on demand.
   * Returns a Promise that resolves when the animation completes.
   */
  const playEntryAnimation = useCallback((overrides?: {
    type?: string
    duration?: number
    direction?: string
    zoomDist?: number
    zoomEndDist?: number
    slideDist?: number
    targetShiftY?: number
    ease?: string
    reverse?: boolean
  }): Promise<void> => {
    return new Promise<void>((resolve) => {
      const actualType = overrides?.type ?? 'auto'

      if (actualType === 'fade') {
        const rev = overrides?.reverse ?? false
        const dur = overrides?.duration ?? DEFAULT_ENTRY_DURATION_MS
        const es = overrides?.ease ?? 'power2.out'
        const st = useModelStore.getState()
        const fileId = st.activeFileId ?? st.loadedFiles[0]?.id
        if (!fileId) { resolve(); return }
        const group = modelGroupMapRef.current.get(fileId)
        if (!group) { resolve(); return }
        const mats: THREE.Material[] = []
        group.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            const ms = Array.isArray(child.material) ? child.material : [child.material]
            for (const m of ms) {
              if (m && !mats.includes(m)) mats.push(m)
            }
          }
        })
        if (mats.length === 0) { resolve(); return }
        const startOp = rev ? 1 : 0
        const endOp = rev ? 0 : 1
        mats.forEach(m => { m.transparent = true; m.needsUpdate = true; m.opacity = startOp })
        if (rev) {
          group.traverse((child) => {
            if (child instanceof THREE.Mesh) child.castShadow = false
          })
        }
        const proxy = { opacity: startOp }
        gsap.to(proxy, {
          opacity: endOp,
          duration: dur / 1000,
          ease: es,
          onUpdate: () => { mats.forEach(m => { m.opacity = proxy.opacity }) },
          onComplete: () => {
            if (endOp === 1) mats.forEach(m => { m.transparent = false; m.needsUpdate = true })
            resolve()
          },
        })
        return
      }

      const controls = controlsRef.current
      if (!controls) { resolve(); return }
      const camera = controls.object
      if (!(camera instanceof THREE.PerspectiveCamera)) { resolve(); return }

      const bboxArr = useEngineStore.getState().modelBbox
      if (!bboxArr) { resolve(); return }
      const box = new THREE.Box3(
        new THREE.Vector3(bboxArr[0], bboxArr[1], bboxArr[2]),
        new THREE.Vector3(bboxArr[3], bboxArr[4], bboxArr[5]),
      )

      const hash = window.location.hash
      const qIdx = hash.indexOf('?')
      const params = qIdx >= 0 ? new URLSearchParams(hash.slice(qIdx)) : new URLSearchParams()
      const type = overrides?.type ?? params.get('entryAnim') ?? 'auto'
      const duration = overrides?.duration ?? (params.get('entryDuration') ? parseInt(params.get('entryDuration')!, 10) : DEFAULT_ENTRY_DURATION_MS)
      const direction = overrides?.direction ?? params.get('entryDir') ?? 'top'
      const zoomDist = overrides?.zoomDist ?? parseFloatParam(params, 'entryZoomDist', 20)
      const zoomEndDist = overrides?.zoomEndDist ?? parseFloatParam(params, 'entryZoomEndDist', 1.0)
      const slideDist = overrides?.slideDist ?? parseFloatParam(params, 'entrySlideDist', 1.0)
      const targetShiftY = overrides?.targetShiftY ?? parseFloatParam(params, 'entryTargetShiftY', 0)
      const ease = overrides?.ease ?? params.get('entryEase') ?? 'power2.out'
      const reverse = overrides?.reverse ?? false

      if (type === 'auto') {
        const upAxis = useModelStore.getState().activeUpAxis
        const targetUp = upAxis === 'y'
          ? new THREE.Vector3(0, 1, 0)
          : new THREE.Vector3(0, 0, 1)
        const domElement = controls.domElement!
        const viewport = { width: domElement.clientWidth, height: domElement.clientHeight }
        const result = computeCameraFitTarget(camera, box, viewport, 'model', upAxis)
        if (result) {
          controls.target.copy(result.target)
          controls.update()
          animateCamera(result.position, targetUp, resolve, duration, result.target)
        } else {
          resolve()
        }
        return
      }

      // zoom / slide
      const upAxis = useModelStore.getState().activeUpAxis
      const domElement = controls.domElement!
      const viewport = { width: domElement.clientWidth, height: domElement.clientHeight }
      const result = computeCameraFitTarget(camera, box, viewport, 'model', upAxis)
      if (!result) { resolve(); return }

      const center = box.getCenter(new THREE.Vector3())
      controls.target.copy(center)
      controls.update()

      const fitPos = result.position
      const fitDist = fitPos.distanceTo(center)
      const isSlide = type === 'slide'
      const modelHeight = upAxis === 'z'
        ? box.max.z - box.min.z
        : box.max.y - box.min.y

      const rawStartPos = computeEntryStartPos(type, fitPos, center, direction, upAxis, fitDist, zoomDist, slideDist)
      const viewDir = new THREE.Vector3().copy(fitPos).sub(center).normalize()
      const rawEndPos = center.clone().add(viewDir.multiplyScalar(fitDist * zoomEndDist))

      if (targetShiftY !== 0) {
        const worldUp = upAxis === 'y' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1)
        const shift = worldUp.multiplyScalar(modelHeight * targetShiftY)
        rawStartPos.add(shift)
        rawEndPos.add(shift)
      }

      const startPos = reverse ? rawEndPos.clone() : rawStartPos
      const endPos = reverse ? rawStartPos.clone() : rawEndPos

      let fitQuat: THREE.Quaternion | null = null
      if (isSlide) {
        const tmp = camera.clone()
        tmp.position.copy(endPos)
        tmp.lookAt(center)
        fitQuat = tmp.quaternion.clone()
      }

      camera.position.copy(startPos)
      if (isSlide && fitQuat) {
        camera.quaternion.copy(fitQuat)
        controls.target.copy(center)
      } else {
        controls.update()
      }

      gsap.killTweensOf(camProxyRef.current)
      setRotating(false)
      setIsCameraAnimating(true)
      useEngineStore.getState().set__animActive(true)

      const targetUp = upAxis === 'y'
        ? new THREE.Vector3(0, 1, 0)
        : new THREE.Vector3(0, 0, 1)
      camera.up.copy(targetUp)

      const p = camProxyRef.current
      p.x = startPos.x; p.y = startPos.y; p.z = startPos.z
      p.upX = targetUp.x; p.upY = targetUp.y; p.upZ = targetUp.z

      gsap.to(p, {
        x: endPos.x, y: endPos.y, z: endPos.z,
        upX: targetUp.x, upY: targetUp.y, upZ: targetUp.z,
        duration: duration / 1000,
        ease,
        onUpdate: () => {
          controls.object.position.set(p.x, p.y, p.z)
          controls.object.up.set(p.upX, p.upY, p.upZ).normalize()
          if (!isSlide) {
            controls.update()
          }
        },
        onComplete: () => {
          if (isSlide) {
            controls.update()
          }
          setIsCameraAnimating(false)
          useEngineStore.getState().set__animActive(false)
          resolve()
        },
      })
    })
  }, [animateCamera])

  const playEntryAnimationRef = useRef(playEntryAnimation)

  const applyCameraFit = useCallback((box: THREE.Box3, controls: OrbitControlsImpl, focusTarget: 'bed' | 'model' = 'model', durationMs?: number) => {
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    if (maxDim === 0) return

    const camera = controls.object
    const targetUp = activeUpAxis === 'y'
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(0, 0, 1)

    // Use OrcaSlicer algorithm for perspective camera fit
    if (camera instanceof THREE.PerspectiveCamera) {
      const domElement = controls.domElement
      const viewport = { width: domElement.clientWidth, height: domElement.clientHeight }

      const result = computeCameraFitTarget(camera, box, viewport, focusTarget, activeUpAxis)
      if (result) {
        controls.target.copy(result.target)
        controls.update()
        animateCamera(result.position, targetUp, undefined, durationMs ?? 1000, result.target)
        return
      }
      // Fall through to fallback on compute failure
    }

    // Fallback for non-perspective camera or compute failure.
    // Keep X offset = 0 so the world X-axis stays horizontal on screen.
    const center = box.getCenter(new THREE.Vector3())
    let dist: number
    if (camera instanceof THREE.PerspectiveCamera) {
      const fitDist = maxDim / (2 * Math.tan((camera.fov * Math.PI) / 360))
      dist = Math.max(fitDist / 0.5, camera.near * 10)
    } else {
      dist = maxDim * 1.5
    }
    const upAxisForFallback = useModelStore.getState().activeUpAxis
    const pos = center.clone().add(
      upAxisForFallback === 'y'
        ? new THREE.Vector3(0, dist * 0.6, -dist * 0.7)
        : new THREE.Vector3(0, -dist * 0.7, dist * 0.6),
    )

    controls.target.copy(center)
    controls.update()
    animateCamera(pos, targetUp, undefined, undefined, center)
  }, [activeUpAxis, animateCamera])

  /** Compute union bounding box of all plates for multi-plate camera fit. */
  function computeMultiPlateBoundingBox(configs: import('@/engine/heatbed').PlateBedConfig[]): THREE.Box3 {
    const plateDims = new Map<number, { width: number; depth: number }>()
    for (const c of configs) {
      plateDims.set(c.plateId, { width: c.dimensions.width, depth: c.dimensions.depth })
    }
    const layout = computePlateLayout(plateDims)
    const allPlatesBox = new THREE.Box3()
    for (const entry of layout) {
      const config = configs.find(c => c.plateId === entry.plateId)
      if (!config) continue
      const hw = config.dimensions.width / 2
      const hd = config.dimensions.depth / 2
      allPlatesBox.expandByPoint(new THREE.Vector3(
        entry.centerX - hw, entry.centerY - hd, 0,
      ))
      allPlatesBox.expandByPoint(new THREE.Vector3(
        entry.centerX + hw, entry.centerY + hd, 0,
      ))
    }
    return allPlatesBox
  }

  const handleModelLoaded = useCallback((box: THREE.Box3, fileId?: string) => {
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    const current = largestBoxRef.current
    if (!current) {
      largestBoxRef.current = box.clone()
      largestBoxFileIdRef.current = fileId ?? null
    } else {
      const curSize = current.getSize(new THREE.Vector3())
      if (maxDim > Math.max(curSize.x, curSize.y, curSize.z)) {
        largestBoxRef.current = box.clone()
        largestBoxFileIdRef.current = fileId ?? null
      }
    }
    // Store bbox for ShadowFloor positioning
    const b = largestBoxRef.current
    useEngineStore.getState().setModelBbox([b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z])

    const store = useEngineStore.getState()
    const modelStoreState = useModelStore.getState()

    // Populate bambuPlateConfigs from active file if multi-plate
    {
      const activeFile = modelStoreState.loadedFiles.find(
        f => f.id === modelStoreState.activeFileId,
      )
      const bambuMeta = activeFile?.bambuMetadata
      if (bambuMeta && bambuMeta.plates.size >= 1) {
        const configs: import('@/engine/heatbed').PlateBedConfig[] = []
        for (const [plateId, plateInfo] of bambuMeta.plates) {
          configs.push({
            plateId,
            plateName: plateInfo.plateName || `Plate ${plateId}`,
            dimensions: {
              width: plateInfo.size?.width ?? 200,
              depth: plateInfo.size?.depth ?? 200,
            },
            selected: configs.length === 0,
          })
        }
        store.setBambuPlateConfigs(configs)
        store.setSelectedPlateId(configs[0]?.plateId ?? null)
      } else if (!activeFile || !activeFile.bambuMetadata) {
        store.setBambuPlateConfigs(null)
        store.setSelectedPlateId(null)
      }
    }

    // Re-read the store — bambuPlateConfigs was just mutated above.
    const store2 = useEngineStore.getState()
    const hasMultiPlate = store2.bambuPlateConfigs && store2.bambuPlateConfigs.length > 0

    // Source unit is always per-file (all files go through loadedFiles).
    // For bed sizing, use the dominant file's unit (the one that owns largestBoxRef).
    const dominantFile = largestBoxFileIdRef.current
      ? modelStoreState.loadedFiles.find(f => f.id === largestBoxFileIdRef.current)
      : null
    const bedSourceUnit: UnitSystem = dominantFile?.sourceUnit ?? 'millimeter'

    // Auto-select bed size from model (single-bed path only).
    // Always update bedSize / bedRawToMM even when showHeatbed is false,
    // so the bed is correctly sized when the user later toggles it on.
    let bedSize = store2.bedSize
    if (largestBoxRef.current && !hasMultiPlate) {
      const rawToMM = UNIT_TO_MM[bedSourceUnit]
      const autoSize = autoSelectBedSize(largestBoxRef.current, rawToMM)
      bedSize = autoSize
      if (Math.abs(autoSize - store2.bedSize) > 0.001 || Math.abs(rawToMM - store2.bedRawToMM) > 0.001) {
        useEngineStore.setState({ bedSize: autoSize, bedRawToMM: rawToMM })
      }
    }

    const controls = controlsRef.current
    if (!controls) {
      pendingBoxRef.current = largestBoxRef.current.clone()
      return
    }
    pendingBoxRef.current = null

    if (store2.showHeatbed && hasMultiPlate) {
      applyCameraFit(computeMultiPlateBoundingBox(store2.bambuPlateConfigs!), controls, 'model')
    } else if (store2.showHeatbed) {
      const h = bedSize / 2
      const bedBox = new THREE.Box3(
        new THREE.Vector3(-h, -h, 0),
        new THREE.Vector3(h, h, 0),
      )
      applyCameraFit(bedBox, controls, 'bed')
    } else {
      applyCameraFit(largestBoxRef.current, controls, 'model')
    }

    // Entry animation: zoom/slide/fade on model load
    const movieMode = useEngineStore.getState().movieMode
    const cfg = resolveEntryConfig(movieMode)
    if (cfg.type !== 'auto') {
      const upAxis = useModelStore.getState().activeUpAxis
      if (cfg.type === 'fade') {
        playEntryAnimationRef.current!({ type: 'fade', duration: cfg.duration, ease: cfg.ease })
      } else {
        const bboxArr = useEngineStore.getState().modelBbox
        if (bboxArr) {
          const box = new THREE.Box3(
            new THREE.Vector3(bboxArr[0], bboxArr[1], bboxArr[2]),
            new THREE.Vector3(bboxArr[3], bboxArr[4], bboxArr[5]),
          )
          const domElement = controls.domElement!
          const viewport = { width: domElement.clientWidth, height: domElement.clientHeight }
          const result = computeCameraFitTarget(controls.object as THREE.PerspectiveCamera, box, viewport, 'model', upAxis)
          if (result) {
            const center = box.getCenter(new THREE.Vector3())
            const rawStartPos = computeEntryStartPos(cfg.type, result.position, center, cfg.direction, upAxis, result.position.distanceTo(center), cfg.zoomDist, cfg.slideDist)
            controls.object.position.copy(rawStartPos)
            controls.update()
            playEntryAnimationRef.current!({ type: cfg.type, duration: cfg.duration, direction: cfg.direction, zoomDist: cfg.zoomDist, zoomEndDist: cfg.zoomEndDist, slideDist: cfg.slideDist, targetShiftY: cfg.targetShiftY, ease: cfg.ease })
          }
        }
      }
    }

    modelLoadCompletedRef.current = true
  }, [applyCameraFit])

  // Stop rotation when all files are removed (resetViewer).
  useEffect(() => {
    const unsub = useModelStore.subscribe((state, prevState) => {
      if (state.loadedFiles.length === 0 && prevState.loadedFiles.length > 0) {
        stopRotation()
      }
    })
    return unsub
  }, [stopRotation])

  // User interaction stops rotation: pointer drag and scroll only (not keydown,
  // so Alt+R / Alt+P and other shortcuts aren't accidentally intercepted).
  useEffect(() => {
    if (!rotating) return

    const stop = () => {
      stopRotation()
      window.dispatchEvent(new CustomEvent('rotateStopped'))
    }

    const canvas = controlsRef.current?.domElement
    if (!canvas) return

    canvas.addEventListener('pointerdown', stop)
    canvas.addEventListener('wheel', stop)

    return () => {
      canvas.removeEventListener('pointerdown', stop)
      canvas.removeEventListener('wheel', stop)
    }
  }, [rotating, stopRotation])

  // Initialize showHeatbed default when model format changes
  useEffect(() => {
    if (modelFormat) {
      initShowHeatbed(modelFormat, modelBuffer)
    }
  }, [modelFormat, modelBuffer, initShowHeatbed])

  // Apply pending camera fit once OrbitControls ref is available
  useEffect(() => {
    const controls = controlsRef.current
    const box = pendingBoxRef.current
    if (!controls || !box) return
    pendingBoxRef.current = null
    const store = useEngineStore.getState()
    const hasMultiPlate = store.bambuPlateConfigs && store.bambuPlateConfigs.length > 0
    if (store.showHeatbed && hasMultiPlate) {
      const allPlatesBox = computeMultiPlateBoundingBox(store.bambuPlateConfigs!)
      applyCameraFit(allPlatesBox, controls, 'model')
    } else if (store.showHeatbed) {
      const h = store.bedSize / 2  // scene units
      const gz = useEngineStore.getState().modelBbox?.[2] ?? 0
      const bedBox = new THREE.Box3(
        new THREE.Vector3(-h, -h, gz),
        new THREE.Vector3(h, h, gz),
      )
      applyCameraFit(bedBox, controls, 'bed')
    } else {
      applyCameraFit(box, controls, 'model')
    }
  }, [applyCameraFit, modelBuffer])

  const _handleResetCamera = useCallback(() => {
    const controls = controlsRef.current
    const groupMap = modelGroupMapRef.current
    if (!controls) return

    const store = useEngineStore.getState()

    // OrcaSlicer: if heatbed is visible, zoom_to_bed()
    const hasMultiPlate = store.bambuPlateConfigs && store.bambuPlateConfigs.length > 0
    if (store.showHeatbed && hasMultiPlate) {
      const allPlatesBox = computeMultiPlateBoundingBox(store.bambuPlateConfigs!)
      applyCameraFit(allPlatesBox, controls, 'model')
      return
    } else if (store.showHeatbed) {
      const h = store.bedSize / 2  // scene units
      const gz = useEngineStore.getState().modelBbox?.[2] ?? 0
      const bedBox = new THREE.Box3(
        new THREE.Vector3(-h, -h, gz),
        new THREE.Vector3(h, h, gz),
      )
      applyCameraFit(bedBox, controls, 'bed')
      return
    }

    // Recompute bounding box from current model state to handle scale transforms,
    // traversing all loaded model groups (multi-file support).
    if (groupMap && groupMap.size > 0) {
      const box = new THREE.Box3()
      for (const group of groupMap.values()) {
        group.traverse((child) => {
          if (child instanceof THREE.Mesh && child.visible) {
            const geo = child.geometry
            if (geo?.boundingBox) {
              const worldBox = geo.boundingBox.clone()
              worldBox.applyMatrix4(child.matrixWorld)
              box.union(worldBox)
            } else {
              // Fallback: compute from geometry attributes
              const pos = geo.getAttribute('position')
              if (pos) {
                const tempBox = new THREE.Box3().setFromBufferAttribute(pos)
                tempBox.applyMatrix4(child.matrixWorld)
                box.union(tempBox)
              }
            }
          }
        })
      }
      if (!box.isEmpty()) {
        applyCameraFit(box, controls, 'model')
        return
      }
    }

    // Fallback: if no model loaded, use default view
    const defaultPos = new THREE.Vector3(...DEFAULT_CAM_POS)
    const defaultUp = activeUpAxis === 'y'
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(0, 0, 1)
    controls.target.set(0, 0, 0)
    controls.update()
    animateCamera(defaultPos, defaultUp)
  }, [applyCameraFit])

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Canvas
        style={{ width: '100%', height: '100%', background: canvasBackground }}
        scene={{ up: [0, 0, 1] as unknown as THREE.Vector3 }}
        camera={{ fov: 50, near: 0.001, far: 10000, position: DEFAULT_CAM_POS, up: [0, 0, 1] as [number, number, number] }}
        shadows="accumulative"
        gl={{ antialias: true, alpha: true, stencil: true, preserveDrawingBuffer: true, logarithmicDepthBuffer: true, outputColorSpace: THREE.SRGBColorSpace, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }}
        onCreated={({ camera, scene, gl }) => {
          gl.shadowMap.enabled = true
          gl.shadowMap.type = THREE.PCFShadowMap
          gl.shadowMap.needsUpdate = true
          useEngineStore.getState().setEngineObjects({ camera, scene, gl })
          window.__r3f_dev = { camera, scene, gl }
          window.__engineStore = useEngineStore
          window.__uiStore = useUIStore

          // Detect software GPU at init time (while WebGL context is fresh).
          // E2E tests read window.__isSoftwareGpu instead of probing WebGL
          // themselves, which can hang on SwiftShader / ANGLE software backends.
          try {
            const ctx = gl.getContext()
            const ext = ctx?.getExtension('WEBGL_debug_renderer_info')
            const vendor: string = ext ? ctx.getParameter(ext.UNMASKED_VENDOR_WEBGL) : ''
            const renderer: string = ext ? ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ''
            const lower = `${vendor} ${renderer}`.toLowerCase()
            const swPatterns = ['llvmpipe', 'swiftshader', 'microsoft basic render', 'mesa offscreen']
            const patternHit = swPatterns.some(p => lower.includes(p))
            const emptySwiftshader = !!(ext && vendor === '' && renderer === '')
            window.__isSoftwareGpu = patternHit || emptySwiftshader
          } catch {
            window.__isSoftwareGpu = false
          }
        }}
      >
        <OrbitControls ref={controlsRef} makeDefault enableDamping enabled={activeToolMode === 'view' && !isCameraAnimating && !isObjectDragging && !rotating && controlsEnabled} />
        <UpAxisAnimator upAxis={activeUpAxis} animateCamera={animateCamera} />
        <CameraModeSwitcher />
        <SceneSetup />
        <PostProcessing />
        <CrossSectionRenderer />
        <ZebraRenderer />
        <DraftAnalysisRenderer />
        <SurfaceAnalysisRenderer />
        <CurvatureCombRenderer selectorRuntime={selectorRuntime} modelGroupMapRef={modelGroupMapRef} />
        <ModelTransformTracker modelGroupMapRef={modelGroupMapRef} />
        {loadedFiles.length > 0 ? (
          loadedFiles.map((file) => (
            <group key={file.id}>
              <ModelGroup
                ref={(g: THREE.Group | null) => {
                  if (g) {
                    modelGroupMapRef.current.set(file.id, g)
                  } else {
                    modelGroupMapRef.current.delete(file.id)
                  }
                }}
                buffer={file.buffer}
                format={file.format}
                fileId={file.id}
                filePath={file.filePath}
                sceneTree={file.sceneTree}
                glbPartInfos={file.glbPartInfos}
                fileName={file.fileName}
                onSceneTreeChange={(tree) => updateFileSceneTree(file.id, tree)}
                onPartInfosChange={(infos) => updateFilePartInfos(file.id, infos)}
                onCenteringOffsetChange={(offset) => updateFileCenteringOffset(file.id, offset)}
                onLoadingPhaseChange={(phase) => updateFileLoadingPhase(file.id, phase)}
                onSourceUnitChange={(unit) =>
                  useModelStore.getState().updateFileSourceUnit(file.id, unit as UnitSystem)
                }
                onParsed={makeHandleParsed(file.id)}
                onLoaded={(box) => handleModelLoaded(box, file.id)}
                onError={handleModelError}
                onAnimationsReady={(sceneRoot, animations) =>
                  useModelStore.getState().updateFileAnimations(file.id, sceneRoot, animations)
                }
                selectorRuntime={file.id === activeFileId ? selectorRuntime : null}
                displayMode={resolvedDisplayMode}
                checkerEnabled={checkerEnabled}
                checkerSlot={checkerEnabled ? texturePreviewSlot : null}
              />
            </group>
          ))
        ) : (
          <ModelGroup
            ref={(g: THREE.Group | null) => {
              const key = '__single__'
              if (g) {
                modelGroupMapRef.current.set(key, g)
              } else {
                modelGroupMapRef.current.delete(key)
              }
            }}
            buffer={modelBuffer}
            format={modelFormat}
            filePath={useModelStore.getState().modelFilePath}
            sceneTree={useModelStore.getState().sceneTree}
            glbPartInfos={useModelStore.getState().glbPartInfos}
            onSceneTreeChange={(tree) => useModelStore.getState().updateSceneTree(tree)}
            onPartInfosChange={(infos) => useModelStore.getState().setGlbPartInfos(infos)}
            onCenteringOffsetChange={(offset) => useModelStore.getState().setModelCenteringOffset(offset)}
            onLoadingPhaseChange={(phase) => useModelStore.getState().setLoadingPhase(phase)}
            onFileGroupChange={(group) => useModelStore.getState().setFileGroup(group as FileGroup)}
            onLoaded={handleModelLoaded}
            onError={handleModelError}
            selectorRuntime={selectorRuntime}
            displayMode={resolvedDisplayMode}
            checkerEnabled={checkerEnabled}
            checkerSlot={checkerEnabled ? texturePreviewSlot : null}
          />
        )}
        <ToolOverlay modelGroupMapRef={modelGroupMapRef} />
        {hasTopology && <TopologyOverlay selectorRuntime={selectorRuntime} selectedPartIds={selectedReferenceIds} />}
        {((resolvedDisplayMode === 'wireframe' || resolvedDisplayMode === 'solidWithWireframe') && hasEdges || resolvedDisplayMode === 'debug' && hasEdges) && (
          <DebugTopologyOverlay selectorRuntime={selectorRuntime!} centeringOffset={centeringOffset} showVertices={displayMode === 'debug'} />
        )}
        <TopologyPicker
          enabled={activeToolMode === 'view'}
          selectionMode={selectionMode}
          selectorRuntime={selectorRuntime}
          modelGroupMapRef={modelGroupMapRef}
          onHover={setHoveredReference}
          onClick={(id, shiftKey) => setSelectedReference(id, { shiftKey })}
          onSnap={handleSnap}
          onClickWorldPoint={handleClickWorldPoint}
          enableObjectDrag={selectionMode === 'object'}
          selectedPartIds={selectedReferenceIds}
          onDragActiveChange={setIsObjectDragging}
        />
        <SelectionHighlight
          runtime={selectorRuntime}
          referenceId={effectiveHoveredId}
          color="#ffffff"
          opacity={0.25}
          modelGroupMapRef={modelGroupMapRef}
          renderOrder={resolvedDisplayMode === 'wireframe' ? 4 : 2}
        />
        {selectedReferenceIds
          .filter((id) => {
            // In object mode, all IDs (partIds) are valid.
            // In face/edge/point mode, only topology references (in referenceMap) are valid.
            // PartIds are NOT in the topology referenceMap and would fall through to
            // buildObjectHighlightGeometry, rendering the entire object in blue.
            if (selectionMode === 'object') return true
            return selectorRuntime?.referenceMap.has(id) ?? false
          })
          .map((id) => (
            <SelectionHighlight
              key={id}
              runtime={selectorRuntime}
              referenceId={id}
              color={selectionMode === 'object' ? '#ffffff' : '#2563eb'}
              opacity={selectionMode === 'object' ? 0.08 : (resolvedDisplayMode === 'wireframe' ? 0.8 : 0.5)}
              modelGroupMapRef={modelGroupMapRef}
              renderOrder={resolvedDisplayMode === 'wireframe' ? 5 : 2}
            />
          ))}
        {selectionMode === 'object' && selectedReferenceIds.length > 0 && (
          <SelectionBoundingBox
            key={selectedReferenceIds.join(',')}
            selectedPartIds={selectedReferenceIds}
            modelGroupMapRef={modelGroupMapRef}
          />
        )}
        {clickWorldPoint && selectionMode === 'face' && (
          <points
            position={clickWorldPoint}
            geometry={clickDotGeo}
            frustumCulled={false}
            renderOrder={3}
          >
            <pointsMaterial
              color="red"
              size={5}
              sizeAttenuation={false}
              map={clickDotTexture}
              depthTest
              depthWrite={false}
              toneMapped={false}
            />
          </points>
        )}
      </Canvas>

      <div
        style={{
          position: 'absolute',
          bottom: 16,
          left: 16,
          display: 'flex',
          gap: 8,
          zIndex: 10,
          transform: isFullscreen && !bottomVisible ? 'translateY(calc(100% + 16px))' : 'translateY(0)',
          opacity: isFullscreen && !bottomVisible ? 0 : 1,
          transition: isFullscreen ? 'transform 0.5s ease-in-out, opacity 0.5s ease-in-out' : 'none',
        }}
      >
        <SelectionToolbar hasTopology={hasTopology} hasEdges={hasEdges} />
        <DisplayModeDropdown displayMode={resolvedDisplayMode} onChange={handleDisplayModeChange} hasTopology={hasTopology} hasEdges={hasEdges} />
        {displayMode === 'debug' && selectorRuntime && (
          <>
            <select
              value={debugSelectedFaceRow ?? ''}
              onChange={(e) => {
                const row = e.target.value !== '' ? Number(e.target.value) : null
                setDebugSelectedFaceRow(row)
                if (row != null && selectorRuntime) {
                  const ref = selectorRuntime.faceReferenceByRowIndex.get(row)
                  if (ref) useSelectionStore.getState().setSelectedReference(ref.id)
                } else {
                  useSelectionStore.getState().setSelectedReference(null)
                }
              }}
              style={{
                background: 'transparent',
                color: '#aaa',
                border: 'none',
                fontSize: 12,
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="">{t('debug.selectFace')}</option>
              {selectorRuntime.faces.map((f, i) => (
                <option key={i} value={i}>{f.id} {f.surfaceType}</option>
              ))}
            </select>
            <select
              value={debugSelectedEdgeRow ?? ''}
              onChange={(e) => {
                const row = e.target.value !== '' ? Number(e.target.value) : null
                setDebugSelectedEdgeRow(row)
                if (row != null && selectorRuntime) {
                  const ref = selectorRuntime.edgeReferenceByRowIndex.get(row)
                  if (ref) useSelectionStore.getState().setSelectedReference(ref.id)
                } else {
                  useSelectionStore.getState().setSelectedReference(null)
                }
              }}
              style={{
                background: 'transparent',
                color: '#aaa',
                border: 'none',
                fontSize: 12,
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="">{t('debug.selectEdge')}</option>
              {selectorRuntime.edges.map((e, i) => (
                <option key={i} value={i}>{e.id} {e.curveType}</option>
              ))}
            </select>
          </>
        )}
      </div>
      <SelectionInfoOverlay reference={selectedReference} />

      <CrossSectionPanel />
      <ZebraPanel />
      <DraftAnalysisPanel />
      <SurfaceAnalysisPanel />
      <CurvatureCombPanel />
      <AxesIndicator mainCamera={mainCamera} />

      {/* Texture Preview Dialog */}
      <TexturePreviewDialog
        visible={texturePreviewSlot !== null}
        onClose={closeTexturePreview}
        textureSrc={effectiveTextureSrc}
        slotName={texturePreviewSlot ?? ''}
        pbrName={texturePreviewLabel ?? ''}
        onSwapImage={handleSwapImage}
        checkerEnabled={checkerEnabled}
        onCheckerToggle={handleCheckerToggle}
        checkerDisabled={displayMode !== 'solid'}
      />

      {/* Animation Player Dialog */}
      <AnimationPlayerDialog
        open={animDialogFileId !== null}
        onClose={closeAnimDialog}
        sceneRoot={animDialogFile?.sceneRoot}
        clips={animDialogFile?.animations ?? []}
        fileName={animDialogFile?.fileName}
      />
    </div>
  )
}
