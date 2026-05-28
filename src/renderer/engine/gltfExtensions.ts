import type { AnimationClip } from 'three'

// ---- Types ----

export type ExtensionStatus = 'supported' | 'unsupported' | 'unknown'

export interface GltfExtensionInfo {
  name: string
  required: boolean
  status: ExtensionStatus
  category: string
  description: string
}

export interface GltfMaterialMeta {
  index: number
  name: string
  instanceCount: number
  textureSlotCount: number
  alphaMode: string
  doubleSided: boolean
}

export interface GltfTextureMeta {
  index: number
  name: string
  uri: string
  mimeType: string
  slots: string[]
  instanceCount: number
  compression: string | null
  resolution: { width: number; height: number } | null
  sizeEstimate: number | null
  thumbnail?: string
  preview?: string
}

export interface GltfAnimationMeta {
  index: number
  name: string
  channels: number
  duration: number
}

export interface GlbExtensionData {
  used: string[]
  required: string[]
  extensions: GltfExtensionInfo[]
  materials: GltfMaterialMeta[]
  textures: GltfTextureMeta[]
  animations: GltfAnimationMeta[]
}

// ---- Parse GLB header to get JSON ----

export function parseGlbJson(buffer: ArrayBuffer): Record<string, unknown> {
  if (buffer.byteLength < 20) throw new Error('Buffer too small to be GLB')
  const view = new DataView(buffer)
  if (view.getUint32(0, true) !== 0x46546C67) throw new Error('Not a GLB file (bad magic)')
  const version = view.getUint32(4, true)
  if (version !== 2) throw new Error(`Unsupported GLB version: ${version}`)
  const jsonChunkLength = view.getUint32(12, true)
  if (view.getUint32(16, true) !== 0x4E4F534A) throw new Error('Missing JSON chunk')
  if (20 + jsonChunkLength > buffer.byteLength) throw new Error('JSON chunk exceeds buffer')
  const jsonBytes = new Uint8Array(buffer, 20, jsonChunkLength)
  const text = new TextDecoder().decode(jsonBytes)
  return JSON.parse(text)
}

// ---- Extension classification ----

const SUPPORTED: Record<string, string> = {
  'KHR_materials_clearcoat': '材质 — 清漆涂层效果',
  'KHR_materials_sheen': '材质 — 光泽效果',
  'KHR_materials_transmission': '材质 — 玻璃/透射效果',
  'KHR_materials_ior': '材质 — 折射率',
  'KHR_materials_specular': '材质 — 高光控制',
  'KHR_materials_anisotropy': '材质 — 各向异性',
  'KHR_materials_iridescence': '材质 — 虹彩效果',
  'KHR_materials_emissive_strength': '材质 — 自发光强度',
  'KHR_materials_volume': '材质 — 体积/衰减',
  'KHR_materials_dispersion': '材质 — 色散',
  'KHR_materials_unlit': '材质 — 无光照材质',
  'KHR_materials_pbrSpecularGlossiness': '材质 — 旧版 PBR（自动转换）',
  'KHR_materials_variants': '材质 — 材质变体',
  'KHR_mesh_quantization': '几何 — 量化顶点属性',
  'KHR_texture_transform': '纹理 — UV 变换',
  'EXT_texture_webp': '纹理 — WebP 纹理',
  'EXT_texture_avif': '纹理 — AVIF 纹理',
  'MSFT_texture_dds': '纹理 — DDS 纹理',
  'KHR_lights_punctual': '光照 — 点光源/方向光',
  'KHR_draco_mesh_compression': '几何 — Draco 解压',
  'KHR_texture_basisu': '纹理 — KTX2/BasisU 转码',
  'EXT_mesh_gpu_instancing': '几何 — GPU 实例化',
}

const UNSUPPORTED: Record<string, string> = {
  'EXT_meshopt_compression': '几何 — Meshopt 解压（需 MeshoptDecoder）',
}

function classifyExtension(name: string): { status: ExtensionStatus; description: string } {
  if (SUPPORTED[name]) return { status: 'supported', description: SUPPORTED[name] }
  if (UNSUPPORTED[name]) return { status: 'unsupported', description: UNSUPPORTED[name] }
  return { status: 'unknown', description: '未知扩展' }
}

function getExtensionCategory(name: string): string {
  if (name.startsWith('KHR_materials_') || name.startsWith('EXT_materials_')) return 'material'
  if (name.startsWith('KHR_texture_') || name.startsWith('EXT_texture_') || name.startsWith('MSFT_texture_')) return 'texture'
  if (name.startsWith('KHR_mesh_') || name.startsWith('EXT_mesh_')) return 'geometry'
  if (name.startsWith('KHR_lights_')) return 'lighting'
  if (name === 'STEP_T') return 'custom'
  return 'unknown'
}

// ---- Texture slot scanning ----

interface SlotPath {
  path: string[]
  name: string
}

const TEXTURE_SLOT_PATHS: SlotPath[] = [
  { path: ['pbrMetallicRoughness', 'baseColorTexture'], name: 'baseColorTexture' },
  { path: ['pbrMetallicRoughness', 'metallicRoughnessTexture'], name: 'metallicRoughnessTexture' },
  { path: ['normalTexture'], name: 'normalTexture' },
  { path: ['occlusionTexture'], name: 'occlusionTexture' },
  { path: ['emissiveTexture'], name: 'emissiveTexture' },
  { path: ['extensions', 'KHR_materials_anisotropy', 'anisotropyTexture'], name: 'KHR_materials_anisotropy.anisotropyTexture' },
  { path: ['extensions', 'KHR_materials_clearcoat', 'clearcoatTexture'], name: 'KHR_materials_clearcoat.clearcoatTexture' },
  { path: ['extensions', 'KHR_materials_clearcoat', 'clearcoatNormalTexture'], name: 'KHR_materials_clearcoat.clearcoatNormalTexture' },
  { path: ['extensions', 'KHR_materials_transmission', 'transmissionTexture'], name: 'KHR_materials_transmission.transmissionTexture' },
  { path: ['extensions', 'KHR_materials_volume', 'thicknessTexture'], name: 'KHR_materials_volume.thicknessTexture' },
  { path: ['extensions', 'KHR_materials_sheen', 'sheenColorTexture'], name: 'KHR_materials_sheen.sheenColorTexture' },
  { path: ['extensions', 'KHR_materials_sheen', 'sheenRoughnessTexture'], name: 'KHR_materials_sheen.sheenRoughnessTexture' },
  { path: ['extensions', 'KHR_materials_specular', 'specularTexture'], name: 'KHR_materials_specular.specularTexture' },
  { path: ['extensions', 'KHR_materials_specular', 'specularColorTexture'], name: 'KHR_materials_specular.specularColorTexture' },
  { path: ['extensions', 'KHR_materials_iridescence', 'iridescenceTexture'], name: 'KHR_materials_iridescence.iridescenceTexture' },
  { path: ['extensions', 'KHR_materials_iridescence', 'iridescenceThicknessTexture'], name: 'KHR_materials_iridescence.iridescenceThicknessTexture' },
]

function getNested(obj: unknown, path: string[]): unknown {
  let cur = obj
  for (const key of path) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[key]
  }
  return cur
}

function collectTextureRefs(
  material: Record<string, unknown>,
  matIndex: number,
  texToSlots: Map<number, string[]>,
  texToMatSet: Map<number, Set<number>>,
): void {
  for (const slot of TEXTURE_SLOT_PATHS) {
    const ref = getNested(material, slot.path) as { index?: number } | undefined
    if (ref?.index !== undefined) {
      const texIdx = ref.index
      if (!texToSlots.has(texIdx)) texToSlots.set(texIdx, [])
      texToSlots.get(texIdx)!.push(`material[${matIndex}].${slot.name}`)
      if (!texToMatSet.has(texIdx)) texToMatSet.set(texIdx, new Set())
      texToMatSet.get(texIdx)!.add(matIndex)
    }
  }
}

// ---- Get image index from texture (handles EXT_texture_webp) ----

function getImageIndex(tex: Record<string, unknown>): number | undefined {
  const extSource = getNested(tex, ['extensions', 'EXT_texture_webp', 'source'])
  if (typeof extSource === 'number') return extSource
  if (typeof tex.source === 'number') return tex.source
  return undefined
}

// ---- Infer compression ----

function inferCompression(mimeType?: string, uri?: string): string | null {
  if (mimeType === 'image/ktx2') return 'KTX2/BasisU'
  if (mimeType === 'image/webp') return 'WebP'
  if (mimeType === 'image/avif') return 'AVIF'
  if (uri) {
    const lower = uri.toLowerCase()
    if (lower.endsWith('.ktx2') || lower.endsWith('.ktx')) return 'KTX2/BasisU'
    if (lower.endsWith('.webp')) return 'WebP'
    if (lower.endsWith('.avif')) return 'AVIF'
    if (lower.endsWith('.dds')) return 'DDS'
  }
  return null
}

function truncateDataUri(uri: string): string {
  if (uri.length <= 60) return uri
  return uri.slice(0, 50) + '...'
}

function formatUri(img: Record<string, unknown>): string {
  if (typeof img.uri === 'string') {
    if (img.uri.startsWith('data:')) return truncateDataUri(img.uri)
    return img.uri
  }
  if (typeof img.bufferView === 'number') return `bufferView://${img.bufferView}`
  return ''
}

// ---- Public extraction functions ----

export function extractExtensions(json: Record<string, unknown>): GltfExtensionInfo[] {
  const used: string[] = Array.isArray(json.extensionsUsed) ? (json.extensionsUsed as string[]) : []
  const required: string[] = Array.isArray(json.extensionsRequired) ? (json.extensionsRequired as string[]) : []
  const all = [...new Set([...used, ...required])]
  return all.map((name) => {
    const { status, description } = classifyExtension(name)
    return {
      name,
      required: required.includes(name),
      status,
      category: getExtensionCategory(name),
      description,
    }
  })
}

export function extractMaterials(json: Record<string, unknown>): GltfMaterialMeta[] {
  const mats: Record<string, unknown>[] = Array.isArray(json.materials) ? (json.materials as Record<string, unknown>[]) : []
  const meshes: Record<string, unknown>[] = Array.isArray(json.meshes) ? (json.meshes as Record<string, unknown>[]) : []

  const instanceCounts = new Array(mats.length).fill(0)
  for (const mesh of meshes) {
    const primitives: { material?: number }[] = Array.isArray(mesh.primitives) ? mesh.primitives as { material?: number }[] : []
    for (const prim of primitives) {
      if (typeof prim.material === 'number' && prim.material < mats.length) {
        instanceCounts[prim.material]++
      }
    }
  }

  return mats.map((mat, idx) => {
    let texCount = 0
    for (const slot of TEXTURE_SLOT_PATHS) {
      const ref = getNested(mat, slot.path) as { index?: number } | undefined
      if (ref?.index !== undefined) texCount++
    }

    return {
      index: idx,
      name: typeof mat.name === 'string' && mat.name ? mat.name : '(unnamed)',
      instanceCount: instanceCounts[idx],
      textureSlotCount: texCount,
      alphaMode: (typeof mat.alphaMode === 'string' ? mat.alphaMode : 'OPAQUE') as string,
      doubleSided: mat.doubleSided === true,
    }
  })
}

export function extractTextures(
  json: Record<string, unknown>,
  resolutionMap?: Map<number, { width: number; height: number }>,
  thumbnailMap?: Map<number, string>,
  previewMap?: Map<number, string>,
): GltfTextureMeta[] {
  const textures: Record<string, unknown>[] = Array.isArray(json.textures) ? (json.textures as Record<string, unknown>[]) : []
  const images: Record<string, unknown>[] = Array.isArray(json.images) ? (json.images as Record<string, unknown>[]) : []
  const materials: Record<string, unknown>[] = Array.isArray(json.materials) ? (json.materials as Record<string, unknown>[]) : []
  const bufferViews: Record<string, unknown>[] = Array.isArray(json.bufferViews) ? (json.bufferViews as Record<string, unknown>[]) : []

  // Reverse mapping: texture index → [slots], material set
  const texToSlots = new Map<number, string[]>()
  const texToMatSet = new Map<number, Set<number>>()
  for (let mi = 0; mi < materials.length; mi++) {
    collectTextureRefs(materials[mi], mi, texToSlots, texToMatSet)
  }

  return textures.map((tex, idx) => {
    const imgIdx = getImageIndex(tex)
    const img = imgIdx !== undefined ? images[imgIdx] : undefined
    let sizeEstimate: number | null = null
    if (img && typeof img.bufferView === 'number') {
      const bv = bufferViews[img.bufferView]
      if (bv && typeof bv.byteLength === 'number') {
        sizeEstimate = bv.byteLength
      }
    }

    const resolution = resolutionMap?.get(idx) ?? null
    const thumbnail = thumbnailMap?.get(idx)
    const preview = previewMap?.get(idx)

    return {
      index: idx,
      name: img && typeof img.name === 'string' && img.name ? img.name : '(unnamed)',
      uri: img ? formatUri(img) : '',
      mimeType: img && typeof img.mimeType === 'string' ? img.mimeType : 'unknown',
      slots: texToSlots.get(idx) ?? [],
      instanceCount: texToMatSet.get(idx)?.size ?? 0,
      compression: inferCompression(img && typeof img.mimeType === 'string' ? img.mimeType : undefined,
        img && typeof img.uri === 'string' ? img.uri : undefined),
      resolution,
      sizeEstimate,
      thumbnail,
      preview,
    }
  })
}

export function extractAnimations(
  json: Record<string, unknown>,
  clips?: AnimationClip[],
): GltfAnimationMeta[] {
  const anims: Record<string, unknown>[] = Array.isArray(json.animations) ? (json.animations as Record<string, unknown>[]) : []

  return anims.map((a, idx) => {
    const channels: unknown[] = Array.isArray(a.channels) ? (a.channels as unknown[]) : []
    return {
      index: idx,
      name: typeof a.name === 'string' && a.name ? a.name : '(unnamed)',
      channels: channels.length,
      duration: clips?.[idx]?.duration ?? 0,
    }
  })
}

export function buildGlbExtensionData(
  json: Record<string, unknown>,
  clips?: AnimationClip[],
  resolutionMap?: Map<number, { width: number; height: number }>,
  thumbnailMap?: Map<number, string>,
  previewMap?: Map<number, string>,
): GlbExtensionData {
  const used: string[] = Array.isArray(json.extensionsUsed) ? (json.extensionsUsed as string[]) : []
  const required: string[] = Array.isArray(json.extensionsRequired) ? (json.extensionsRequired as string[]) : []
  return {
    used,
    required,
    extensions: extractExtensions(json),
    materials: extractMaterials(json),
    textures: extractTextures(json, resolutionMap, thumbnailMap, previewMap),
    animations: extractAnimations(json, clips),
  }
}
