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
import { FORMAT_MAP, type FormatId, type UnitSystem, type UpAxis } from '@/config/file-formats'

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

// ---- unit conversion ----

/**
 * Convert a source unit to a linear scale factor relative to millimeters.
 * Three.js scene uses meters by default; STL/3MF use millimeters.
 */
export function sourceUnitToScaleFactor(unit: UnitSystem): number {
  switch (unit) {
    case 'millimeter': return 1
    case 'centimeter': return 10
    case 'meter':      return 1000
    case 'inch':       return 25.4
    case 'foot':       return 304.8
    case 'micron':     return 0.001
    case 'angstrom':   return 1e-7
    default:           return 1
  }
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
 * Collect all visible meshes from the current R3F scene.
 * Skips invisible, helper/lines/points — only visible Mesh objects are exportable geometry.
 */
export function collectSceneMeshes(scene: THREE.Scene): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = []
  scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.visible && !obj.userData.isHeatbed && !obj.userData.isShadowFloor) {
      meshes.push(obj)
    }
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
    if (obj instanceof THREE.Mesh && obj.visible && !obj.userData.isHeatbed && !obj.userData.isShadowFloor) {
      const partId = obj.userData?.partId as string | undefined
      if (partId && partId.startsWith(prefix)) {
        meshes.push(obj)
      }
    }
  })
  return meshes
}

// ---- GLB export ----

/** Clone a mesh with world transform baked into local transform, with optional scale factor. */
function cloneMeshWithWorldTransform(mesh: THREE.Mesh, scale?: number): THREE.Mesh {
  const clone = mesh.clone()
  mesh.updateWorldMatrix(true, false)
  const s = scale ?? 1
  clone.position.copy(mesh.getWorldPosition(new THREE.Vector3()).multiplyScalar(s))
  clone.quaternion.copy(mesh.getWorldQuaternion(new THREE.Quaternion()))
  clone.scale.copy(mesh.getWorldScale(new THREE.Vector3()).multiplyScalar(s))
  return clone
}

/**
 * Export a collection of meshes to GLB (binary glTF).
 *
 * Clones meshes into a temporary Scene so the exporter doesn't mutate the
 * live rendered objects. Materials are preserved as-is — the caller is
 * responsible for passing meshes that already carry the final (overridden)
 * material.
 */
// ---- axis conversion (Z-up ↔ Y-up) ----

/** Rotation matrix: +90° around X axis — converts Y-up vertex data to Z-up. */
const ROT_X_Y_TO_Z = new THREE.Matrix4().makeRotationX(Math.PI / 2)

/** Rotation matrix: -90° around X axis — converts Z-up vertex data to Y-up. */
const ROT_X_Z_TO_Y = new THREE.Matrix4().makeRotationX(-Math.PI / 2)

/**
 * Apply axis rotation to a single mesh's geometry to match the target up-axis.
 * Only transforms when source and target up-axes differ; same-axis is a no-op.
 */
function convertMeshToTargetUp(
  mesh: THREE.Mesh,
  targetUp: UpAxis,
  sourceUp: UpAxis,
): void {
  if (sourceUp === targetUp) return
  const matrix = sourceUp === 'z' && targetUp === 'y' ? ROT_X_Z_TO_Y : ROT_X_Y_TO_Z
  mesh.geometry.applyMatrix4(matrix)
}

/**
 * Apply axis conversion to a collection of meshes so their vertex data matches
 * the target format's native up-axis.
 *
 * Determines each mesh's source up-axis by extracting the fileId from
 * `mesh.userData.partId` (formatted as `"fileId:partName"`) and looking it up
 * in the provided file list. Meshes that cannot be matched to a file are
 * left unchanged.
 */
function applyAxisConversion(
  meshes: THREE.Mesh[],
  targetUp: UpAxis,
  sourceFiles: LoadedFileModel[],
): void {
  if (sourceFiles.length === 0) return

  const upMap = new Map<string, UpAxis>()
  for (const f of sourceFiles) {
    upMap.set(f.id, f.upAxis ?? 'y')
  }

  for (const mesh of meshes) {
    const partId = mesh.userData?.partId as string | undefined
    if (!partId) continue
    const colonIdx = partId.indexOf(':')
    if (colonIdx === -1) continue
    const fileId = partId.slice(0, colonIdx)
    const sourceUp = upMap.get(fileId)
    if (!sourceUp) continue
    convertMeshToTargetUp(mesh, targetUp, sourceUp)
  }
}

export async function meshesToGlb(
  meshes: THREE.Mesh[],
  animations?: THREE.AnimationClip[],
  sourceFiles?: LoadedFileModel[],
): Promise<ArrayBuffer> {
  const { GLTFExporter } = await import(
    'three/examples/jsm/exporters/GLTFExporter.js'
  )
  const exporter = new GLTFExporter()

  const clones = meshes.map(m => cloneMeshWithWorldTransform(m))
  applyAxisConversion(clones, 'y', sourceFiles ?? [])

  const tmpScene = new THREE.Scene()
  for (const clone of clones) {
    tmpScene.add(clone)
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
  sourceFiles?: LoadedFileModel[],
): Promise<void> {
  const meshes = collectSceneMeshes(scene)
  if (meshes.length === 0) throw new Error('No exportable geometry in scene')
  const glbBuffer = await meshesToGlb(meshes, animations, sourceFiles)
  downloadArrayBuffer(glbBuffer, filename)
}

// ---- STL export ----

/**
 * Export meshes to STL (binary) using the Three.js STLExporter.
 */
export async function meshesToStl(
  meshes: THREE.Mesh[],
  sourceUnit: UnitSystem,
  sourceFiles?: LoadedFileModel[],
): Promise<ArrayBuffer> {
  const { STLExporter } = await import(
    'three/examples/jsm/exporters/STLExporter.js'
  )
  const exporter = new STLExporter()
  const scale = sourceUnitToScaleFactor(sourceUnit)

  const clones = meshes.map(m => cloneMeshWithWorldTransform(m, scale))
  applyAxisConversion(clones, 'z', sourceFiles ?? [])

  const tmpScene = new THREE.Scene()
  for (const clone of clones) {
    tmpScene.add(clone)
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

  const buffer = await meshesToStl(meshes, file.sourceUnit, [file])
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

  const glbBuffer = await meshesToGlb(meshes, file.animations, [file])
  downloadArrayBuffer(glbBuffer, `${file.fileName || 'model'}.glb`)
}

// ---- 3MF export ----

import type { PrintConfig } from './three-mf-exporter'

export type { PrintConfig }

/**
 * Export a collection of meshes to 3MF (binary).
 *
 * Clones meshes into a temporary Scene so the exporter doesn't mutate the
 * live rendered objects. Materials are preserved as color only.
 */
export async function meshesTo3mf(
  meshes: THREE.Mesh[],
  sourceUnit: UnitSystem,
  printConfig?: Partial<PrintConfig>,
  sourceFiles?: LoadedFileModel[],
): Promise<ArrayBuffer> {
  const { exportTo3MF } = await import('./three-mf-exporter')
  const scale = sourceUnitToScaleFactor(sourceUnit)

  const clones = meshes.map(m => cloneMeshWithWorldTransform(m, scale))
  applyAxisConversion(clones, 'z', sourceFiles ?? [])

  const tmpScene = new THREE.Scene()
  for (const clone of clones) {
    tmpScene.add(clone)
  }

  const blob = await exportTo3MF(tmpScene, printConfig)
  return blob.arrayBuffer()
}

/**
 * Export all meshes currently in the R3F scene to 3MF and trigger download.
 */
export async function exportSceneTo3mf(
  scene: THREE.Scene,
  sourceUnit: UnitSystem,
  filename = 'model.3mf',
  printConfig?: Partial<PrintConfig>,
  sourceFiles?: LoadedFileModel[],
): Promise<void> {
  const meshes = collectSceneMeshes(scene)
  if (meshes.length === 0) throw new Error('No exportable geometry in scene')
  const buffer = await meshesTo3mf(meshes, sourceUnit, printConfig, sourceFiles)
  downloadArrayBuffer(buffer, filename)
}

/**
 * Export meshes belonging to a specific file to 3MF and trigger download.
 */
export async function exportFileTo3mf(
  scene: THREE.Scene,
  file: LoadedFileModel,
  printConfig?: Partial<PrintConfig>,
): Promise<void> {
  const meshes = collectFileMeshes(scene, file.id)
  if (meshes.length === 0) throw new Error(`No meshes found for file ${file.fileName}`)
  const buffer = await meshesTo3mf(meshes, file.sourceUnit, printConfig, [file])
  downloadArrayBuffer(buffer, `${file.fileName || 'model'}.3mf`)
}
