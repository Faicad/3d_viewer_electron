import * as THREE from 'three'
import type { MaterialAppearance, AlphaMode } from '@/engine/material/types'

// ---------------------------------------------------------------------------
// Texture serialisation
// ---------------------------------------------------------------------------

/** Texture slots tracked on every material. */
const TEXTURE_SLOTS = [
  'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap',
  'emissiveMap', 'transmissionMap', 'thicknessMap', 'clearcoatMap',
  'clearcoatNormalMap', 'alphaMap',
] as const

/** Lightweight info extracted from a THREE.Texture. */
export interface TextureSlotInfo {
  dataUri: string
  thumbnail: string
  width: number
  height: number
}

const THUMB_SIZE = 20

/**
 * Draw the texture image into a canvas and return a data-URI.
 * Works with HTMLImageElement, ImageBitmap, and HTMLCanvasElement.
 */
function textureImageToDataUri(
  image: HTMLImageElement | HTMLCanvasElement | ImageBitmap,
  mimeType = 'image/png',
  quality?: number,
): string | undefined {
  try {
    const canvas = document.createElement('canvas')
    const w = 'naturalWidth' in image ? (image as HTMLImageElement).naturalWidth : image.width
    const h = 'naturalHeight' in image ? (image as HTMLImageElement).naturalHeight : image.height
    if (!w || !h) return undefined
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined
    ctx.drawImage(image as CanvasImageSource, 0, 0)
    return canvas.toDataURL(mimeType, quality)
  } catch {
    return undefined
  }
}

/** Generate a 20×20 thumbnail data-URI from a texture. */
export function textureThumbnail(texture: THREE.Texture): string | undefined {
  const image = texture.image as HTMLImageElement | HTMLCanvasElement | ImageBitmap | undefined
  if (!image) return undefined
  try {
    const canvas = document.createElement('canvas')
    canvas.width = THUMB_SIZE
    canvas.height = THUMB_SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined
    ctx.drawImage(image as CanvasImageSource, 0, 0, THUMB_SIZE, THUMB_SIZE)
    return canvas.toDataURL('image/png')
  } catch {
    return undefined
  }
}

/** Deduplicated thumbnail cache keyed by image reference for the current extraction pass. */
function extractTexturesFromMaterial(
  mat: THREE.Material,
  thumbCache: WeakMap<object, string>,
): Record<string, TextureSlotInfo> {
  const result: Record<string, TextureSlotInfo> = {}
  for (const slot of TEXTURE_SLOTS) {
    const tex = (mat as Record<string, unknown>)[slot] as THREE.Texture | null | undefined
    if (!tex?.image) continue
    const image = tex.image as HTMLImageElement | HTMLCanvasElement | ImageBitmap

    // thumbnail — deduped by image reference
    let thumb = thumbCache.get(image)
    if (!thumb) {
      thumb = textureThumbnail(tex)
      if (thumb) thumbCache.set(image, thumb)
    }
    if (!thumb) continue

    // full data-URI — use JPEG for non-alpha slots to save memory
    const w = 'naturalWidth' in image ? (image as HTMLImageElement).naturalWidth : image.width
    const h = 'naturalHeight' in image ? (image as HTMLImageElement).naturalHeight : image.height
    const dataUri = textureImageToDataUri(image, 'image/jpeg', 0.85)

    result[slot] = {
      dataUri: dataUri ?? thumb, // fallback to thumbnail if full fails
      thumbnail: thumb,
      width: w ?? 0,
      height: h ?? 0,
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Clone or convert a source material for use in the PBR rendering pipeline.
 * Returns null when the source is null/undefined — the caller should fall
 * back to a default material in that case.
 */
export function cloneAndConvertMaterial(
  src: THREE.Material | THREE.Material[] | null | undefined,
): THREE.Material | THREE.Material[] | null {
  if (src == null) return null
  if (Array.isArray(src)) {
    return src.map((m) => convertSingle(m))
  }
  return convertSingle(src)
}

/** Create the default PBR material for meshes without source materials. */
export function createDefaultMaterial(): THREE.MeshPhysicalMaterial {
  const mat = new THREE.MeshPhysicalMaterial()
  mat.color.setHex(0x9ba6ae)
  mat.roughness = 0.35
  mat.metalness = 0.1
  mat.side = THREE.FrontSide
  mat.needsUpdate = true
  return mat
}

/**
 * Dispose a material and all its texture references.
 * Safe to call on null, undefined, single materials, or arrays.
 */
export function disposeMaterial(
  mat: THREE.Material | THREE.Material[] | null | undefined,
): void {
  if (mat == null) return
  if (Array.isArray(mat)) {
    for (const m of mat) disposeSingle(m)
    return
  }
  disposeSingle(mat)
}

/**
 * Extract the dominant colour from a material for use as wireframe / mesh-mode
 * line colour. Returns null when no meaningful colour can be extracted.
 */
export function getMaterialColor(
  mat: THREE.Material | THREE.Material[] | null | undefined,
): string | null {
  if (mat == null) return null
  const target = Array.isArray(mat) ? mat[0] : mat
  if (!target) return null

  // Prefer color property when it differs from the default white
  if ('color' in target && target.color instanceof THREE.Color) {
    const c = target.color
    if (c.r !== 1 || c.g !== 1 || c.b !== 1) {
      return '#' + c.getHexString()
    }
  }

  // For textured materials, fall back to a neutral grey rather than guessing
  // an average colour from pixel data.
  if ('map' in target && (target as THREE.MeshPhysicalMaterial).map) return null

  // MeshNormalMaterial — use a distinctive blue
  if (target instanceof THREE.MeshNormalMaterial) return '#4488ff'

  return null
}

/**
 * Extract a MaterialAppearance descriptor from a Three.js material.
 * Returns null when no meaningful appearance can be extracted.
 */
export function materialToAppearance(
  mat: THREE.Material | THREE.Material[] | null | undefined,
  name: string,
  thumbCache?: WeakMap<object, string>,
): { appearance: MaterialAppearance | null; textures: Record<string, TextureSlotInfo> } {
  if (mat == null) return { appearance: null, textures: {} }
  const target = Array.isArray(mat) ? mat[0] : mat
  if (!target) return { appearance: null, textures: {} }

  const textures = thumbCache != null ? extractTexturesFromMaterial(target, thumbCache) : {}

  const a: MaterialAppearance = { name }

  if ('color' in target && target.color instanceof THREE.Color) {
    a.color = [target.color.r, target.color.g, target.color.b, target.opacity]
  }

  if (
    target instanceof THREE.MeshPhysicalMaterial ||
    target instanceof THREE.MeshStandardMaterial
  ) {
    a.roughness = target.roughness
    a.metalness = target.metalness
  }

  if (target instanceof THREE.MeshPhysicalMaterial) {
    a.clearcoat = target.clearcoat
    a.clearcoatRoughness = target.clearcoatRoughness
    a.sheen = target.sheen
    if (target.sheenColor) {
      a.sheenColor = [target.sheenColor.r, target.sheenColor.g, target.sheenColor.b]
    }
    a.sheenRoughness = target.sheenRoughness
    a.transmission = target.transmission
    a.thickness = target.thickness
    a.ior = target.ior
  }

  if ('emissive' in target && target.emissive instanceof THREE.Color) {
    const e = target.emissive
    if (e.r !== 0 || e.g !== 0 || e.b !== 0) {
      a.emissive = [e.r, e.g, e.b]
    }
  }
  if ('emissiveIntensity' in target && typeof target.emissiveIntensity === 'number') {
    a.emissiveIntensity = target.emissiveIntensity
  }

  if (target instanceof THREE.MeshStandardMaterial && target.side === THREE.DoubleSide) {
    a.doubleSided = true
  }

  if (target.transparent) {
    if ((target as THREE.MeshStandardMaterial).alphaTest > 0) {
      a.alphaMode = 'MASK' as AlphaMode
      a.alphaCutoff = (target as THREE.MeshStandardMaterial).alphaTest
    } else {
      a.alphaMode = 'BLEND' as AlphaMode
    }
  }

  // Populate texture data-URIs from extracted textures (for override support)
  if (textures.map) a.map = textures.map.dataUri
  if (textures.normalMap) a.normalMap = textures.normalMap.dataUri
  if (textures.roughnessMap) a.roughnessMap = textures.roughnessMap.dataUri
  if (textures.metalnessMap) a.metalnessMap = textures.metalnessMap.dataUri
  if (textures.aoMap) a.aoMap = textures.aoMap.dataUri
  if (textures.emissiveMap) a.emissiveMap = textures.emissiveMap.dataUri
  if (textures.transmissionMap) a.transmissionMap = textures.transmissionMap.dataUri
  if (textures.thicknessMap) a.thicknessMap = textures.thicknessMap.dataUri
  if (textures.clearcoatMap) a.clearcoatMap = textures.clearcoatMap.dataUri
  if (textures.clearcoatNormalMap) a.clearcoatNormalMap = textures.clearcoatNormalMap.dataUri
  if (textures.alphaMap) a.alphaMap = textures.alphaMap.dataUri

  return { appearance: a, textures }
}

// ---------------------------------------------------------------------------
// Internal dispatch
// ---------------------------------------------------------------------------

function convertSingle(src: THREE.Material): THREE.Material {
  let dst: THREE.Material
  if (src instanceof THREE.MeshPhysicalMaterial) {
    dst = src.clone()
  } else if (src instanceof THREE.MeshStandardMaterial) {
    dst = standardToPhysical(src)
  } else if (src instanceof THREE.MeshPhongMaterial) {
    dst = phongToStandard(src)
  } else if (src instanceof THREE.MeshLambertMaterial) {
    dst = lambertToStandard(src)
  } else if (src instanceof THREE.MeshBasicMaterial) {
    dst = basicToStandard(src)
  } else if (src instanceof THREE.MeshToonMaterial) {
    dst = toonToStandard(src)
  } else if (src instanceof THREE.MeshNormalMaterial) {
    dst = src.clone()
  } else if (src instanceof THREE.MeshMatcapMaterial) {
    dst = matcapToStandard(src)
  } else {
    dst = fallbackToStandard(src)
  }

  // Apply polygon offset to prevent z-fighting between adjacent/overlapping surfaces
  if (dst instanceof THREE.MeshStandardMaterial || dst instanceof THREE.MeshPhysicalMaterial) {
    dst.polygonOffset = true
    dst.polygonOffsetFactor = -1
    dst.polygonOffsetUnits = -1
  }

  return dst
}

// ---------------------------------------------------------------------------
// Per-type converters
// ---------------------------------------------------------------------------

function standardToPhysical(
  src: THREE.MeshPhysicalMaterial,
): THREE.MeshPhysicalMaterial {
  const dst = new THREE.MeshPhysicalMaterial()

  dst.color.copy(src.color)
  dst.map = src.map
  dst.lightMap = src.lightMap
  dst.lightMapIntensity = src.lightMapIntensity
  dst.aoMap = src.aoMap
  dst.aoMapIntensity = src.aoMapIntensity
  dst.emissive.copy(src.emissive)
  dst.emissiveMap = src.emissiveMap
  dst.emissiveIntensity = src.emissiveIntensity
  dst.bumpMap = src.bumpMap
  dst.bumpScale = src.bumpScale
  dst.normalMap = src.normalMap
  dst.normalScale.copy(src.normalScale)
  dst.displacementMap = src.displacementMap
  dst.displacementScale = src.displacementScale
  dst.displacementBias = src.displacementBias
  dst.roughnessMap = src.roughnessMap
  dst.metalnessMap = src.metalnessMap
  dst.alphaMap = src.alphaMap
  dst.envMap = src.envMap
  dst.envMapIntensity = src.envMapIntensity
  dst.transparent = src.transparent
  dst.opacity = src.opacity
  dst.side = src.side
  dst.wireframe = src.wireframe
  dst.vertexColors = src.vertexColors
  dst.fog = src.fog
  dst.roughness = src.roughness
  dst.metalness = src.metalness
  dst.flatShading = src.flatShading
  if (src.defines) dst.defines = { ...src.defines }

  dst.needsUpdate = true
  return dst
}

function phongToStandard(src: THREE.MeshPhongMaterial): THREE.MeshPhysicalMaterial {
  const dst = new THREE.MeshPhysicalMaterial()

  dst.color.copy(src.color)
  dst.map = src.map
  dst.lightMap = src.lightMap
  dst.lightMapIntensity = src.lightMapIntensity
  dst.aoMap = src.aoMap
  dst.aoMapIntensity = src.aoMapIntensity
  dst.emissive.copy(src.emissive)
  dst.emissiveMap = src.emissiveMap
  dst.emissiveIntensity = src.emissiveIntensity
  dst.bumpMap = src.bumpMap
  dst.bumpScale = src.bumpScale
  dst.normalMap = src.normalMap
  dst.normalScale.copy(src.normalScale)
  dst.displacementMap = src.displacementMap
  dst.displacementScale = src.displacementScale
  dst.displacementBias = src.displacementBias
  dst.alphaMap = src.alphaMap
  dst.transparent = src.transparent
  dst.opacity = src.opacity
  dst.side = src.side
  dst.wireframe = src.wireframe
  dst.vertexColors = src.vertexColors
  dst.fog = src.fog
  dst.envMap = src.envMap
  dst.envMapIntensity = src.envMapIntensity

  // Phong shininess (0–1000) → PBR roughness (0–1)
  dst.roughness = 1 - Math.sqrt(Math.min(src.shininess, 1000) / 1000)

  // Phong specular luminance → PBR metalness (rough approximation)
  const specLuminance =
    0.2126 * src.specular.r + 0.7152 * src.specular.g + 0.0722 * src.specular.b
  dst.metalness = Math.min(specLuminance, 1.0)

  // Note: specularMap is NOT mapped to roughnessMap because the semantics
  // differ fundamentally (specular intensity ≠ roughness). The uniform
  // roughness above provides a reasonable approximation.

  dst.needsUpdate = true
  return dst
}

function lambertToStandard(
  src: THREE.MeshLambertMaterial,
): THREE.MeshPhysicalMaterial {
  const dst = new THREE.MeshPhysicalMaterial()

  dst.color.copy(src.color)
  dst.map = src.map
  dst.lightMap = src.lightMap
  dst.lightMapIntensity = src.lightMapIntensity
  dst.aoMap = src.aoMap
  dst.aoMapIntensity = src.aoMapIntensity
  dst.emissive.copy(src.emissive)
  dst.emissiveMap = src.emissiveMap
  dst.emissiveIntensity = src.emissiveIntensity
  dst.bumpMap = src.bumpMap
  dst.bumpScale = src.bumpScale
  dst.normalMap = src.normalMap
  dst.normalScale.copy(src.normalScale)
  dst.alphaMap = src.alphaMap
  dst.transparent = src.transparent
  dst.opacity = src.opacity
  dst.side = src.side
  dst.vertexColors = src.vertexColors
  dst.fog = src.fog
  dst.envMap = src.envMap
  dst.envMapIntensity = src.envMapIntensity

  dst.roughness = 0.9
  dst.metalness = 0.0

  dst.needsUpdate = true
  return dst
}

function basicToStandard(
  src: THREE.MeshBasicMaterial,
): THREE.MeshPhysicalMaterial {
  const dst = new THREE.MeshPhysicalMaterial()

  dst.color.copy(src.color)
  dst.map = src.map
  dst.alphaMap = src.alphaMap
  dst.transparent = src.transparent
  dst.opacity = src.opacity
  dst.side = src.side
  dst.vertexColors = src.vertexColors
  dst.fog = src.fog
  dst.envMap = src.envMap
  dst.envMapIntensity = src.envMapIntensity

  dst.roughness = 1.0
  dst.metalness = 0.0

  dst.needsUpdate = true
  return dst
}

function toonToStandard(src: THREE.MeshToonMaterial): THREE.MeshPhysicalMaterial {
  const dst = new THREE.MeshPhysicalMaterial()

  dst.color.copy(src.color)
  dst.map = src.map
  dst.gradientMap = src.gradientMap
  dst.alphaMap = src.alphaMap
  dst.transparent = src.transparent
  dst.opacity = src.opacity
  dst.side = src.side
  dst.vertexColors = src.vertexColors
  dst.fog = src.fog
  dst.emissive.copy(src.emissive)
  dst.emissiveMap = src.emissiveMap
  dst.emissiveIntensity = src.emissiveIntensity
  dst.bumpMap = src.bumpMap
  dst.bumpScale = src.bumpScale
  dst.normalMap = src.normalMap
  dst.normalScale.copy(src.normalScale)
  dst.lightMap = src.lightMap
  dst.lightMapIntensity = src.lightMapIntensity
  dst.aoMap = src.aoMap
  dst.aoMapIntensity = src.aoMapIntensity
  dst.envMap = src.envMap
  dst.envMapIntensity = src.envMapIntensity

  dst.roughness = 0.6
  dst.metalness = 0.0

  dst.needsUpdate = true
  return dst
}

function matcapToStandard(
  src: THREE.MeshMatcapMaterial,
): THREE.MeshPhysicalMaterial {
  const dst = new THREE.MeshPhysicalMaterial()

  dst.color.copy(src.color)
  dst.map = src.map
  dst.alphaMap = src.alphaMap
  dst.transparent = src.transparent
  dst.opacity = src.opacity
  dst.side = src.side
  dst.vertexColors = src.vertexColors
  dst.fog = src.fog

  dst.roughness = 1.0
  dst.metalness = 0.0

  dst.needsUpdate = true
  return dst
}

function fallbackToStandard(src: THREE.Material): THREE.MeshPhysicalMaterial {
  const dst = new THREE.MeshPhysicalMaterial()

  if ('color' in src && src.color instanceof THREE.Color) {
    dst.color.copy(src.color)
  }
  if ('opacity' in src && typeof src.opacity === 'number') {
    dst.opacity = src.opacity
    dst.transparent = src.transparent ?? dst.opacity < 1
  }
  if ('side' in src && typeof src.side === 'number') {
    dst.side = src.side as THREE.Side
  }
  if ('envMap' in src && src.envMap instanceof THREE.Texture) {
    dst.envMap = src.envMap
  }
  if ('envMapIntensity' in src && typeof src.envMapIntensity === 'number') {
    dst.envMapIntensity = src.envMapIntensity
  }
  dst.roughness = 0.5
  dst.metalness = 0.0
  dst.needsUpdate = true
  return dst
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function disposeSingle(mat: THREE.Material): void {
  for (const key of Object.keys(mat)) {
    const value = (mat as Record<string, unknown>)[key]
    if (value instanceof THREE.Texture) {
      value.dispose()
    }
  }
  mat.dispose()
}
