import * as THREE from 'three'
import { loadFormat } from '@/engine/formatLoaders'
import type { FormatId } from '@/config/file-formats'
import { getDefaultUpAxis } from '@/config/file-formats'
import { extractThumbnailBlob } from '@/lib/bambu-3mf/bambu-3mf'
import { useMaterialStore } from '@/stores/material-store'
import { getSharedMaterialFactory } from '@/engine/material/MaterialFactory'

const WIDTH = 200
const HEIGHT = 150
export const THUMBNAIL_TARGET_WIDTH = WIDTH
export const THUMBNAIL_TARGET_HEIGHT = HEIGHT
export const THUMBNAIL_TARGET_RATIO = WIDTH / HEIGHT

/** Crop region computed by {@link computeCropRegion}. */
export interface CropRegion {
  sx: number // source x offset
  sy: number // source y offset
  sw: number // source width to crop
  sh: number // source height to crop
}

/**
 * Compute the center-crop region needed to fit a source image into the
 * project's target aspect ratio ({@link THUMBNAIL_TARGET_RATIO}, 4:3).
 *
 * Pure function — no DOM APIs.  Testable in Node without jsdom.
 */
export function computeCropRegion(
  srcWidth: number,
  srcHeight: number,
): CropRegion {
  const srcRatio = srcWidth / srcHeight
  let sx = 0
  let sy = 0
  let sw = srcWidth
  let sh = srcHeight

  if (srcRatio > THUMBNAIL_TARGET_RATIO) {
    // Source is wider → crop left/right
    sw = srcHeight * THUMBNAIL_TARGET_RATIO
    sx = (srcWidth - sw) / 2
  } else if (srcRatio < THUMBNAIL_TARGET_RATIO) {
    // Source is taller → crop top/bottom
    sh = srcWidth / THUMBNAIL_TARGET_RATIO
    sy = (srcHeight - sh) / 2
  }

  return { sx, sy, sw, sh }
}

/**
 * Crop and scale an embedded PNG thumbnail (e.g. from 3MF) to the project's
 * standard thumbnail size (200×150, 4:3 aspect ratio).
 *
 * Center-crops the source image to 4:3, then scales to exactly WIDTH×HEIGHT.
 * Returns null if the blob cannot be decoded as an image.
 */
export async function processEmbeddedThumbnail(blob: Blob): Promise<Blob | null> {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(blob)

    img.onload = () => {
      URL.revokeObjectURL(url)

      const canvas = document.createElement('canvas')
      canvas.width = WIDTH
      canvas.height = HEIGHT
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(null)
        return
      }

      const { sx, sy, sw, sh } = computeCropRegion(img.width, img.height)
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, WIDTH, HEIGHT)
      canvas.toBlob((b) => resolve(b), 'image/png')
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }

    img.src = url
  })
}

/**
 * Extract a standard 3MF embedded thumbnail from a raw .3mf ArrayBuffer
 * and crop/scale it to the project's thumbnail size.
 *
 * This does NOT parse the 3D geometry — it only unzips the 3MF archive
 * and looks for thumbnail PNGs. Returns null if no embedded thumbnail exists.
 */
export async function extractAndProcess3mfThumbnail(
  buffer: ArrayBuffer,
): Promise<Blob | null> {
  try {
    const { unzipSync } = await import(
      'three/examples/jsm/libs/fflate.module.js'
    )
    const data = new Uint8Array(buffer)
    const unzipped: Record<string, Uint8Array> = unzipSync(data)
    const rawBlob = extractThumbnailBlob(unzipped)
    if (!rawBlob) return null
    return processEmbeddedThumbnail(rawBlob)
  } catch {
    return null
  }
}

let renderer: THREE.WebGLRenderer | null = null
let canvas: HTMLCanvasElement | null = null

function getRenderer(): THREE.WebGLRenderer {
  if (renderer) return renderer

  canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  canvas.style.display = 'none'
  document.body.appendChild(canvas)

  const ctx = canvas.getContext('webgl2', {
    alpha: true,
    antialias: false,
    preserveDrawingBuffer: true,
    powerPreference: 'low-power',
  })
  if (!ctx) throw new Error('WebGL2 not available for thumbnail generation')

  renderer = new THREE.WebGLRenderer({
    canvas,
    context: ctx,
    alpha: true,
    antialias: false,
    preserveDrawingBuffer: true,
  })
  renderer.setSize(WIDTH, HEIGHT, false)
  renderer.setPixelRatio(1)
  renderer.setClearColor(0x000000, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.2

  return renderer
}

function setupLighting(scene: THREE.Scene): void {
  const ambient = new THREE.AmbientLight(0xD4E1E8, 0.5)
  scene.add(ambient)
  const dir1 = new THREE.DirectionalLight(0xFFF5EE, 1.2)
  dir1.position.set(1, 1, 1)
  scene.add(dir1)
  const dir2 = new THREE.DirectionalLight(0xC0D4E8, 0.6)
  dir2.position.set(-0.5, -0.3, -1)
  scene.add(dir2)
  const dir3 = new THREE.DirectionalLight(0x8FD6D6, 0.3)
  dir3.position.set(0, 0.5, -0.5)
  scene.add(dir3)
}

export async function waitForTextures(root: THREE.Object3D, timeout = 3000): Promise<void> {
  const textures: THREE.Texture[] = []
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
      for (const mat of materials) {
        if (!mat) continue
        for (const key of Object.keys(mat)) {
          const value = (mat as Record<string, unknown>)[key]
          if (value instanceof THREE.Texture) {
            textures.push(value)
          }
        }
      }
    }
  })
  if (textures.length === 0) return

  return new Promise<void>((resolve) => {
    const start = Date.now()
    const poll = () => {
      const allReady = textures.every((t) => {
        const img = t.image
        if (!img) return false
        if (img instanceof HTMLImageElement) {
          return img.complete
        }
        return true
      })
      if (allReady || Date.now() - start > timeout) {
        for (const t of textures) {
          t.needsUpdate = true
        }
        resolve()
      } else {
        requestAnimationFrame(poll)
      }
    }
    requestAnimationFrame(poll)
  })
}

function disposeScene(scene: THREE.Scene): void {
  scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry?.dispose()
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => disposeMaterial(m))
        } else {
          disposeMaterial(obj.material)
        }
      }
    }
  })
}

function disposeMaterial(mat: THREE.Material): void {
  for (const key of Object.keys(mat)) {
    const value = (mat as Record<string, unknown>)[key]
    if (value instanceof THREE.Texture) {
      value.dispose()
    }
  }
  mat.dispose()
}

function fitCameraToMeshes(
  meshes: THREE.Mesh[],
  camera: THREE.PerspectiveCamera,
  upAxis: 'y' | 'z',
): void {
  const box = new THREE.Box3()
  meshes.forEach((m) => {
    m.updateWorldMatrix(true, false)
    box.expandByObject(m)
  })

  const center = new THREE.Vector3()
  box.getCenter(center)
  const size = new THREE.Vector3()
  box.getSize(size)
  const maxDim = Math.max(size.x, size.y, size.z, 0.01)

  const dist = maxDim * 1.8

  // Keep X offset = 0 so the world X-axis stays horizontal in thumbnails.
  // camera.right = lookDir × up must equal +X for the X-axis to be right.
  //
  // Z-up derivation (up=(0,0,1)): right = lookDir × (0,0,1)
  //   For right.x > 0, lookDir.y must be > 0 → camera.y < target.y → camY < 0
  //   → camera at (0, -0.6·dist, dist), right = (0.6, 0, 0) = +X ✓
  //
  // Y-up derivation (up=(0,1,0)): right = lookDir × (0,1,0)
  //   For right.x > 0, lookDir.z must be < 0 → camera.z > target.z → camZ > 0
  //   → camera at (0, dist, 0.6·dist), right = (0.6, 0, 0) = +X ✓
  const camPos = new THREE.Vector3(
    0,
    upAxis === 'y' ? dist : -dist * 0.6,     // Y: zenith for Y-up, front (-Y) for Z-up
    upAxis === 'y' ? dist * 0.6 : dist,       // Z: front (+Z) for Y-up, zenith for Z-up
  )
  camPos.add(center)

  camera.position.copy(camPos)
  camera.lookAt(center)

  if (upAxis === 'z') {
    camera.up.set(0, 0, 1)
  } else {
    camera.up.set(0, 1, 0)
  }

  camera.near = maxDim * 0.001
  camera.far = maxDim * 10
  camera.updateProjectionMatrix()
}

/**
 * Generate thumbnail from already-parsed meshes/objects.
 * Called as a byproduct of canvas loading — no re-parse, no file I/O.
 */
export async function generateThumbnailFromResult(
  meshes: THREE.Mesh[],
  objects: THREE.Object3D[],
  upAxis: 'y' | 'z',
): Promise<Blob | null> {
  const r = getRenderer()
  const scene = new THREE.Scene()
  setupLighting(scene)

  const camera = new THREE.PerspectiveCamera(45, WIDTH / HEIGHT)

  try {
    const allObjects: THREE.Object3D[] = [...meshes, ...objects]
    if (allObjects.length === 0) {
      disposeScene(scene)
      return null
    }

    const group = new THREE.Group()
    for (const obj of allObjects) {
      // Defensive: if the object's scene-graph state is corrupt (e.g. stale
      // parent refs leaving undefined entries in children), clone() may throw.
      // Skip the problematic object rather than failing the entire thumbnail.
      try {
        group.add(obj.clone())
      } catch (e) {
        console.warn('[thumbnailGenerator] clone failed for object, skipping:', e)
      }
    }
    scene.add(group)

    // Apply user's default material to meshes that lack source materials.
    // Formats like STL and .model produce meshes with MeshBasicMaterial
    // (Three.js auto-assigned fallback) — replace those with the user's
    // chosen default so thumbnails match the viewport appearance.
    const defaultAppearance = useMaterialStore.getState().defaultMaterial
    if (defaultAppearance) {
      const defaultMat = getSharedMaterialFactory().createMaterial(defaultAppearance)
      group.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshBasicMaterial) {
          obj.material = defaultMat
        }
      })
    }

    const allMeshes: THREE.Mesh[] = []
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) allMeshes.push(obj)
    })

    if (allMeshes.length > 0) {
      fitCameraToMeshes(allMeshes, camera, upAxis)
    } else {
      camera.position.set(0, 0, 5)
      camera.lookAt(0, 0, 0)
    }

    await waitForTextures(group)
    r.render(scene, camera)

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas!.toBlob((b) => resolve(b), 'image/png')
    })

    disposeScene(scene)
    return blob
  } catch (err) {
    console.warn('[thumbnailGenerator] failed from result:', err)
    disposeScene(scene)
    return null
  }
}

export async function generateThumbnail(
  buffer: ArrayBuffer,
  format: FormatId,
): Promise<Blob | null> {
  try {
    const result = await loadFormat(buffer, format)
    const upAxis = getDefaultUpAxis(format, buffer)
    return generateThumbnailFromResult(result.meshes, result.objects, upAxis)
  } catch (err) {
    console.warn('[thumbnailGenerator] failed for format', format, err)
    return null
  }
}

export function disposeThumbnailRenderer(): void {
  if (renderer) {
    renderer.dispose()
    renderer = null
  }
  if (canvas && canvas.parentNode) {
    canvas.parentNode.removeChild(canvas)
  }
  canvas = null
}

/**
 * Try to inject a viewBox attribute into an SVG string when it is missing.
 * Handles several edge cases:
 *  - SVGs with width/height but no viewBox → infer viewBox from width/height
 *  - SVGs with non-px units (mm, pt, cm) → strip units and use numeric values
 *  - SVGs with no dimensional attributes at all → use a conservative default
 *
 * Returns the original string unchanged if a viewBox is already present.
 */
function injectViewBox(svgText: string): string {
  if (/\bviewBox\s*=\s*["']/i.test(svgText)) return svgText

  const wMatch = svgText.match(/\bwidth\s*=\s*["'](\d+(?:\.\d+)?)\s*(?:px|mm|pt|cm|em|in)?["']/i)
  const hMatch = svgText.match(/\bheight\s*=\s*["'](\d+(?:\.\d+)?)\s*(?:px|mm|pt|cm|em|in)?["']/i)
  if (wMatch && hMatch) {
    const w = parseFloat(wMatch[1])
    const h = parseFloat(hMatch[1])
    if (w > 0 && h > 0) {
      return svgText.replace(/<svg\b/i, `<svg viewBox="0 0 ${w} ${h}"`)
    }
  }

  // Last resort for SVGs that have no dimensional info at all
  return svgText.replace(/<svg\b/i, '<svg viewBox="0 0 300 150"')
}

/** Maximum allowed intrinsic dimension for an SVG. Values beyond this are
 *  clamped to avoid excessive memory use when drawing to canvas. */
const SVG_MAX_DIM = 10000

/**
 * Generate a thumbnail for an SVG file using pure Canvas 2D (no WebGL/Three.js).
 *
 * Uses the same 200×150 (4:3) canvas size as 3D thumbnails so that all file
 * thumbnails have a consistent aspect ratio in the preview grid.
 *
 * Compatibility: SVGs without a viewBox attribute are fixed up-front by
 * injecting one derived from width/height.  This is critical because the
 * browser does NOT raise an error for viewBox-less SVGs — it simply clips
 * content to the declared width×height viewport, causing "显示不全".
 */
export async function generateSvgThumbnail(svgText: string): Promise<Blob | null> {
  // Use the same W×H as 3D thumbnails for a consistent look in the preview grid
  const W = WIDTH   // 200
  const H = HEIGHT  // 150
  const PAD = 12

  // Inject viewBox BEFORE the first load attempt — not just on error.
  // SVGs without viewBox load "successfully" but get clipped by the
  // browser's SVG viewport, so we must fix them proactively.
  const text = injectViewBox(svgText)

  return new Promise((resolve) => {
    const img = new Image()
    const blob = new Blob([text], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)

    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = W
      canvas.height = H
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        URL.revokeObjectURL(url)
        resolve(null)
        return
      }

      // Background
      ctx.fillStyle = '#f0f0f3'
      ctx.fillRect(0, 0, W, H)

      // Prefer naturalWidth/Height (the rendered pixel dimensions); fall back
      // to .width/.height (which may reflect the DOM attribute).  Both can be
      // zero for SVGs without viewBox or with percentage dimensions.
      let imgW = img.naturalWidth || img.width || 0
      let imgH = img.naturalHeight || img.height || 0

      // Guard: zero-size SVGs (no viewBox + no width/height, or 100% dims)
      if (imgW <= 0 || imgH <= 0) {
        imgW = W
        imgH = H
      }

      // Clamp extremely large coordinate spaces to avoid memory pressure
      if (imgW > SVG_MAX_DIM || imgH > SVG_MAX_DIM) {
        const s = Math.min(SVG_MAX_DIM / imgW, SVG_MAX_DIM / imgH)
        imgW = Math.round(imgW * s)
        imgH = Math.round(imgH * s)
      }

      // Scale to fit within the padded box, preserving aspect ratio
      const maxW = W - PAD * 2
      const maxH = H - PAD * 2
      const scale = Math.min(maxW / imgW, maxH / imgH)

      const drawW = imgW * scale
      const drawH = imgH * scale
      const x = (W - drawW) / 2
      const y = (H - drawH) / 2

      // White mat behind SVG
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.roundRect(x - 2, y - 2, drawW + 4, drawH + 4, 3)
      ctx.fill()

      ctx.drawImage(img, x, y, drawW, drawH)
      canvas.toBlob((b) => resolve(b), 'image/png')
      URL.revokeObjectURL(url)
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }

    img.src = url
  })
}
