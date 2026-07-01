import * as THREE from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import type { FormatId, UnitSystem } from '@/config/file-formats'
import { buildGlbExtensionData, type GlbExtensionData } from './gltfExtensions'
import { parseBambu3mf, type Bambu3mfMetadata } from '@/lib/bambu-3mf/bambu-3mf'
import type { FileMeta } from '@/lib/file-meta'
import { useModelStore } from '@/stores/model-store'
import { yieldToUI, resetYieldTimer } from '@/lib/async-utils'
import { scadToStl } from '@/lib/scad-converter'
import { loadIfcAsMeshes } from '@/lib/ifc-loader'

/** Parse ISO 10303-21 HEADER section from a STEP file buffer. */
export function parseStepHeader(buffer: ArrayBuffer): FileMeta['step'] | undefined {
  const text = new TextDecoder().decode(buffer.slice(0, Math.min(buffer.byteLength, 4096)))

  const fnIdx = text.indexOf('FILE_NAME')
  if (fnIdx < 0) return undefined

  const header: FileMeta['step'] = {}
  const afterFn = text.slice(fnIdx + 9)
  const quotes = afterFn.match(/'([^']*)'/g)
  if (quotes && quotes.length >= 6) {
    header.name = quotes[0].slice(1, -1)
    header.time_stamp = quotes[1].slice(1, -1)
    header.author = quotes[2].slice(1, -1)
    header.organization = quotes[3].slice(1, -1)
    if (quotes[4]) header.preprocessor_version = quotes[4].slice(1, -1)
    if (quotes[5]) header.originating_system = quotes[5].slice(1, -1)
    if (quotes[6]) header.authorization = quotes[6].slice(1, -1)
  }

  const descMatch = text.match(/FILE_DESCRIPTION\s*\(\s*\(\s*'([^']*)'\s*\)/)
  if (descMatch) header.file_description = descMatch[1]

  const afterDesc = text.slice(text.indexOf('FILE_DESCRIPTION'))
  const levelMatch = afterDesc.match(/,?\s*'([^']*)'\s*\)/)
  if (levelMatch) header.implementation_level = levelMatch[1]

  const schemaMatch = text.match(/FILE_SCHEMA\s*\(\s*\(\s*'([^']*)'\s*\)/)
  if (schemaMatch) header.file_schema = schemaMatch[1]

  return Object.keys(header).length > 0 ? header : undefined
}

/** Thrown when a .model file has no objects with geometry data. */
export class ModelEmptyError extends Error {
  readonly fileName: string
  constructor(fileName: string) {
    super('MODEL_EMPTY')
    this.name = 'ModelEmptyError'
    this.fileName = fileName
  }
}

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
  /** Bambu Lab 3MF metadata (only for 3mf files originating from Bambu Studio) */
  bambuMetadata?: Bambu3mfMetadata
  /** File-level metadata extracted from the format header/tags. */
  fileMeta?: FileMeta
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
    if (mapping?.meshes === undefined || !(obj instanceof THREE.Mesh)) continue
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
      if (mapping?.textures === undefined) continue
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

async function getGltfLoader(): Promise<GLTFLoader> {
  if (_sharedGltfLoader) return _sharedGltfLoader

  const loader = new GLTFLoader()

  const dracoLoader = new DRACOLoader()
  dracoLoader.setDecoderPath('/wasm/draco/')
  loader.setDRACOLoader(dracoLoader)

  const ktx2Loader = new KTX2Loader()
  ktx2Loader.setTranscoderPath('/wasm/basis/')
  loader.setKTX2Loader(ktx2Loader)

  const { GLTFAnimationPointerExtension } = await import('@needle-tools/three-animation-pointer')
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
      const { updateProgress } = useModelStore.getState()
      resetYieldTimer()

      updateProgress('Parsing GLB data...', 10)
      const gltf = await (await getGltfLoader()).parseAsync(buffer, '')

      updateProgress('Processing meshes...', 70)
      await yieldToUI(true)
      const meshes = extractMeshes(gltf.scene)
      annotateMaterialIndices(gltf, gltf.parser.json)

      updateProgress('Building extensions...', 85)
      await yieldToUI(true)
      const json = gltf.parser.json
      const { resolutionMap, thumbnailMap, previewMap } = buildTextureExtras(gltf)
      const gltfExtensions = buildGlbExtensionData(json, gltf.animations, resolutionMap, thumbnailMap, previewMap)
      const asset = json.asset as Record<string, unknown> | undefined

      updateProgress('Finalizing...', 95)
      await yieldToUI(true)
      const fileMeta: FileMeta = {
        glb: {
          generator: typeof asset?.generator === 'string' ? asset.generator : undefined,
          version: typeof asset?.version === 'string' ? asset.version : undefined,
          minVersion: typeof asset?.minVersion === 'string' ? asset.minVersion : undefined,
          copyright: typeof asset?.copyright === 'string' ? asset.copyright : undefined,
        },
      }
      return { meshes, objects: [], sceneRoot: gltf.scene, sourceUnit: 'meter', animations: gltf.animations, gltfExtensions, fileMeta }
    }
    case 'gltf': {
      if (resourcePath) {
        // Convert glTF + external files into self-contained GLB binary
        useModelStore.getState().updateProgress('Converting GLTF to GLB...', 20)
        const glbBuffer = await gltfToGlb(bufferToText(buffer), resourcePath)
        return loadFormat(glbBuffer, 'glb')
      }
      // No file path — try parsing directly (works if glTF has only data URIs or
      // if pre-resolved by test helpers)
      const gltfText = bufferToText(buffer)
      const gltf = await (await getGltfLoader()).parseAsync(gltfText, '')
      const meshes = extractMeshes(gltf.scene)
      const json = JSON.parse(gltfText)
      const { resolutionMap, thumbnailMap, previewMap } = buildTextureExtras(gltf)
      const gltfExtensions = buildGlbExtensionData(json, gltf.animations, resolutionMap, thumbnailMap, previewMap)
      const asset = json.asset as Record<string, unknown> | undefined
      const fileMeta: FileMeta = {
        glb: {
          generator: typeof asset?.generator === 'string' ? asset.generator : undefined,
          version: typeof asset?.version === 'string' ? asset.version : undefined,
          minVersion: typeof asset?.minVersion === 'string' ? asset.minVersion : undefined,
          copyright: typeof asset?.copyright === 'string' ? asset.copyright : undefined,
        },
      }
      return { meshes, objects: [], sceneRoot: gltf.scene, sourceUnit: 'meter', animations: gltf.animations, gltfExtensions, fileMeta }
    }
    case '3mf': {
      const { updateProgress } = useModelStore.getState()
      resetYieldTimer()

      updateProgress('Parsing 3MF geometry...', 10)
      const group = new ThreeMFLoader().parse(buffer)
      await yieldToUI(true)

      const meshes = extractMeshes(group)
      let bambuMetadata: Bambu3mfMetadata | undefined
      let fileMeta: FileMeta | undefined
      try {
        updateProgress('Extracting metadata...', 40)
        bambuMetadata = parseBambu3mf(buffer, (msg, pct) => {
          updateProgress(msg, pct)
        })
        await yieldToUI(true)
        if (bambuMetadata.metadataEntries.length > 0) {
          fileMeta = { '3mf': { entries: bambuMetadata.metadataEntries } }
        }
      } catch {
        // non-Bambu 3MF — proceed without metadata
      }

      updateProgress('Finalizing...', 90)
      await yieldToUI(true)
      return { meshes, objects: extractAllObjects(group), bambuMetadata, fileMeta }
    }
    case 'model': {
      const text = bufferToText(buffer)
      const doc = new DOMParser().parseFromString(text, 'application/xml')
      const NS = 'http://schemas.microsoft.com/3dmanufacturing/core/2015/02'
      const objectEls = Array.from(doc.getElementsByTagNameNS(NS, 'object'))
      const meshes: THREE.Mesh[] = []
      const group = new THREE.Group()
      for (const objEl of objectEls) {
        const meshEl = objEl.getElementsByTagNameNS(NS, 'mesh')[0]
        if (!meshEl) continue
        const vertexEls = meshEl.getElementsByTagNameNS(NS, 'vertex')
        const positions = new Float32Array(vertexEls.length * 3)
        for (let i = 0; i < vertexEls.length; i++) {
          positions[i * 3] = parseFloat(vertexEls[i].getAttribute('x')!)
          positions[i * 3 + 1] = parseFloat(vertexEls[i].getAttribute('y')!)
          positions[i * 3 + 2] = parseFloat(vertexEls[i].getAttribute('z')!)
        }
        const triEls = meshEl.getElementsByTagNameNS(NS, 'triangle')
        const indices = new Uint32Array(triEls.length * 3)
        for (let i = 0; i < triEls.length; i++) {
          indices[i * 3] = parseInt(triEls[i].getAttribute('v1')!, 10)
          indices[i * 3 + 1] = parseInt(triEls[i].getAttribute('v2')!, 10)
          indices[i * 3 + 2] = parseInt(triEls[i].getAttribute('v3')!, 10)
        }
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
        geo.setIndex(new THREE.BufferAttribute(indices, 1))
        geo.computeVertexNormals()
        const objectId = objEl.getAttribute('id')!
        const mesh = new THREE.Mesh(geo)
        mesh.name = `object ${objectId}`
        meshes.push(mesh)
        group.add(mesh)
      }
      if (meshes.length === 0) {
        const fileName = resourcePath ? resourcePath.split(/[/\\]/).pop() || resourcePath : 'unknown'
        throw new ModelEmptyError(fileName)
      }
      const unitMatch = text.match(/<model[^>]*\sunit="([^"]+)"/i)
      const sourceUnit = unitMatch ? unitMatch[1].toLowerCase() as UnitSystem : undefined
      return { meshes, objects: [], sceneRoot: group, sourceUnit }
    }

    // ---- mesh formats: text-based ----
    case 'obj': {
      const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js')
      const text = bufferToText(buffer)
      const group = new OBJLoader().parse(text)
      const meshes = extractMeshes(group)
      return { meshes, objects: extractAllObjects(group) }
    }
    case 'dae': {
      const { ColladaLoader } = await import('three/examples/jsm/loaders/ColladaLoader.js')
      const text = bufferToText(buffer)
      const scene = new ColladaLoader().parse(text, '')
      const meshes = extractMeshes(scene.scene)
      return { meshes, objects: extractAllObjects(scene.scene) }
    }
    case 'wrl': {
      const { VRMLLoader } = await import('three/examples/jsm/loaders/VRMLLoader.js')
      const text = bufferToText(buffer)
      const scene = new VRMLLoader().parse(text)
      const meshes = extractMeshes(scene)
      return { meshes, objects: extractAllObjects(scene) }
    }

    // ---- mesh formats: binary ----
    case 'ply': {
      const { PLYLoader } = await import('three/examples/jsm/loaders/PLYLoader.js')
      // PLYLoader detects ascii vs binary from header
      // give it the raw ArrayBuffer for both cases
      const geo = new PLYLoader().parse(buffer)
      geo.computeVertexNormals()
      const mesh = new THREE.Mesh(geo)
      return { meshes: [mesh], objects: [] }
    }
    case 'fbx': {
      const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js')
      const group = new FBXLoader().parse(buffer, '')
      const meshes = extractMeshes(group)
      return { meshes, objects: extractAllObjects(group) }
    }
    case '3ds': {
      const { TDSLoader } = await import('three/examples/jsm/loaders/TDSLoader.js')
      const group = new TDSLoader().parse(buffer)
      const meshes = extractMeshes(group)
      return { meshes, objects: extractAllObjects(group) }
    }
    case 'usdz': {
      const { USDZLoader } = await import('three/examples/jsm/loaders/USDZLoader.js')
      const group = new USDZLoader().parse(buffer)
      const meshes = extractMeshes(group)
      return { meshes, objects: extractAllObjects(group) }
    }
    case 'vox': {
      const { VOXLoader } = await import('three/examples/jsm/loaders/VOXLoader.js')
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
      const { KMZLoader } = await import('three/examples/jsm/loaders/KMZLoader.js')
      const result = new KMZLoader().parse(buffer)
      const scene = result?.scene
      if (scene) {
        const meshes = extractMeshes(scene)
        return { meshes, objects: extractAllObjects(scene) }
      }
      return { meshes: [], objects: [] }
    }
    case 'amf': {
      const { AMFLoader } = await import('three/examples/jsm/loaders/AMFLoader.js')
      // AMFLoader detects ZIP vs XML from raw buffer — pass binary, not text
      const group = new AMFLoader().parse(buffer)
      const meshes = extractMeshes(group)
      return { meshes, objects: extractAllObjects(group) }
    }
    case 'lwo': {
      const { LWOLoader } = await import('three/examples/jsm/loaders/LWOLoader.js')
      // LWOLoader.parse() returns {meshes: Mesh[], materials: Material[]}, not a Group
      const result = new LWOLoader().parse(buffer, '', 'model')
      return { meshes: result?.meshes || [], objects: [] }
    }
    case 'md2': {
      const { MD2Loader } = await import('three/examples/jsm/loaders/MD2Loader.js')
      // MD2Loader.parse() returns a BufferGeometry directly, not a Group
      const geo = new MD2Loader().parse(buffer)
      if (!geo) return { meshes: [], objects: [] }
      geo.computeVertexNormals()
      const mesh = new THREE.Mesh(geo)
      return { meshes: [mesh], objects: [] }
    }
    case '3dm': {
      const { Rhino3dmLoader } = await import('three/examples/jsm/loaders/3DMLoader.js')
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
      const { VTKLoader } = await import('three/examples/jsm/loaders/VTKLoader.js')
      const geo = new VTKLoader().parse(buffer)
      geo.computeVertexNormals()
      const mesh = new THREE.Mesh(geo)
      return { meshes: [mesh], objects: [] }
    }
    case 'xyz': {
      const { XYZLoader } = await import('three/examples/jsm/loaders/XYZLoader.js')
      const text = bufferToText(buffer)
      const geo = new XYZLoader().parse(text)
      // XYZ is atom positions — render as point cloud
      const points = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.1, color: 0xffffff }))
      return { meshes: [], objects: [points] }
    }
    case 'pdb': {
      const { PDBLoader } = await import('three/examples/jsm/loaders/PDBLoader.js')
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
      const { NRRDLoader } = await import('three/examples/jsm/loaders/NRRDLoader.js')
      // NRRD produces volume data (3D texture) — create a unit box with wireframe
      // so the user can see something; real volume rendering needs custom shaders
      const _volume = new NRRDLoader().parse(buffer)
      const geo = new THREE.BoxGeometry(1, 1, 1)
      const mesh = new THREE.Mesh(geo)
      mesh.name = 'NRRD proxy'
      return { meshes: [mesh], objects: [], sourceUnit: 'micron' }
    }
    case 'pcd': {
      const { PCDLoader } = await import('three/examples/jsm/loaders/PCDLoader.js')
      const points = new PCDLoader().parse(buffer)
      // PCDLoader returns THREE.Points — render directly as point cloud
      if (points instanceof THREE.Points) {
        // PCDLoader hardcodes size: 0.005, which is far too small for many
        // real-world point clouds.  Compute an adaptive size from the bounding
        // sphere so points are always a few pixels across regardless of scale.
        if (points.geometry.boundingSphere) {
          const radius = points.geometry.boundingSphere.radius || 1
          const adaptiveSize = Math.max(radius * 0.02, 0.002)
          ;(points.material as THREE.PointsMaterial).size = adaptiveSize
        }
        return { meshes: [], objects: [points] }
      }
      return { meshes: [], objects: [] }
    }

    // ---- animation ----
    case 'bvh': {
      const { BVHLoader } = await import('three/examples/jsm/loaders/BVHLoader.js')
      const text = bufferToText(buffer)
      const result = new BVHLoader().parse(text)
      const skeleton = result.skeleton
      const objects: THREE.Object3D[] = []
      if (skeleton.bones.length > 0) {
        const rootBone = skeleton.bones[0]

        // Apply first-frame pose.  BVHLoader creates bones in rest pose
        // (offset positions only); the animation clip holds the actual
        // pose data.  Evaluate the clip at time 0 so the skeleton appears
        // in its animated pose rather than the raw T-pose.
        if (result.clip) {
          const mixer = new THREE.AnimationMixer(rootBone)
          const action = mixer.clipAction(result.clip)
          action.play()
          // update(0.001) ensures the mixer evaluates keyframes at t=0
          mixer.update(0.001)
        }

        rootBone.updateMatrixWorld(true)
        const helper = new THREE.SkeletonHelper(rootBone)

        // Default SkeletonHelper material is pure white LineBasicMaterial
        // (linewidth 1).  On most platforms WebGL clamps lineWidth to 1,
        // making the skeleton nearly invisible against dark backgrounds and
        // in thumbnails.  Use a higher-contrast color + increase opacity.
        if (helper.material instanceof THREE.LineBasicMaterial) {
          helper.material.color.set(0x5599ff)
        }

        objects.push(helper)

        // Add joint markers (small spheres) at bone world positions.
        // These remain visible in thumbnails where 1px lines disappear,
        // and help users see the skeleton structure in the viewport.
        const jointPositions: number[] = []
        for (const bone of skeleton.bones) {
          const pos = bone.matrixWorld.elements
          jointPositions.push(pos[12], pos[13], pos[14])
        }
        const jointGeo = new THREE.BufferGeometry()
        jointGeo.setAttribute(
          'position',
          new THREE.Float32BufferAttribute(jointPositions, 3),
        )
        jointGeo.computeBoundingSphere()
        const jointRadius = (jointGeo.boundingSphere?.radius ?? 50) * 0.035
        const jointMat = new THREE.PointsMaterial({
          size: Math.max(jointRadius, 0.3),
          color: 0xff6644,
        })
        objects.push(new THREE.Points(jointGeo, jointMat))
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
      const { GCodeLoader } = await import('three/examples/jsm/loaders/GCodeLoader.js')
      const text = bufferToText(buffer)
      const group = new GCodeLoader().parse(text)
      // GCodeLoader applies -π/2 X-rotation to convert Z-up (G-code native) → Y-up
      // (Three.js default). Our scene is Z-up, so undo this rotation.
      group.rotation.set(0, 0, 0)
      group.updateMatrixWorld(true)
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
    case 'ifc': {
      return loadIfcAsMeshes(buffer)
    }

    // ---- OpenSCAD (CDN/local WASM) ----
    case 'scad': {
      const code = bufferToText(buffer)
      const { stlBuffer } = await scadToStl(code)
      return loadFormat(stlBuffer, 'stl')
    }

    default:
      console.error(`[formatLoaders] unknown format: ${format}`)
      return { meshes: [], objects: [] }
  }
}
