/**
 * Model export engine.
 *
 * Rules:
 * - Pure SCAD (sole exportable model) → STL binary (original buffer)
 * - Everything else (any other format, or SCAD+other mixed) → GLB (GLTFExporter)
 *
 * The toolbar Export button auto-detects; the scene-tree right-click menu
 * always offers both STL and GLB for individual files.
 */

import * as THREE from 'three'
import type { LoadedFileModel } from '@/stores/model-store'
import { FORMAT_MAP, type FormatId } from '@/config/file-formats'

// ---- renderHint-based exportability ----

/** Render hints that produce triangulated geometry suitable for export. */
const EXPORTABLE_HINTS = new Set(['mesh', 'skeleton', 'pointcloud'])

/** A file is exportable if its format renderHint can produce mesh data. */
export function isFormatExportable(format: FormatId): boolean {
  return EXPORTABLE_HINTS.has(FORMAT_MAP[format]?.renderHint ?? '')
}

/** Whether any loaded file is exportable. */
export function hasExportableModel(files: LoadedFileModel[]): boolean {
  return files.some(f => isFormatExportable(f.format))
}

/** True when the ONLY exportable model is SCAD (pure SCAD, no mix). */
export function isPureScad(files: LoadedFileModel[]): boolean {
  const exportable = files.filter(f => isFormatExportable(f.format))
  return exportable.length === 1 && exportable[0].format === 'scad'
}

// ---- download helper ----

let downloadLink: HTMLAnchorElement | null = null

function getDownloadLink(): HTMLAnchorElement {
  if (!downloadLink) downloadLink = document.createElement('a')
  return downloadLink
}

/**
 * Trigger a file download. In Electron, uses the native save-file dialog
 * (dialog.showSaveDialog + fs.writeFile) to avoid the Windows Zone.Identifier
 * NTFS alternate data stream that Chromium attaches to browser downloads.
 */
export function downloadArrayBuffer(buffer: ArrayBuffer, filename: string): void {
  const electronAPI =
    typeof window !== 'undefined' ? (window as any).electronAPI : undefined

  if (electronAPI?.saveFile) {
    // Electron native save — no Zone.Identifier ADS
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
    electronAPI.saveFile(btoa(binary), filename)
    return
  }

  // Web fallback: browser download via Blob URL
  const link = getDownloadLink()
  if (link.href) URL.revokeObjectURL(link.href)
  link.href = URL.createObjectURL(
    new Blob([buffer], { type: 'application/octet-stream' }),
  )
  link.download = filename
  link.dispatchEvent(new MouseEvent('click'))
}

// ---- mesh collection from R3F scene ----

/**
 * Collect all exportable meshes from the current R3F scene.
 * Skips helper/lines/points — only Mesh objects are exportable geometry.
 */
export function collectSceneMeshes(scene: THREE.Scene): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = []
  scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh) meshes.push(obj)
  })
  return meshes
}

/**
 * Collect meshes belonging to a specific file from the R3F scene.
 * Matches by `mesh.userData.partId` which is formatted as `fileId:partName`.
 */
export function collectFileMeshes(scene: THREE.Scene, fileId: string): THREE.Mesh[] {
  const prefix = fileId + ':'
  const meshes: THREE.Mesh[] = []
  scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      const partId = obj.userData?.partId as string | undefined
      if (partId && partId.startsWith(prefix)) {
        meshes.push(obj)
      }
    }
  })
  return meshes
}

// ---- GLB export ----

/**
 * Export a collection of meshes to GLB (binary glTF).
 *
 * Clones meshes into a temporary Scene so the exporter doesn't mutate the
 * live rendered objects. Materials are preserved as-is — the caller is
 * responsible for passing meshes that already carry the final (overridden)
 * material.
 */
export async function meshesToGlb(
  meshes: THREE.Mesh[],
  animations?: THREE.AnimationClip[],
): Promise<ArrayBuffer> {
  const { GLTFExporter } = await import(
    'three/examples/jsm/exporters/GLTFExporter.js'
  )
  const exporter = new GLTFExporter()

  const tmpScene = new THREE.Scene()
  for (const mesh of meshes) {
    tmpScene.add(mesh.clone())
  }

  return exporter.parseAsync(tmpScene, {
    binary: true,
    animations: animations ?? [],
  })
}

/**
 * Export all meshes currently in the R3F scene to GLB and trigger download.
 */
export async function exportSceneToGlb(
  scene: THREE.Scene,
  animations?: THREE.AnimationClip[],
  filename = 'model.glb',
): Promise<void> {
  const meshes = collectSceneMeshes(scene)
  if (meshes.length === 0) throw new Error('No exportable geometry in scene')
  const glbBuffer = await meshesToGlb(meshes, animations)
  downloadArrayBuffer(glbBuffer, filename)
}

// ---- STL export ----

/**
 * Export meshes to STL (binary) using the Three.js STLExporter.
 */
export async function meshesToStl(
  meshes: THREE.Mesh[],
): Promise<ArrayBuffer> {
  const { STLExporter } = await import(
    'three/examples/jsm/exporters/STLExporter.js'
  )
  const exporter = new STLExporter()

  const tmpScene = new THREE.Scene()
  for (const mesh of meshes) {
    tmpScene.add(mesh.clone())
  }

  // STLExporter.parse({ binary: true }) returns a DataView (not raw ArrayBuffer).
  // DataView is NOT instanceof ArrayBuffer — need ArrayBuffer.isView() check.
  const raw = exporter.parse(tmpScene, { binary: true })
  if (raw instanceof ArrayBuffer) return raw
  if (ArrayBuffer.isView(raw)) {
    return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)
  }
  // ASCII fallback
  return new TextEncoder().encode(raw as string).buffer
}

/**
 * Export meshes belonging to a specific file to STL and trigger download.
 *
 * For SCAD files the original buffer contains SCAD source code (not STL),
 * so we always use STLExporter from the Three.js scene meshes.
 */
export async function exportFileToStl(
  scene: THREE.Scene,
  file: LoadedFileModel,
): Promise<void> {
  const meshes = collectFileMeshes(scene, file.id)
  if (meshes.length === 0) throw new Error(`No meshes found for file ${file.fileName}`)

  const buffer = await meshesToStl(meshes)
  const filename = `${file.fileName || 'model'}.stl`
  downloadArrayBuffer(buffer, filename)
}

/**
 * Export meshes belonging to a specific file to GLB and trigger download.
 */
export async function exportFileToGlb(
  scene: THREE.Scene,
  file: LoadedFileModel,
): Promise<void> {
  const meshes = collectFileMeshes(scene, file.id)
  if (meshes.length === 0) throw new Error(`No meshes found for file ${file.fileName}`)

  const glbBuffer = await meshesToGlb(meshes, file.animations)
  downloadArrayBuffer(glbBuffer, `${file.fileName || 'model'}.glb`)
}
