import { useEffect, useRef, useState, useMemo, forwardRef } from 'react'
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
import { getDefaultUpAxis } from '@/config/file-formats'
import { getCachedResult, setCachedResult, markLoaded } from '@/engine/loaderResultCache'
import { cloneMeshGeometry, initMorphTargets } from './cloneMeshGeometry'
import { cloneAndConvertMaterial, disposeMaterial, getMaterialColor, materialToAppearance } from './cloneMaterial'
import { useMaterialStore } from '@/stores/material-store'
import { getSharedMaterialFactory, getSharedTextureCache } from '@/engine/material/MaterialFactory'
import { getMapColorSpace } from '@/engine/material/TextureCache'
import { createCheckerTexture } from '@/engine/material/checkerTexture'

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
const MULTI_MESH_FORMATS: FormatId[] = ['glb', 'gltf', '3mf', 'fbx', 'dae', '3ds', 'usdz', 'vox', 'kmz', 'amf', 'lwo', 'md2', '3dm', 'wrl']

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
    onParsed, onLoaded, onError, selectorRuntime, displayMode = 'solid',
    checkerEnabled = false, checkerSlot = null },
  ref,
) {
  const [glbMeshes, setGlbMeshes] = useState<THREE.Mesh[]>([])
  const [meshMaterials, setMeshMaterials] = useState<(THREE.Material | THREE.Material[] | null)[]>([])
  const [mergedGeometry, setMergedGeometry] = useState<THREE.BufferGeometry | null>(null)
  const [objects, setObjects] = useState<THREE.Object3D[]>([])
  const [error, setError] = useState<string | null>(null)

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

  const onLoadedRef = useRef(onLoaded)
  onLoadedRef.current = onLoaded
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError
  const onParsedRef = useRef(onParsed)
  onParsedRef.current = onParsed
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
        if (format === 'step') {
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
          result = await loadFormat(buffer, format, filePath ?? null)
          if (fileId) setCachedResult(fileId, result)
          // Fire onParsed so caller generates thumbnail from this fresh parse
          const upAxis = getDefaultUpAxis(format, buffer)
          onParsedRef.current?.(result.meshes, result.objects, upAxis)
        }
        if (cancelled) return

        // Set unit metadata
        onSourceUnitChangeRef.current?.(result.sourceUnit ?? FORMAT_MAP[format].defaultUnit)
        onFileGroupChangeRef.current?.(FORMAT_MAP[format].group)

        // If format produced non-mesh objects (GCode lines, BVH skeleton, PCD points, etc.)
        if (result.objects.length > 0 && result.meshes.length === 0) {
          setObjects(result.objects)
          setGlbMeshes([])
          setMeshMaterials([])
          setMergedGeometry(null)
          onPartInfosChangeRef.current([])
          const tree = applySinglePartName(
            [{ id: `${format}-objects`, name: format.toUpperCase(), visible: true, expanded: true }],
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

          for (let i = 0; i < meshes.length; i++) {
            const src = meshes[i]
            const geo = cloneMeshGeometry(src)
            src.updateWorldMatrix(true, false)
            geo.applyMatrix4(src.matrixWorld)

            // Preserve skinning data: set skinning=true on material when
            // geometry has skinIndex / skinWeight attributes, so
            // MeshStandardMaterial compiles the correct shader variant.
            const hasSkinning = geo.getAttribute('skinIndex') !== undefined

            geo.computeVertexNormals()
            geo.computeBoundingBox()

            if (geo.boundingBox) {
              overallBox.expandByObject(new THREE.Mesh(geo))
            }

            // Clone and convert material from source mesh
            const mat = cloneAndConvertMaterial(src.material)
            if (hasSkinning && mat) {
              setSkinningFlag(mat, true)
            }

            const partId = src.userData?.partId || src.name || `part-${i}`
            const overrideKey = fileId ? `${fileId}:${String(partId)}` : ''
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
            partInfos.push({
              partId: String(partId),
              meshIndex: i,
              name: src.name || `part-${i}`,
              triangleCount: geo.index
                ? geo.index.count / 3
                : geo.attributes.position?.count / 3 || 0,
            })
          }

          // Center the group
          const center = overallBox.getCenter(new THREE.Vector3())
          for (const mesh of processed) {
            mesh.position.copy(center).multiplyScalar(-1)
          }

          onCenteringOffsetChangeRef.current([center.x, center.y, center.z])

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

          const tree = result.sceneRoot
            ? buildSceneTree(result.sceneRoot, partInfos)
            : partInfos.map((info) => ({
                id: info.partId,
                name: info.name,
                visible: true,
                expanded: true,
                meshIndex: info.meshIndex,
              }))

          applySinglePartName(tree, fileName)
          onSceneTreeChangeRef.current(tree)

          const finalBox = new THREE.Box3()
          for (const mesh of processed) {
            const clone = mesh.geometry.clone()
            clone.translate(mesh.position.x, mesh.position.y, mesh.position.z)
            finalBox.expandByObject(new THREE.Mesh(clone))
          }
          onLoadedRef.current?.(finalBox)
          onLoadingPhaseChangeRef.current('done')
        } else {
          // Single merged geometry path (STL-like)
          const geo = mergeGeometries(meshes)
          geo.computeVertexNormals()
          geo.center()
          setMergedGeometry(geo)
          setGlbMeshes([])
          setObjects([])
          onPartInfosChangeRef.current([])
          const tree = applySinglePartName(
            [{ id: `${format}-model`, name: format.toUpperCase(), visible: true, expanded: true }],
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
      for (const mat of materialsRef.current) {
        disposeMaterial(mat)
      }
      materialsRef.current = []
    }
  }, [buffer, format, filePath, fileId, fileName])

  // Sync group ref to engine store after render so ModelInfoPanel can read it
  useEffect(() => {
    const groupRef = ref as React.RefObject<THREE.Group | null> | null
    useEngineStore.getState().setModelGroup(groupRef?.current ?? null)
    return () => {
      useEngineStore.getState().setModelGroup(null)
    }
  }, [glbMeshes, mergedGeometry, objects])

  // Read material overrides from store for reactive updates
  const materialOverrides = useMaterialStore((s) => s.materialOverrides)
  const overrideMaterial = useMaterialStore((s) => s.overrideMaterial)
  const viewingOriginal = useMaterialStore((s) => s.viewingOriginal)

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
        const key = `${fileId}:${String(partInfo.partId)}`
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
      console.log('[ModelGroup] faceIds built:', meshFaceIds.map(
        (f, i) => `mesh${i}:${f ? f.length + 'triangles,' + f.filter((v: number) => v !== 0xffffffff).length + 'mapped' : 'null'}`
      ))
    }

    const isMeshOnly = displayMode === 'mesh' || displayMode === 'debug'

    if (displayMode === 'wireframe') {
      return (
        <group ref={ref as unknown as React.Ref<THREE.Group>}>
          {glbMeshes.map((mesh, i) => {
            const partId = glbPartInfos[i]?.partId || `part-${i}`
            const vis = visibilityMap.get(partId) ?? true
            return (
              <mesh
                key={i}
                visible={vis}
                geometry={mesh.geometry}
                position={mesh.position}
                material={meshMaterials[i] ?? undefined}
                morphTargetInfluences={morphInfluenceArrays[i]}
                castShadow
                receiveShadow
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
      <group ref={ref as unknown as React.Ref<THREE.Group>}>
        {glbMeshes.map((mesh, i) => {
          const partId = glbPartInfos[i]?.partId || `part-${i}`
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
              material={mat ?? undefined}
              morphTargetInfluences={morphInfluenceArrays[i]}
              castShadow
              receiveShadow
              userData={{
                partId,
                meshIndex: i,
                faceIds: meshFaceIds[i] || undefined,
                _originalMaterial: mesh.userData._originalMaterial,
                _overrideKey: mesh.userData._overrideKey,
              }}
            >
              {mat == null && !isMeshOnly && (
                <meshPhysicalMaterial
                  color="#9BA6AE"
                  roughness={0.35}
                  metalness={0.1}
                  polygonOffset
                  polygonOffsetFactor={-1}
                  polygonOffsetUnits={-1}
                />
              )}
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

  if (displayMode === 'wireframe') {
    return (
      <group ref={ref as unknown as React.Ref<THREE.Group>}>
        <mesh geometry={mergedGeometry} castShadow receiveShadow>
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
    <group ref={ref as unknown as React.Ref<THREE.Group>}>
      <mesh geometry={mergedGeometry} castShadow receiveShadow>
        <meshPhysicalMaterial
          color={'#9BA6AE'}
          roughness={0.35}
          metalness={0.1}
          wireframe={isMeshOnly}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </mesh>
    </group>
  )
})

export default ModelGroup
