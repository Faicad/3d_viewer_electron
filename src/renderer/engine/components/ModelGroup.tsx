import { useCallback, useEffect, useRef, useState, useMemo, forwardRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries as mergeBufferGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { type GlbPartInfo, type SceneTreeNode } from '@/stores/model-store'
import { useEngineStore } from '@/stores/engine-store'
import type { SelectorRuntime } from '@/lib/topology/types'
import { buildGlbFaceIdsForPart } from '@/lib/topology/build-face-ids'
import { flattenVisibility } from '@/lib/scene-tree-utils'
import type { DisplayMode } from './DisplayModeDropdown'
import { loadFormat } from '@/engine/formatLoaders'
import type { FormatId } from '@/config/file-formats'
import { FORMAT_MAP } from '@/config/file-formats'
import { getDefaultUpAxis, isStepFile } from '@/config/file-formats'
import { parse3mfUnit, parseAmfUnit, guessStlUnit, UNIT_TO_MM } from '@/config/file-formats'
import { getCachedResult, setCachedResult, markLoaded, clearLoaded } from '@/engine/loaderResultCache'
import { setActiveFileIdForTexCache } from '@/engine/formatLoaders'
import { cloneMeshGeometry, initMorphTargets } from './cloneMeshGeometry'
import { cloneAndConvertMaterial, createDefaultMaterial, disposeMaterial, getMaterialColor, materialToAppearance } from './cloneMaterial'
import { useMaterialStore } from '@/stores/material-store'
import { useGlbExtensionStore } from '@/stores/glb-extension-store'
import { getSharedMaterialFactory, getSharedTextureCache } from '@/engine/material/MaterialFactory'
import { getMapColorSpace } from '@/engine/material/TextureCache'
import { createCheckerTexture } from '@/engine/material/checkerTexture'
import { computePlateLayout } from '@/engine/heatbed'
import type { PlateLayoutEntry } from '@/engine/heatbed'
import { computeViewDelta } from '@/lib/bambu-3mf/viewTransforms'
import { yieldToUI, resetYieldTimer } from '@/lib/async-utils'

// ---- types ----

interface ModelGroupProps {
  buffer: ArrayBuffer | null
  format: FormatId | null
  fileId?: string
  filePath?: string | null
  sceneTree: SceneTreeNode[]
  glbPartInfos: GlbPartInfo[]
  fileName?: string
  onSceneTreeChange: (tree: SceneTreeNode[]) => void
  onPartInfosChange: (infos: GlbPartInfo[]) => void
  onCenteringOffsetChange: (offset: [number, number, number] | null) => void
  onLoadingPhaseChange: (phase: 'idle' | 'loading' | 'done' | 'error') => void
  onSourceUnitChange?: (unit: string) => void
  onFileGroupChange?: (group: string) => void
  onParsed?: (meshes: THREE.Mesh[], objects: THREE.Object3D[], upAxis: 'y' | 'z') => void
  onLoaded?: (box: THREE.Box3) => void
  onAnimationsReady?: (sceneRoot: THREE.Object3D, animations: THREE.AnimationClip[]) => void
  onError?: (message: string) => void
  selectorRuntime?: SelectorRuntime | null
  displayMode?: DisplayMode
  checkerEnabled?: boolean
  checkerSlot?: string | null
}


function mergeGeometries(meshes: THREE.Mesh[]): THREE.BufferGeometry {
  const geoms = meshes.map((m) => {
    const g = m.geometry.clone()
    g.applyMatrix4(m.matrixWorld)
    return g
  })
  if (geoms.length === 0) return new THREE.BufferGeometry()
  if (geoms.length === 1) return geoms[0]
  return mergeBufferGeometries(geoms, false)
}

/**
 * Detect when a material is the Three.js internal default — a plain
 * MeshBasicMaterial({ color: 0xffffff }) that Three.js auto-assigns
 * when `new THREE.Mesh(geo)` is called without a material argument.
 *
 * Formats like .model, .stl, .ply, .drc, .md2 carry no material data.
 * Their meshes should NOT inherit the Three.js white default; the
 * render layer should apply its own default material instead.
 */
function isThreeJsDefaultMaterial(mat: THREE.Material): boolean {
  if (!(mat instanceof THREE.MeshBasicMaterial)) return false
  // White is the factory default. A file-defined white material would
  // typically arrive as MeshStandardMaterial (GLTF) or carry texture
  // maps — plain MeshBasicMaterial white means "no material data".
  if (mat.color.getHex() !== 0xffffff) return false
  if (mat.map || mat.alphaMap) return false
  return true
}

/** Recursively set skinning=true on a material or array of materials. */
function setSkinningFlag(
  mat: THREE.Material | THREE.Material[] | null,
  value: boolean,
): void {
  if (mat == null) return
  if (Array.isArray(mat)) {
    for (const m of mat) setSkinningFlag(m, value)
    return
  }
  if ('skinning' in mat) {
    ;(mat as THREE.MeshStandardMaterial).skinning = value
    mat.needsUpdate = true
  }
}

// ---- multi-mesh rendering constants ----
const MULTI_MESH_FORMATS: FormatId[] = ['glb', 'gltf', '3mf', 'model', 'fbx', 'dae', '3ds', 'usdz', 'vox', 'kmz', 'amf', 'lwo', 'md2', '3dm', 'wrl']

/** Maximum number of meshes that cast shadows in multi-mesh mode.
 *  Only the largest K parts (by bounding-box volume) cast shadows to
 *  keep the shadow-pass draw-call count bounded for complex models. */
const MAX_SHADOW_CASTERS = 16

/** If the tree has a single root node, rename it to the file name (without extension). */
function applySinglePartName(nodes: SceneTreeNode[], fileName?: string): SceneTreeNode[] {
  if (nodes.length === 1 && fileName) {
    nodes[0] = { ...nodes[0], name: fileName.replace(/\.[^.]+$/, '') }
  }
  return nodes
}

function buildSceneTree(root: THREE.Object3D, partInfos: GlbPartInfo[]): SceneTreeNode[] {
  const meshIndexMap = new Map<string, number>()
  for (const info of partInfos) {
    meshIndexMap.set(info.partId, info.meshIndex)
  }

  function walk(obj: THREE.Object3D): SceneTreeNode[] {
    return obj.children.map((child) => {
      const partId = child.userData?.partId || child.name || child.uuid
      const isMesh = child instanceof THREE.Mesh
      const name = child.name || (isMesh ? 'Mesh' : 'Group')
      const children = walk(child)
      return {
        id: String(partId),
        name,
        visible: child.visible,
        expanded: true,
        meshIndex: meshIndexMap.get(String(partId)),
        ...(children.length > 0 ? { children } : {}),
      }
    })
  }

  return walk(root)
}

// ----

const ModelGroup = forwardRef<THREE.Group, ModelGroupProps>(function ModelGroup(
  { buffer, format, fileId, filePath, sceneTree, glbPartInfos, fileName,
    onSceneTreeChange, onPartInfosChange, onCenteringOffsetChange,
    onLoadingPhaseChange, onSourceUnitChange, onFileGroupChange,
    onParsed, onLoaded, onAnimationsReady, onError, selectorRuntime, displayMode = 'solid',
    checkerEnabled = false, checkerSlot = null },
  ref,
) {
  const innerGroupRef = useRef<THREE.Group>(null)
  const combinedRef = useCallback((g: THREE.Group | null) => {
    innerGroupRef.current = g
    if (typeof ref === 'function') {
      ref(g)
    } else if (ref) {
      ref.current = g
    }
  }, [ref])
  const [glbMeshes, setGlbMeshes] = useState<THREE.Mesh[]>([])
  const [meshMaterials, setMeshMaterials] = useState<(THREE.Material | THREE.Material[] | null)[]>([])
  const [mergedGeometry, setMergedGeometry] = useState<THREE.BufferGeometry | null>(null)
  const [objects, setObjects] = useState<THREE.Object3D[]>([])
  const [error, setError] = useState<string | null>(null)
  const viewMode = useEngineStore((s) => s.viewMode)

  const visibilityMap = useMemo(
    () => flattenVisibility(sceneTree),
    [sceneTree],
  )

  // Pre-compute morph target influence arrays for R3F meshes.
  // R3F creates fresh THREE.Mesh from JSX and assigns geometry as a plain
  // property — updateMorphTargets() is NOT called, so we must pass
  // morphTargetInfluences explicitly to prevent WebGLMorphtargets crashes.
  const morphInfluenceArrays = useMemo(() => {
    return glbMeshes.map((m) => {
      const ma = m.geometry.morphAttributes
      if (!ma) return undefined
      const keys = Object.keys(ma)
      if (keys.length === 0) return undefined
      const count = ma[keys[0]]?.length ?? 0
      if (count === 0) return undefined
      return new Array(count).fill(0)
    })
  }, [glbMeshes])

  // Only the largest K meshes (by bounding-box volume) cast shadows.
  // Small / internal parts contribute negligibly to the shadow but each
  // triggers an extra draw call in the shadow pass.
  const shadowCasterIndices = useMemo(() => {
    if (glbMeshes.length === 0) return new Set<number>()
    if (glbMeshes.length <= MAX_SHADOW_CASTERS) {
      return new Set(glbMeshes.map((_, i) => i))
    }
    const volumes = glbMeshes.map((mesh, i) => {
      const box = mesh.geometry.boundingBox
      if (!box) return { i, volume: 0 }
      const sx = box.max.x - box.min.x
      const sy = box.max.y - box.min.y
      const sz = box.max.z - box.min.z
      return { i, volume: sx * sy * sz }
    })
    volumes.sort((a, b) => b.volume - a.volume)
    return new Set(volumes.slice(0, MAX_SHADOW_CASTERS).map(v => v.i))
  }, [glbMeshes])

  const onLoadedRef = useRef(onLoaded)
  onLoadedRef.current = onLoaded
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError
  const onParsedRef = useRef(onParsed)
  onParsedRef.current = onParsed
  const onAnimationsReadyRef = useRef(onAnimationsReady)
  onAnimationsReadyRef.current = onAnimationsReady
  const onSceneTreeChangeRef = useRef(onSceneTreeChange)
  onSceneTreeChangeRef.current = onSceneTreeChange
  const onPartInfosChangeRef = useRef(onPartInfosChange)
  onPartInfosChangeRef.current = onPartInfosChange
  const onCenteringOffsetChangeRef = useRef(onCenteringOffsetChange)
  onCenteringOffsetChangeRef.current = onCenteringOffsetChange
  const onLoadingPhaseChangeRef = useRef(onLoadingPhaseChange)
  onLoadingPhaseChangeRef.current = onLoadingPhaseChange
  const onSourceUnitChangeRef = useRef(onSourceUnitChange)
  onSourceUnitChangeRef.current = onSourceUnitChange
  const onFileGroupChangeRef = useRef(onFileGroupChange)
  onFileGroupChangeRef.current = onFileGroupChange
  const materialsRef = useRef<(THREE.Material | THREE.Material[] | null)[]>([])

  useEffect(() => {
    if (!buffer || !format) {
      setGlbMeshes([])
      setMeshMaterials([])
      setMergedGeometry(null)
      setObjects([])
      setError(null)
      onPartInfosChangeRef.current([])
      onCenteringOffsetChangeRef.current(null)
      onSceneTreeChangeRef.current([])
      return
    }

    if (fileId && !markLoaded(fileId, buffer)) return

    let cancelled = false

    async function load() {
      try {
        // STEP is special — should have been converted to GLB already
        if (isStepFile(format)) {
          console.warn('[ModelGroup] STEP received without prior conversion -- should be GLB by now')
          return
        }

        // glTF requires a file path to resolve external buffer/image references
        if (format === 'gltf' && !filePath) {
          return
        }

        // Check loaderResultCache first
        let result: Awaited<ReturnType<typeof loadFormat>>
        const cached = fileId ? getCachedResult(fileId) : undefined
        if (cached) {
          result = cached
        } else {
          if (fileId) setActiveFileIdForTexCache(fileId)
          result = await loadFormat(buffer, format, filePath ?? null)
          if (fileId) { setActiveFileIdForTexCache(null); setCachedResult(fileId, result) }
          // Fire onParsed so caller generates thumbnail from this fresh parse
          const upAxis = getDefaultUpAxis(format, buffer)
          onParsedRef.current?.(result.meshes, result.objects, upAxis)
        }
        // Fire animations callback regardless of cache hit
        if (result.sceneRoot && result.animations?.length) {
          onAnimationsReadyRef.current?.(result.sceneRoot, result.animations)
        }
        // Push GLB extension metadata to store
        if (result.gltfExtensions && fileId) {
          useGlbExtensionStore.getState().setData(fileId, result.gltfExtensions)
        }
        if (cancelled) return

        // Detect source unit: file metadata → format default
        let sourceUnit = result.sourceUnit
        if (!sourceUnit) {
          if (format === '3mf') sourceUnit = parse3mfUnit(buffer)
          else if (format === 'amf') sourceUnit = parseAmfUnit(buffer)
          else sourceUnit = FORMAT_MAP[format].defaultUnit
        }
        // GLB vertices are always in meters (glTF spec). STEP_T only marks the
        // model's origin — it does not change the coordinate unit.
        // sourceUnit stays as 'meter' for all GLB/glTF.
        onSourceUnitChangeRef.current?.(sourceUnit)
        onFileGroupChangeRef.current?.(FORMAT_MAP[format].group)

        // If format produced non-mesh objects (GCode lines, BVH skeleton, PCD points, etc.)
        if (result.objects.length > 0 && result.meshes.length === 0) {
          setObjects(result.objects)
          setGlbMeshes([])
          setMeshMaterials([])
          setMergedGeometry(null)
          onPartInfosChangeRef.current([])
          const tree = applySinglePartName(
            [{ id: fileId ? `${fileId}:${format}-objects` : `${format}-objects`, name: format.toUpperCase(), visible: true, expanded: true }],
            fileName,
          )
          onSceneTreeChangeRef.current(tree)

          // Compute bounding box from all objects (Points, Lines, Bones, etc.)
          const box = new THREE.Box3()
          for (const obj of result.objects) {
            obj.updateWorldMatrix(true, false)
            if (obj.geometry) {
              if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox()
              if (obj.geometry.boundingBox) {
                box.expandByObject(obj)
              }
            }
          }
          if (!box.isEmpty()) onLoadedRef.current?.(box)
          onLoadingPhaseChangeRef.current('done')
          return
        }

        const meshes = result.meshes
        if (meshes.length === 0) {
          const msg = 'No meshes found in file'
          setError(msg)
          onErrorRef.current?.(msg)
          onLoadingPhaseChangeRef.current('error')
          return
        }

        // Determine whether to render as multi-mesh or single merged geometry
        const useMultiMesh = MULTI_MESH_FORMATS.includes(format)

        if (useMultiMesh) {
          // Multi-mesh path (GLB-like): keep individual meshes for face picking
          const overallBox = new THREE.Box3()
          const processed: THREE.Mesh[] = []
          const materials: (THREE.Material | THREE.Material[] | null)[] = []
          const partInfos: GlbPartInfo[] = []
          const bambuMeta = result.bambuMetadata
          const currentViewMode = viewMode
          const _matCache = new Map<THREE.Material, THREE.Material | THREE.Material[] | null>()

          resetYieldTimer()
          for (let i = 0; i < meshes.length; i++) {
            const src = meshes[i]
            const geo = cloneMeshGeometry(src)
            src.updateWorldMatrix(true, false)
            geo.applyMatrix4(src.matrixWorld)


            // View mode delta: reposition mesh for assembly/import view
            if (currentViewMode !== 'print' && bambuMeta) {
              const partInfo = {
                partId: bambuMeta.parts[i]?.partId ?? (src.userData?.partId || src.name || `part-${i}`),
                meshIndex: i,
                name: '',
                triangleCount: 0,
                materialIndex: -1,
                objectId: bambuMeta.parts[i]?.objectId,
              } as GlbPartInfo
              const delta = computeViewDelta(currentViewMode, bambuMeta, partInfo)
              if (delta) {
                geo.applyMatrix4(delta)
              }
            }

            // Preserve skinning data: set skinning=true on material when
            // geometry has skinIndex / skinWeight attributes, so
            // MeshStandardMaterial compiles the correct shader variant.
            const hasSkinning = geo.getAttribute('skinIndex') !== undefined

            if (!geo.getAttribute('normal')) {
              geo.computeVertexNormals()
            }
            geo.computeBoundingBox()

            if (i > 0 && i % 30 === 0) {
              await yieldToUI(true)
            }

            if (geo.boundingBox) {
              overallBox.expandByObject(new THREE.Mesh(geo))
            }

            // Clone and convert material from source mesh.
            // If the source has only the Three.js default (no file-defined
            // material), treat it as null so the renderer applies its own
            // default material (light blue) instead of the white fallback.
            const mat: THREE.Material | THREE.Material[] | null = isThreeJsDefaultMaterial(src.material)
              ? null
              : bambuMeta
                ? cloneAndConvertMaterial(src.material)
                : (() => {
                    const cached = _matCache.get(src.material)
                    if (cached) return cached
                    const cloned = cloneAndConvertMaterial(src.material)
                    _matCache.set(src.material, cloned)
                    return cloned
                  })()

            // Bambu 3MF: apply filament color from metadata
            const partMeta = bambuMeta?.parts[i]
            if (partMeta && bambuMeta) {
              const fi = partMeta.extruder - 1
              const colorHex = bambuMeta.filamentColors[fi]
              if (colorHex && mat && 'color' in mat) {
                ;(mat as THREE.MeshStandardMaterial).color = new THREE.Color(colorHex)
              }
            }

            if (hasSkinning && mat) {
              setSkinningFlag(mat, true)
            }

            const rawPartId = src.userData?.partId || src.name || `part-${i}`
            // Scope partId with fileId so that meshes from different files
            // never collide in the selection / highlight / drag / bounding-box
            // system (all of which match by partId across all model groups).
            const partId = fileId ? `${fileId}:${String(rawPartId)}` : String(rawPartId)
            const overrideKey = fileId ? partId : ''
            const { materialOverrides, overrideMaterial } = useMaterialStore.getState()
            const overrideAppearance = overrideMaterial && overrideKey
              ? materialOverrides[overrideKey]
              : undefined
            const finalMat = overrideAppearance
              ? getSharedMaterialFactory().createMaterial(overrideAppearance)
              : mat
            materials.push(finalMat)

            const mesh = new THREE.Mesh(geo)
            initMorphTargets(mesh)
            mesh.userData._originalMaterial = mat
            mesh.userData._overrideKey = overrideKey || undefined
            processed.push(mesh)

            const partName = partMeta?.name || src.name || `part-${i}`
            partInfos.push({
              partId: String(partId),
              meshIndex: i,
              name: partName,
              triangleCount: geo.index
                ? geo.index.count / 3
                : geo.attributes.position?.count / 3 || 0,
              materialIndex: src.userData?.gltfMaterialIndex ?? -1,
              extruder: partMeta?.extruder,
              plateId: partMeta?.plateId,
              objectId: partMeta?.objectId,
            })
          }

          // Per-plate centering only in print view (multi-plate Bambu 3MF).
          // Assembly/import views always use single-group centering so the
          // delta-repositioned model stays as one assembled group.
          if (currentViewMode === 'print' && bambuMeta && bambuMeta.plates.size > 1) {
            // Group processed meshes by plateId
            const plateGroups = new Map<number, THREE.Mesh[]>()
            for (let i = 0; i < processed.length; i++) {
              const pid = partInfos[i]?.plateId ?? 1
              if (!plateGroups.has(pid)) plateGroups.set(pid, [])
              plateGroups.get(pid)!.push(processed[i])
            }

            // Center each plate's meshes independently
            for (const [, meshes] of plateGroups) {
              const plateBox = new THREE.Box3()
              for (const mesh of meshes) {
                plateBox.expandByObject(mesh)
              }
              const plateCenter = plateBox.getCenter(new THREE.Vector3())
              for (const mesh of meshes) {
                mesh.position.set(-plateCenter.x, -plateCenter.y, 0)
              }
            }

            // Unified Z-lift (all objects bottom at Z=0)
            const tmpGroup = new THREE.Group()
            for (const mesh of processed) tmpGroup.add(mesh)
            const afterBox = new THREE.Box3().setFromObject(tmpGroup)
            const zLift = -afterBox.min.z
            for (const mesh of processed) {
              mesh.position.z += zLift
            }

            // Compute plate layout and apply per-plate world offsets
            const plateDims = new Map<number, { width: number; depth: number }>()
            for (const [pid, plateInfo] of bambuMeta.plates) {
              plateDims.set(pid, {
                width: plateInfo.size?.width ?? 200,
                depth: plateInfo.size?.depth ?? 200,
              })
            }
            const layout = computePlateLayout(plateDims)
            const layoutByPlateId = new Map<number, PlateLayoutEntry>()
            for (const entry of layout) {
              layoutByPlateId.set(entry.plateId, entry)
            }
            for (let i = 0; i < processed.length; i++) {
              const pid = partInfos[i]?.plateId ?? 1
              const offset = layoutByPlateId.get(pid)
              if (offset) {
                processed[i].position.x += offset.centerX
                processed[i].position.y += offset.centerY
              }
            }

            // Centering offset (fallback for topology overlay) — use (0,0,zLift)
            onCenteringOffsetChangeRef.current([0, 0, -zLift])
          } else {
            // Center XY (single-group, non-Bambu path)
            const center = overallBox.getCenter(new THREE.Vector3())
            for (const mesh of processed) {
              mesh.position.set(-center.x, -center.y, 0)
            }

            // Place bottom on Z=0 (heatbed surface, doc §3)
            const tmpGroup = new THREE.Group()
            for (const mesh of processed) tmpGroup.add(mesh)
            const afterBox = new THREE.Box3().setFromObject(tmpGroup)
            const zLift = -afterBox.min.z
            for (const mesh of processed) {
              mesh.position.z += zLift
            }

            onCenteringOffsetChangeRef.current([center.x, center.y, center.z - zLift])
          }

          setMergedGeometry(null)
          setObjects([])
          setGlbMeshes(processed)
          setMeshMaterials(materials)
          materialsRef.current = materials
          onPartInfosChangeRef.current(partInfos)

          // Store original material appearances for the material editor
          if (fileId) {
            const originals: Record<string, MaterialAppearance> = {}
            const textureThumbs: Record<string, Record<string, string>> = {}
            const thumbCache = new WeakMap<object, string>()
            for (const info of partInfos) {
              const origMesh = processed[info.meshIndex]
              const origMat = origMesh.userData._originalMaterial as
                | THREE.Material
                | THREE.Material[]
                | null
              const { appearance: app, textures } = materialToAppearance(origMat, info.name, thumbCache)
              if (app) {
                originals[info.partId] = app
                // Collect per-slot thumbnails
                const slotThumbs: Record<string, string> = {}
                for (const [slot, info] of Object.entries(textures)) {
                  if (info.thumbnail) slotThumbs[slot] = info.thumbnail
                }
                if (Object.keys(slotThumbs).length > 0) {
                  textureThumbs[info.partId] = slotThumbs
                }
              }
            }
            useMaterialStore.getState().setMaterialOriginalsForFile(fileId, originals)
            useMaterialStore.getState().setTextureThumbnailsForFile(fileId, textureThumbs)

            // Pre-load all extracted textures into the shared cache so future
            // MaterialFactory.createMaterial() calls (e.g. when user changes
            // alphaMode) can synchronously apply textures via _applyCachedTextures.
            // Without this, switching alphaMode strips all textures — the object
            // renders with just its base colour (white for default baseColorFactor).
            const textureCache = getSharedTextureCache()
            const textureUrls = new Set<string>()
            for (const app of Object.values(originals)) {
              for (const key of ['map', 'metalnessMap', 'roughnessMap', 'normalMap', 'aoMap',
                  'emissiveMap', 'transmissionMap', 'thicknessMap', 'clearcoatMap',
                  'clearcoatNormalMap', 'alphaMap'] as const) {
                const url = (app as Record<string, unknown>)[key]
                if (typeof url === 'string' && url.length > 0 && !textureUrls.has(url)) {
                  textureUrls.add(url)
                  const cs = getMapColorSpace(key)
                  textureCache.load(url, cs === 'sRGB' ? 'sRGB' : 'linear').catch((err) => {
                    console.warn('[ModelGroup] texture pre-cache failed for', key, err)
                  })
                }
              }
            }
          }

          // Ensure scene-tree node IDs match mesh partIds by setting
          // userData.partId on the original THREE.Mesh objects before
          // buildSceneTree walks the hierarchy. Without this, unnamed
          // meshes get tree IDs from child.uuid while mesh partIds use
          // "part-N", causing visibility toggle to fail.
          if (result.sceneRoot) {
            const partIdBySrc = new Map<THREE.Object3D, string>()
            for (let i = 0; i < meshes.length; i++) {
              partIdBySrc.set(meshes[i], String(partInfos[i].partId))
            }
            result.sceneRoot.traverse((obj) => {
              const pid = partIdBySrc.get(obj)
              if (pid !== undefined) {
                obj.userData.partId = pid
              }
            })
          }

          let tree: SceneTreeNode[]
          if (result.sceneRoot) {
            tree = buildSceneTree(result.sceneRoot, partInfos)
          } else if (bambuMeta && bambuMeta.plates.size > 1) {
            // Group by plate
            const plates = new Map<number, SceneTreeNode[]>()
            for (const info of partInfos) {
              const pid = info.plateId ?? 1
              if (!plates.has(pid)) plates.set(pid, [])
              plates.get(pid)!.push({
                id: info.partId,
                name: info.name,
                visible: true,
                expanded: true,
                meshIndex: info.meshIndex,
              })
            }
            tree = Array.from(plates.entries()).map(([plateId, children]) => ({
              id: `plate-${plateId}`,
              name: `Plate ${plateId}`,
              visible: true,
              expanded: true,
              children,
            }))
          } else {
            tree = partInfos.map((info) => ({
              id: info.partId,
              name: info.name,
              visible: true,
              expanded: true,
              meshIndex: info.meshIndex,
            }))
          }

          applySinglePartName(tree, fileName)
          onSceneTreeChangeRef.current(tree)

          const finalBox = new THREE.Box3()
          for (const mesh of processed) {
            const box = mesh.geometry.boundingBox
            if (box) {
              finalBox.expandByPoint(box.min.clone().add(mesh.position))
              finalBox.expandByPoint(box.max.clone().add(mesh.position))
            }
          }
          onLoadedRef.current?.(finalBox)
          onLoadingPhaseChangeRef.current('done')
        } else {
          // Single merged geometry path (STL-like)
          const geo = mergeGeometries(meshes)
          geo.computeVertexNormals()
          // STL heuristic: guess unit from bbox BEFORE centering, then normalize to mm.
          // Without scaling, an inch STL appears 25.4× smaller than mm STLs,
          // making it effectively invisible in multi-file scenes (see commit 0551317).
          if (format === 'stl') {
            geo.computeBoundingBox()
            if (geo.boundingBox) {
              const guessed = guessStlUnit(geo.boundingBox)
              if (guessed !== 'millimeter') {
                const s = UNIT_TO_MM[guessed]
                geo.scale(s, s, s)
              }
            }
          }
          geo.center()
          // Place bottom on Z=0 (heatbed surface, doc §3)
          geo.computeBoundingBox()
          if (geo.boundingBox && geo.boundingBox.min.z < 0) {
            geo.translate(0, 0, -geo.boundingBox.min.z)
            geo.computeBoundingBox()
          }
          setMergedGeometry(geo)
          setGlbMeshes([])
          setObjects([])
          onPartInfosChangeRef.current([])
          // Scope with fileId to prevent cross-file selection collision (21fe7da pattern)
          const stlPartId = fileId ? `${fileId}:${format}-model` : `${format}-model`
          const tree = applySinglePartName(
            [{ id: stlPartId, name: format.toUpperCase(), visible: true, expanded: true }],
            fileName,
          )
          onSceneTreeChangeRef.current(tree)
          geo.computeBoundingBox()
          if (geo.boundingBox) onLoadedRef.current?.(geo.boundingBox.clone())
          onLoadingPhaseChangeRef.current('done')
        }
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : String(e)
          console.error('[ModelGroup] load error:', msg)
          setError(msg)
          onErrorRef.current?.(msg)
          onLoadingPhaseChangeRef.current('error')
        }
      }
    }

    load()
    return () => {
      cancelled = true
      if (fileId) clearLoaded(fileId)
      for (const mat of materialsRef.current) {
        disposeMaterial(mat)
      }
      materialsRef.current = []
    }
  }, [buffer, format, filePath, fileId, fileName, viewMode])

  // Sync group ref to engine store after render so ModelInfoPanel can read it
  useEffect(() => {
    useEngineStore.getState().setModelGroup(innerGroupRef.current)
    return () => {
      useEngineStore.getState().setModelGroup(null)
    }
  }, [glbMeshes, mergedGeometry, objects])

  // Read material overrides from store for reactive updates
  const materialOverrides = useMaterialStore((s) => s.materialOverrides)
  const overrideMaterial = useMaterialStore((s) => s.overrideMaterial)
  const viewingOriginal = useMaterialStore((s) => s.viewingOriginal)
  const defaultMaterialAppearance = useMaterialStore((s) => s.defaultMaterial)

  // Derive a Three.js material from the user's default material preference.
  // Falls back to createDefaultMaterial() (shared constant) when no user default is set.
  const defaultMaterial = useMemo(() => {
    if (defaultMaterialAppearance) {
      return getSharedMaterialFactory().createMaterial(defaultMaterialAppearance)
    }
    return createDefaultMaterial()
  }, [defaultMaterialAppearance])

  // Wireframe variant of defaultMaterial for the merged-geometry mesh-only mode
  const defaultMaterialWireframe = useMemo(() => {
    const mat = defaultMaterial.clone()
    mat.wireframe = true
    mat.needsUpdate = true
    return mat
  }, [defaultMaterial])

  // Derive checker-applied materials (view-layer, does not touch store)
  const checkerMaterials = useMemo(() => {
    if (!checkerEnabled || !checkerSlot || meshMaterials.length === 0) return null
    const checkerTex = createCheckerTexture()
    return meshMaterials.map((mat) => {
      if (!mat) return mat
      const cloned = (Array.isArray(mat) ? mat[0] : mat).clone() as THREE.MeshPhysicalMaterial
      ;(cloned as Record<string, unknown>)[checkerSlot] = checkerTex
      cloned.needsUpdate = true
      return cloned
    })
  }, [checkerEnabled, checkerSlot, meshMaterials])

  // Apply material overrides whenever the store changes
  useEffect(() => {
    if (!fileId || glbMeshes.length === 0) return

    setMeshMaterials((prev) => {
      const next = [...prev]
      let changed = false

      for (const partInfo of glbPartInfos) {
        // partInfo.partId is already scoped with fileId prefix (e.g. "uuid:o1")
        const key = String(partInfo.partId)
        const override = materialOverrides[key]

        if (overrideMaterial && override && !viewingOriginal) {
          const newMat = getSharedMaterialFactory().createMaterial(override)
          if (next[partInfo.meshIndex] !== newMat) {
            next[partInfo.meshIndex] = newMat
            changed = true
          }
        } else {
          // Restore original material if currently overridden
          const origMesh = glbMeshes[partInfo.meshIndex]
          const orig = origMesh?.userData?._originalMaterial as THREE.Material | THREE.Material[] | null | undefined
          const origMat = Array.isArray(orig) ? orig[0] : orig
          if (origMat && next[partInfo.meshIndex] !== origMat) {
            next[partInfo.meshIndex] = origMat
            changed = true
          }
        }
      }

      return changed ? next : prev
    })
  }, [materialOverrides, overrideMaterial, viewingOriginal, fileId, glbPartInfos, glbMeshes])

  if (error) {
    return null
  }

  // Render non-mesh objects (GCode lines, BVH skeleton helper, etc.)
  if (objects.length > 0) {
    // The scene tree for non-mesh formats has a single flat node whose id
    // is `${format}-objects`.  Resolve visibility from the map so that the
    // eye icon in the scene tree actually hides/shows the primitives.
    const nodeId = sceneTree[0]?.id ?? (format ? `${format}-objects` : 'objects')
    const vis = visibilityMap.get(nodeId) ?? true
    return (
      <group ref={ref as unknown as React.Ref<THREE.Group>}>
        {objects.map((obj, i) => (
          <primitive key={i} object={obj} visible={vis} />
        ))}
      </group>
    )
  }

  // GLB-type: render individual meshes
  if (glbMeshes.length > 0) {
    // Build faceIds for each mesh if runtime is available
    const meshFaceIds: (Uint32Array | null)[] = []
    if (selectorRuntime) {
      const occurrenceRows = selectorRuntime.occurrenceIdByRowIndex
      const singleOccurrenceId = selectorRuntime.singleOccurrenceId
      for (let i = 0; i < glbMeshes.length; i++) {
        const info = glbPartInfos[i]
        const occurrenceId = singleOccurrenceId ||
          (Array.from(occurrenceRows.values())[i] ?? '')
        const faceIds = buildGlbFaceIdsForPart(
          {
            occurrenceId,
            primitiveIndex: info?.meshIndex ?? i,
            triangleCount: info?.triangleCount ?? 0,
          },
          selectorRuntime,
        )
        meshFaceIds.push(faceIds)
      }
    }

    const isMeshOnly = displayMode === 'mesh' || displayMode === 'debug'

    if (displayMode === 'wireframe') {
      return (
        <group ref={ref as unknown as React.Ref<THREE.Group>}>
          {glbMeshes.map((mesh, i) => {
            const partId = glbPartInfos[i]?.partId || (fileId ? `${fileId}:part-${i}` : `part-${i}`)
            const vis = visibilityMap.get(partId) ?? true
            return (
              <mesh
                key={i}
                visible={vis}
                geometry={mesh.geometry}
                position={mesh.position}
                material={meshMaterials[i] ?? undefined}
                morphTargetInfluences={morphInfluenceArrays[i]}
                castShadow={shadowCasterIndices.has(i)}
                userData={{
                  partId,
                  meshIndex: i,
                  faceIds: meshFaceIds[i] || undefined,
                  _originalMaterial: mesh.userData._originalMaterial,
                  _overrideKey: mesh.userData._overrideKey,
                }}
              >
                <meshBasicMaterial
                  color="#cccccc"
                  transparent
                  opacity={0}
                  depthWrite={true}
                  colorWrite={false}
                />
              </mesh>
            )
          })}
        </group>
      )
    }

    return (
      <group ref={combinedRef}>
        {glbMeshes.map((mesh, i) => {
          const partId = glbPartInfos[i]?.partId || (fileId ? `${fileId}:part-${i}` : `part-${i}`)
          const vis = visibilityMap.get(partId) ?? true
          const effectiveMats = checkerMaterials ?? meshMaterials
          const mat = effectiveMats[i]
          const matColor = isMeshOnly
            ? (getMaterialColor(mat) ?? '#cccccc')
            : undefined
          return (
            <mesh
              key={i}
              visible={vis}
              geometry={mesh.geometry}
              position={mesh.position}
              material={mat ?? defaultMaterial ?? undefined}
              morphTargetInfluences={morphInfluenceArrays[i]}
              castShadow={shadowCasterIndices.has(i)}
              userData={{
                partId,
                meshIndex: i,
                faceIds: meshFaceIds[i] || undefined,
                _originalMaterial: mesh.userData._originalMaterial,
                _overrideKey: mesh.userData._overrideKey,
              }}
            >
              {isMeshOnly && (
                <meshPhysicalMaterial
                  color={matColor}
                  roughness={0.4}
                  metalness={0.1}
                  wireframe={true}
                  polygonOffset
                  polygonOffsetFactor={-1}
                  polygonOffsetUnits={-1}
                />
              )}
            </mesh>
          )
        })}
      </group>
    )
  }

  // Non-GLB or placeholder: single merged mesh
  if (!mergedGeometry) return null

  const isMeshOnly = displayMode === 'mesh' || displayMode === 'debug'

  // partId must match the scene-tree node id so that
  // object-mode clicks and tree-node clicks select the same entity.
  // Scoped with fileId to prevent cross-file selection collision (21fe7da pattern).
  const mergedPartId = fileId ? `${fileId}:${format}-model` : `${format}-model`
  const mergedVis = visibilityMap.get(mergedPartId) ?? true

  if (displayMode === 'wireframe') {
    return (
      <group ref={combinedRef}>
        <mesh
          visible={mergedVis}
          geometry={mergedGeometry}
          castShadow
          userData={{ partId: mergedPartId }}
        >
          <meshBasicMaterial
            color={'#cccccc'}
            transparent
            opacity={0}
            depthWrite={true}
            colorWrite={false}
          />
        </mesh>
      </group>
    )
  }

  return (
    <group ref={combinedRef}>
      <mesh
        visible={mergedVis}
        geometry={mergedGeometry}
        castShadow
        userData={{ partId: mergedPartId }}
        material={isMeshOnly ? defaultMaterialWireframe : defaultMaterial}
      />
    </group>
  )
})

export default ModelGroup
