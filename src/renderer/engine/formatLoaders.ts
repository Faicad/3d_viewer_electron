import * as THREE from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js'
import { TDSLoader } from 'three/examples/jsm/loaders/TDSLoader.js'
import { USDZLoader } from 'three/examples/jsm/loaders/USDZLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import { GLTFAnimationPointerExtension } from '@needle-tools/three-animation-pointer'
import { BVHLoader } from 'three/examples/jsm/loaders/BVHLoader.js'
import { VTKLoader } from 'three/examples/jsm/loaders/VTKLoader.js'
import { XYZLoader } from 'three/examples/jsm/loaders/XYZLoader.js'
import { PDBLoader } from 'three/examples/jsm/loaders/PDBLoader.js'
import { NRRDLoader } from 'three/examples/jsm/loaders/NRRDLoader.js'
import { GCodeLoader } from 'three/examples/jsm/loaders/GCodeLoader.js'
import { VRMLLoader } from 'three/examples/jsm/loaders/VRMLLoader.js'
import { VOXLoader } from 'three/examples/jsm/loaders/VOXLoader.js'
import { KMZLoader } from 'three/examples/jsm/loaders/KMZLoader.js'
import { AMFLoader } from 'three/examples/jsm/loaders/AMFLoader.js'
import { LWOLoader } from 'three/examples/jsm/loaders/LWOLoader.js'
import { MD2Loader } from 'three/examples/jsm/loaders/MD2Loader.js'
import { PCDLoader } from 'three/examples/jsm/loaders/PCDLoader.js'
import { Rhino3dmLoader } from 'three/examples/jsm/loaders/3DMLoader.js'
import type { FormatId, UnitSystem } from '@/config/file-formats'
import { buildGlbExtensionData, type GlbExtensionData } from './gltfExtensions'

export interface LoaderResult {
  meshes: THREE.Mesh[]
  /** Non-mesh objects (lines, points, etc.) — rendered separately */
  objects: THREE.Object3D[]
  /** For skeleton-based formats (BVH) */
  skeleton?: THREE.Skeleton
  /** Preserved scene hierarchy for building multi-level scene tree */
  sceneRoot?: THREE.Object3D
  /** Unit system detected or defaulted for this file format. If undefined, caller should use format's defaultUnit. */
  sourceUnit?: UnitSystem
  /** Materials extracted from the scene (may differ from meshes[].material after processing) */
  materials?: (THREE.Material | THREE.Material[])[]
  /** Animation clips extracted from GLTF (only for single-file GLB/glTF) */
  animations?: THREE.AnimationClip[]
  /** GLB/glTF extension, material, texture, and animation metadata */
  gltfExtensions?: GlbExtensionData
}

function bufferToText(buffer: ArrayBuffer): string {
  const decoder = new TextDecoder()
  return decoder.decode(buffer)
}

/**
 * Decode a base64 string into a Uint8Array.
 */
function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/**
 * Build a GLB binary container from JSON text and binary chunk data.
 *
 * GLB format:
 *   [12-byte header: magic "glTF" + version 2 + total length]
 *   [JSON chunk: length + type "JSON" + data (4-byte aligned)]
 *   [BIN  chunk: length + type "BIN\0" + data (4-byte aligned)]
 */
function buildGlbBinary(json: string, bin: Uint8Array): ArrayBuffer {
  const encoder = new TextEncoder()
  const jsonBytes = encoder.encode(json)

  const jsonPad = (4 - (jsonBytes.length % 4)) % 4
  const binPad = (4 - (bin.length % 4)) % 4

  const jsonChunkLen = jsonBytes.length + jsonPad
  const binChunkLen = bin.length + binPad

  const totalLen = 12 + 8 + jsonChunkLen + (bin.length > 0 ? 8 + binChunkLen : 0)

  const buffer = new ArrayBuffer(totalLen)
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)
  let pos = 0

  // Header
  view.setUint32(pos, 0x46546C67, true); pos += 4 // magic "glTF"
  view.setUint32(pos, 2, true); pos += 4           // version
  view.setUint32(pos, totalLen, true); pos += 4     // total length

  // JSON chunk
  view.setUint32(pos, jsonChunkLen, true); pos += 4
  view.setUint32(pos, 0x4E4F534A, true); pos += 4  // "JSON"
  bytes.set(jsonBytes, pos)
  // JSON padding MUST be spaces (0x20) per glTF spec — JSON.parse rejects \0
  for (let i = jsonBytes.length; i < jsonChunkLen; i++) bytes[pos + i] = 0x20
  pos += jsonChunkLen

  // BIN chunk (only if non-empty)
  if (bin.length > 0) {
    view.setUint32(pos, binChunkLen, true); pos += 4
    view.setUint32(pos, 0x004E4942, true); pos += 4 // "BIN\0"
    bytes.set(bin, pos)
    // BIN padding can be zeros
  }

  return buffer
}

/**
 * Convert a glTF JSON file with external buffer/image references into a
 * self-contained GLB binary ArrayBuffer.
 *
 * Reads all external buffer files via Electron IPC, concatenates them into
 * the GLB binary chunk, removes URIs from buffer definitions, and embeds
 * texture images as data URIs.
 *
 * GLTFLoader handles GLB natively — no fetch/data URI issues.
 */
async function gltfToGlb(gltfText: string, filePath: string): Promise<ArrayBuffer> {
  const gltf = JSON.parse(gltfText)

  const lastSep = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
  const baseDir = lastSep > 0 ? filePath.slice(0, lastSep) : ''

  const api = window.electronAPI
  if (!api) {
    throw new Error(
      'glTF files with external references require the desktop app. Cannot resolve referenced files.',
    )
  }

  // Read all external buffers, concatenate them into the GLB binary chunk
  const bufferDatas: Uint8Array[] = []
  let totalBufferLength = 0

  if (gltf.buffers) {
    for (const buffer of gltf.buffers) {
      if (buffer.uri && !buffer.uri.startsWith('data:')) {
        const resolvedPath = baseDir + '/' + buffer.uri
        const result = await api.readFileAsBase64(resolvedPath)
        if (!result.success) {
          throw new Error(
            `Cannot find referenced file: "${buffer.uri}"\nExpected location: ${resolvedPath}`,
          )
        }
        const bytes = base64ToBytes(result.data!)
        bufferDatas.push(bytes)
        totalBufferLength += bytes.byteLength
        // Remove URI so GLTFLoader reads buffer 0 from the GLB binary chunk
        delete buffer.uri
      }
    }
  }

  // Concatenate all external buffers into the GLB binary chunk
  const binChunk = new Uint8Array(totalBufferLength)
  let offset = 0
  for (const data of bufferDatas) {
    binChunk.set(data, offset)
    offset += data.byteLength
  }

  // Handle external images — embed as data URIs
  if (gltf.images) {
    for (const image of gltf.images) {
      if (image.uri && !image.uri.startsWith('data:')) {
        const resolvedPath = baseDir + '/' + image.uri
        const result = await api.readFileAsBase64(resolvedPath)
        if (!result.success) {
          throw new Error(
            `Cannot find referenced texture: "${image.uri}"\nExpected location: ${resolvedPath}`,
          )
        }
        const ext = image.uri.split('.').pop()?.toLowerCase()
        const mime =
          ext === 'png' ? 'image/png'
          : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
          : ext === 'webp' ? 'image/webp'
          : 'application/octet-stream'
        image.uri = `data:${mime};base64,${result.data}`
      }
    }
  }

  return buildGlbBinary(JSON.stringify(gltf), binChunk)
}

function extractMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = []
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) meshes.push(child)
  })
  return meshes
}

function extractAllObjects(root: THREE.Object3D): THREE.Object3D[] {
  const objs: THREE.Object3D[] = []
  root.traverse((child) => {
    if (child !== root) objs.push(child)
  })
  return objs
}

/** Annotate each THREE.Mesh in the scene with its glTF material index using associations. */
function annotateMaterialIndices(
  gltf: { parser: { associations?: Map<THREE.Object3D, { meshes?: number }> }; scene: THREE.Object3D },
  json: Record<string, unknown>,
) {
  const associations = gltf.parser.associations
  if (!associations) return

  const gltfMeshes: Record<string, unknown>[] = Array.isArray(json.meshes) ? (json.meshes as Record<string, unknown>[]) : []

  for (const [obj, mapping] of associations) {
    if (mapping.meshes === undefined || !(obj instanceof THREE.Mesh)) continue
    const meshIdx = mapping.meshes
    if (meshIdx >= gltfMeshes.length) continue
    const primitives: Record<string, unknown>[] = Array.isArray(gltfMeshes[meshIdx].primitives) ? (gltfMeshes[meshIdx].primitives as Record<string, unknown>[]) : []
    // Use the first primitive's material (covers single-primitive case; multi-primitive meshes
    // produce separate THREE.Mesh per primitive, each with its own associations entry)
    const matIdx = typeof primitives[0]?.material === 'number' ? primitives[0].material : -1
    obj.userData.gltfMaterialIndex = matIdx
  }
}

export function buildTextureExtras(
  gltf: { parser: { associations?: Map<THREE.Texture, { textures?: number }> } },
  _json?: Record<string, unknown>,
): {
  resolutionMap: Map<number, { width: number; height: number }>
  thumbnailMap: Map<number, string>
  previewMap: Map<number, string>
} {
  const resolutionMap = new Map<number, { width: number; height: number }>()
  const thumbnailMap = new Map<number, string>()
  const previewMap = new Map<number, string>()
  const indexToTex = new Map<number, THREE.Texture>()

  // gltf.parser.associations directly maps THREE.Texture → { textures: gltfIndex }
  const associations = gltf.parser.associations
  if (associations) {
    for (const [tex, mapping] of associations) {
      if (mapping.textures === undefined) continue
      indexToTex.set(mapping.textures, tex)
    }
  }

  // Generate thumbnails
  for (const [idx, tex] of indexToTex) {
    if (tex.image && typeof tex.image.width === 'number' && typeof tex.image.height === 'number') {
      resolutionMap.set(idx, { width: tex.image.width, height: tex.image.height })
    }
    const thumb = generateThumbnail(tex, 40)
    if (thumb) thumbnailMap.set(idx, thumb)
    const preview = generateThumbnail(tex, 512)
    if (preview) previewMap.set(idx, preview)
  }

  // Store full-res textures for later download
  if (fileIdForTexCache) {
    textureDownloadCache.set(fileIdForTexCache, indexToTex)
  }

  return { resolutionMap, thumbnailMap, previewMap }
}

// Full-resolution texture cache for download.
// Keyed by fileId, each value maps glTF texture index → THREE.Texture.
const textureDownloadCache = new Map<string, Map<number, THREE.Texture>>()
let fileIdForTexCache: string | null = null

/** Set the fileId that the next buildTextureExtras call will store textures under. */
export function setActiveFileIdForTexCache(fileId: string | null) {
  fileIdForTexCache = fileId
}

/** Get the full-resolution THREE.Texture for a given file + texture index. */
export function getTextureForDownload(fileId: string, texIndex: number): THREE.Texture | undefined {
  return textureDownloadCache.get(fileId)?.get(texIndex)
}

/** Clean up texture cache for a file. */
export function clearTextureDownloadCache(fileId: string) {
  textureDownloadCache.delete(fileId)
}

export function generateThumbnail(texture: THREE.Texture, maxSize: number): string | null {
  if (typeof document === 'undefined') return null
  const image = texture.image as { width: number; height: number } | null
  if (!image || typeof image.width !== 'number' || image.width === 0) return null
  try {
    const canvas = document.createElement('canvas')
    const scale = Math.min(maxSize / image.width, maxSize / image.height)
    canvas.width = Math.round(image.width * scale)
    canvas.height = Math.round(image.height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(image as CanvasImageSource, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL()
  } catch {
    return null
  }
}

// ---- Shared GLTFLoader with Draco + KTX2 support ----

let _sharedGltfLoader: GLTFLoader | null = null

function getGltfLoader(): GLTFLoader {
  if (_sharedGltfLoader) return _sharedGltfLoader

  const loader = new GLTFLoader()

  const dracoLoader = new DRACOLoader()
  dracoLoader.setDecoderPath('/wasm/draco/')
  loader.setDRACOLoader(dracoLoader)

  const ktx2Loader = new KTX2Loader()
  ktx2Loader.setTranscoderPath('/wasm/basis/')
  loader.setKTX2Loader(ktx2Loader)

  loader.register((parser) => new GLTFAnimationPointerExtension(parser))

  _sharedGltfLoader = loader
  return loader
}

/**
 * Central dispatcher: parse any supported format's ArrayBuffer into meshes/objects.
 * Returns { meshes, objects } ready for rendering.
 */
export async function loadFormat(
  buffer: ArrayBuffer,
  format: FormatId,
  resourcePath?: string | null,
): Promise<LoaderResult> {
  switch (format) {
    // ---- already supported ----
    case 'stl': {
      const geo = new STLLoader().parse(buffer)
      geo.computeVertexNormals()
      const mesh = new THREE.Mesh(geo)
      return { meshes: [mesh], objects: [] }
    }
    case 'glb': {
      const gltf = await getGltfLoader().parseAsync(buffer, '')
      const meshes = extractMeshes(gltf.scene)
      annotateMaterialIndices(gltf, gltf.parser.json)
      const json = gltf.parser.json
      const { resolutionMap, thumbnailMap, previewMap } = buildTextureExtras(gltf)
      const gltfExtensions = buildGlbExtensionData(json, gltf.animations, resolutionMap, thumbnailMap, previewMap)
      return { meshes, objects: [], sceneRoot: gltf.scene, sourceUnit: 'meter', animations: gltf.animations, gltfExtensions }
    }
    case 'gltf': {
      if (resourcePath) {
        // Convert glTF + external files into self-contained GLB binary
        const glbBuffer = await gltfToGlb(bufferToText(buffer), resourcePath)
        return loadFormat(glbBuffer, 'glb')
      }
      // No file path — try parsing directly (works if glTF has only data URIs or
      // if pre-resolved by test helpers)
      const gltfText = bufferToText(buffer)
      const gltf = await getGltfLoader().parseAsync(gltfText, '')
      const meshes = extractMeshes(gltf.scene)
      const json = JSON.parse(gltfText)
      const { resolutionMap, thumbnailMap, previewMap } = buildTextureExtras(gltf)
      const gltfExtensions = buildGlbExtensionData(json, gltf.animations, resolutionMap, thumbnailMap, previewMap)
      return { meshes, objects: [], sceneRoot: gltf.scene, sourceUnit: 'meter', animations: gltf.animations, gltfExtensions }
    }
    case '3mf': {
      const group = new ThreeMFLoader().parse(buffer)
      const meshes = extractMeshes(group)
      return { meshes, objects: extractAllObjects(group) }
    }

    // ---- mesh formats: text-based ----
    case 'obj': {
      const text = bufferToText(buffer)
      const group = new OBJLoader().parse(text)
      const meshes = extractMeshes(group)
      return { meshes, objects: extractAllObjects(group) }
    }
    case 'dae': {
      const text = bufferToText(buffer)
      const scene = new ColladaLoader().parse(text, '')
      const meshes = extractMeshes(scene.scene)
      return { meshes, objects: extractAllObjects(scene.scene) }
    }
    case 'wrl': {
      const text = bufferToText(buffer)
      const scene = new VRMLLoader().parse(text)
      const meshes = extractMeshes(scene)
      return { meshes, objects: extractAllObjects(scene) }
    }

    // ---- mesh formats: binary ----
    case 'ply': {
      // PLYLoader detects ascii vs binary from header
      // give it the raw ArrayBuffer for both cases
      const geo = new PLYLoader().parse(buffer)
      geo.computeVertexNormals()
      const mesh = new THREE.Mesh(geo)
      return { meshes: [mesh], objects: [] }
    }
    case 'fbx': {
      const group = new FBXLoader().parse(buffer, '')
      const meshes = extractMeshes(group)
      return { meshes, objects: extractAllObjects(group) }
    }
    case '3ds': {
      const group = new TDSLoader().parse(buffer)
      const meshes = extractMeshes(group)
      return { meshes, objects: extractAllObjects(group) }
    }
    case 'usdz': {
      const group = new USDZLoader().parse(buffer)
      const meshes = extractMeshes(group)
      return { meshes, objects: extractAllObjects(group) }
    }
    case 'vox': {
      const result = new VOXLoader().parse(buffer)
      const scene = result?.scene
      if (scene) {
        if (scene instanceof THREE.Mesh) {
          return { meshes: [scene], objects: [] }
        }
        const meshes = extractMeshes(scene)
        return { meshes, objects: extractAllObjects(scene) }
      }
      return { meshes: [], objects: [] }
    }
    case 'kmz': {
      const result = new KMZLoader().parse(buffer)
      const scene = result?.scene
      if (scene) {
        const meshes = extractMeshes(scene)
        return { meshes, objects: extractAllObjects(scene) }
      }
      return { meshes: [], objects: [] }
    }
    case 'amf': {
      // AMFLoader detects ZIP vs XML from raw buffer — pass binary, not text
      const group = new AMFLoader().parse(buffer)
      const meshes = extractMeshes(group)
      return { meshes, objects: extractAllObjects(group) }
    }
    case 'lwo': {
      // LWOLoader.parse() returns {meshes: Mesh[], materials: Material[]}, not a Group
      const result = new LWOLoader().parse(buffer, '', 'model')
      return { meshes: result?.meshes || [], objects: [] }
    }
    case 'md2': {
      // MD2Loader.parse() returns a BufferGeometry directly, not a Group
      const geo = new MD2Loader().parse(buffer)
      if (!geo) return { meshes: [], objects: [] }
      geo.computeVertexNormals()
      const mesh = new THREE.Mesh(geo)
      return { meshes: [mesh], objects: [] }
    }
    case '3dm': {
      const loader = new Rhino3dmLoader()
      loader.setLibraryPath('/wasm/rhino3dm/')
      const group = await new Promise<THREE.Group>((resolve, reject) => {
        loader.parse(buffer, resolve, reject)
      })
      const meshes = extractMeshes(group)
      return { meshes, objects: extractAllObjects(group) }
    }

    // ---- volume / pointcloud / special ----
    case 'vtk':
    case 'vtp': {
      const geo = new VTKLoader().parse(buffer)
      geo.computeVertexNormals()
      const mesh = new THREE.Mesh(geo)
      return { meshes: [mesh], objects: [] }
    }
    case 'xyz': {
      const text = bufferToText(buffer)
      const geo = new XYZLoader().parse(text)
      // XYZ is atom positions — render as point cloud
      const points = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.1, color: 0xffffff }))
      return { meshes: [], objects: [points] }
    }
    case 'pdb': {
      const text = bufferToText(buffer)
      // PDBLoader.parse() returns {geometryAtoms, geometryBonds, json}, not a BufferGeometry
      const result = new PDBLoader().parse(text)
      const objects: THREE.Object3D[] = []
      if (result.geometryAtoms) {
        const atomPoints = new THREE.Points(result.geometryAtoms,
          new THREE.PointsMaterial({ size: 0.1, vertexColors: true }))
        objects.push(atomPoints)
      }
      if (result.geometryBonds && result.geometryBonds.attributes.position.count > 0) {
        const lineSegs = new THREE.LineSegments(result.geometryBonds,
          new THREE.LineBasicMaterial({ color: 0x888888 }))
        objects.push(lineSegs)
      }
      return { meshes: [], objects, sourceUnit: 'angstrom' }
    }
    case 'nrrd': {
      // NRRD produces volume data (3D texture) — create a unit box with wireframe
      // so the user can see something; real volume rendering needs custom shaders
      const _volume = new NRRDLoader().parse(buffer)
      const geo = new THREE.BoxGeometry(1, 1, 1)
      const mesh = new THREE.Mesh(geo)
      mesh.name = 'NRRD proxy'
      return { meshes: [mesh], objects: [], sourceUnit: 'micron' }
    }
    case 'pcd': {
      const points = new PCDLoader().parse(buffer)
      // PCDLoader returns THREE.Points — render directly as point cloud
      if (points instanceof THREE.Points) {
        return { meshes: [], objects: [points] }
      }
      return { meshes: [], objects: [] }
    }

    // ---- animation ----
    case 'bvh': {
      const text = bufferToText(buffer)
      const result = new BVHLoader().parse(text)
      const skeleton = result.skeleton
      const objects: THREE.Object3D[] = []
      if (skeleton.bones.length > 0) {
        const rootBone = skeleton.bones[0]
        // Force bone matrix updates so SkeletonHelper has valid world transforms
        rootBone.updateMatrixWorld(true)
        const helper = new THREE.SkeletonHelper(rootBone)
        objects.push(helper)
      }
      return { meshes: [], objects, skeleton }
    }
    case 'mdd': {
      // MDD is morph data for an existing mesh — can't render standalone
      console.warn('[formatLoaders] MDD requires a base mesh — returning empty')
      return { meshes: [], objects: [] }
    }

    // ---- GCode ----
    case 'gcode': {
      const text = bufferToText(buffer)
      const group = new GCodeLoader().parse(text)
      const objects = extractAllObjects(group)
      // GCode produces line segments
      return { meshes: [], objects }
    }

    // ---- Draco ----
    case 'drc': {
      const loader = new DRACOLoader()
      loader.setDecoderPath('/wasm/draco/')
      const geometry = await loader.decodeDracoFile(buffer)
      const mesh = new THREE.Mesh(geometry)
      return { meshes: [mesh], objects: [] }
    }

    // ---- IFC (BIM) ----
    // IFC requires web-ifc-three (external package): npm install web-ifc-three web-ifc
    case 'ifc': {
      console.warn('[formatLoaders] IFC requires web-ifc-three package — not yet installed')
      return { meshes: [], objects: [] }
    }

    default:
      console.error(`[formatLoaders] unknown format: ${format}`)
      return { meshes: [], objects: [] }
  }
}
