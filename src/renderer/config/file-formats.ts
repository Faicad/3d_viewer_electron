// 29 种格式的全部配置，含每个格式的扩展名、Loader、分组、样例文件路径
// Data: verified against three.js examples/models/ and examples/jsm/loaders/

export type FileGroup =
  | 'mesh'
  | 'cad'
  | 'bim'
  | 'point'
  | 'volume'
  | 'animation'
  | 'gcode'
  | 'vector'
  | 'other'
  | 'environment'

export type UnitSystem =
  | 'millimeter'
  | 'centimeter'
  | 'meter'
  | 'inch'
  | 'foot'
  | 'micron'
  | 'angstrom'

export type FormatId =
  | 'stl'
  | 'glb'
  | 'gltf'
  | '3mf'
  | 'model'
  | 'step'
  | 'obj'
  | 'ply'
  | 'fbx'
  | 'dae'
  | '3ds'
  | 'usdz'
  | 'drc'
  | 'bvh'
  | 'vtk'
  | 'xyz'
  | 'pdb'
  | 'nrrd'
  | 'gcode'
  | 'wrl'
  | 'vox'
  | 'kmz'
  | 'amf'
  | 'lwo'
  | 'md2'
  | 'mdd'
  | 'pcd'
  | 'ifc'
  | '3dm'
  | 'svg'
  | 'dxf'
  | 'hdr'
  | 'exr'

export interface FileFormatEntry {
  id: FormatId
  /** Display label for UI */
  label: string
  /** File extensions including dot (e.g. ['.stl']) */
  extensions: string[]
  /** Which three.js loader module to lazy-import */
  loaderModule: string
  /** Category grouping */
  group: FileGroup
  /** Sample file relative path under three.js examples/models/ */
  sampleFile: string
  /** Whether the loader expects decoded text (true) or binary ArrayBuffer (false) */
  textBased: boolean
  /** Whether the loader needs DRACOLoader WASM */
  needsDracoWasm: boolean
  /** Whether this format needs an external npm package not bundled with three.js */
  needsExternalDep: boolean
  /** Whether this format uses a render hint (e.g. volume, skeleton, toolpath) */
  renderHint: 'mesh' | 'volume' | 'skeleton' | 'toolpath' | 'pointcloud' | 'svg' | 'environment'
  /** Whether this format is disabled (not in accept list, can't be loaded) */
  disabled?: boolean
  /** Whether to exclude from ALL_EXTENSIONS / "All Supported Formats" filter.
   *  Used for SVG — user must explicitly pick the format category to open. */
  excludeFromAll?: boolean
  /** Tailwind color class for file extension badge */
  color: string
  /** Default unit system for this format (used when file carries no unit metadata) */
  defaultUnit: UnitSystem
}

export const FILE_FORMATS: FileFormatEntry[] = [
  // ---- 1-4: Already supported ----
  {
    id: 'stl',
    label: 'STL',
    extensions: ['.stl'],
    loaderModule: 'STLLoader.js',
    group: 'mesh',
    sampleFile: 'stl/...',
    textBased: false,
    needsDracoWasm: false,
    needsExternalDep: false,
    renderHint: 'mesh',
    defaultUnit: 'millimeter',
    color: 'text-blue-500',
  },
  {
    id: 'glb',
    label: 'GLB',
    extensions: ['.glb'],
    loaderModule: 'GLTFLoader.js',
    group: 'mesh',
    sampleFile: 'gltf/LeePerrySmith/LeePerrySmith.glb',
    textBased: false,
    needsDracoWasm: false,
    needsExternalDep: false,
    renderHint: 'mesh',
    defaultUnit: 'meter',
    color: 'text-green-500',
  },
  {
    id: 'gltf',
    label: 'GLTF',
    extensions: ['.gltf'],
    loaderModule: 'GLTFLoader.js',
    group: 'mesh',
    sampleFile: 'gltf/AnimatedMorphSphere/glTF/AnimatedMorphSphere.gltf',
    textBased: false,
    needsDracoWasm: false,
    needsExternalDep: false,
    renderHint: 'mesh',
    defaultUnit: 'meter',
    color: 'text-green-400',
  },
  {
    id: '3mf',
    label: '3MF',
    extensions: ['.3mf'],
    loaderModule: '3MFLoader.js',
    group: 'mesh',
    sampleFile: '3mf/...',
    textBased: false,
    needsDracoWasm: false,
    needsExternalDep: false,
    renderHint: 'mesh',
    defaultUnit: 'millimeter',
    color: 'text-orange-500',
  },
  {
    id: 'model',
    label: '3MF Model',
    extensions: ['.model'],
    loaderModule: '',
    group: 'other',
    sampleFile: '',
    textBased: true,
    needsDracoWasm: false,
    needsExternalDep: false,
    renderHint: 'mesh',
    defaultUnit: 'millimeter',
    color: 'text-orange-300',
  },
  {
    id: 'step',
    label: 'STEP',
    extensions: ['.step', '.stp'],
    loaderModule: '', // special: converted via occt-import-js.wasm
    group: 'cad',
    sampleFile: 'step/...',
    textBased: false,
    needsDracoWasm: false,
    needsExternalDep: false,
    renderHint: 'mesh',
    defaultUnit: 'millimeter',
    color: 'text-purple-500',
  },
  // ---- 5-29: New formats ----
  {
    id: 'obj',
    label: 'OBJ',
    extensions: ['.obj'],
    loaderModule: 'OBJLoader.js',
    group: 'mesh',
    sampleFile: 'obj/cerberus/Cerberus.obj',
    textBased: true,
    needsDracoWasm: false,
    needsExternalDep: false,
    renderHint: 'mesh',
    defaultUnit: 'millimeter',
    color: 'text-cyan-500',
  },
  {
    id: 'ply',
    label: 'PLY',
    extensions: ['.ply'],
    loaderModule: 'PLYLoader.js',
    group: 'mesh',
    sampleFile: 'ply/binary/dolphins_be.ply',
    textBased: false,
    needsDracoWasm: false,
    needsExternalDep: false,
    renderHint: 'mesh',
    defaultUnit: 'millimeter',
    color: 'text-teal-500',
  },
  {
    id: 'fbx',
    label: 'FBX',
    extensions: ['.fbx'],
    loaderModule: 'FBXLoader.js',
    group: 'mesh',
    sampleFile: 'fbx/mixamo.fbx',
    textBased: false,
    needsDracoWasm: false,
    needsExternalDep: false,
    renderHint: 'mesh',
    defaultUnit: 'centimeter',
    color: 'text-indigo-500',
  },
  {
    id: 'dae',
    label: 'Collada',
    extensions: ['.dae'],
    loaderModule: 'ColladaLoader.js',
    group: 'mesh',
    sampleFile: 'collada/elf/elf.dae',
    textBased: true,
    needsDracoWasm: false,
    needsExternalDep: false,
    renderHint: 'mesh',
    defaultUnit: 'meter',
    color: 'text-rose-500',
  },
  {
    id: '3ds',
    label: '3DS',
    extensions: ['.3ds'],
    loaderModule: 'TDSLoader.js',
    group: 'mesh',
    sampleFile: '3ds/portalgun/portalgun.3ds',
    textBased: false,
    needsDracoWasm: false,
    needsExternalDep: false,
    renderHint: 'mesh',
    defaultUnit: 'millimeter',
    color: 'text-amber-500',
  },
  {
    id: 'usdz',
    label: 'USDZ',
    extensions: ['.usdz'],
    loaderModule: 'USDZLoader.js',
    group: 'mesh',
    sampleFile: 'usdz/saeukkang.usdz',
    textBased: false,
    needsDracoWasm: false,
    needsExternalDep: false,
    renderHint: 'mesh',
    defaultUnit: 'meter',
    color: 'text-sky-500',
  },
  {
    id: 'drc',
    label: 'Draco',
    extensions: ['.drc'],
    loaderModule: 'DRACOLoader.js',
    group: 'mesh',
    sampleFile: 'draco/bunny.drc',
    textBased: false,
    needsDracoWasm: true,
    needsExternalDep: false,
    renderHint: 'mesh',
    defaultUnit: 'millimeter',
    color: 'text-lime-500',
  },
  {
    id: 'bvh',
    label: 'BVH',
    extensions: ['.bvh'],
    loaderModule: 'BVHLoader.js',
    group: 'animation',
    sampleFile: 'bvh/pirouette.bvh',
    textBased: true,
    needsDracoWasm: false,
    needsExternalDep: false,
    renderHint: 'skeleton',
    defaultUnit: 'millimeter',
    color: 'text-pink-500',
  },
  {
    id: 'vtk',
    label: 'VTK',
    extensions: ['.vtk', '.vtp'],
    loaderModule: 'VTKLoader.js',
    group: 'volume',
    sampleFile: 'vtk/bunny.vtk',
    textBased: false,
    needsDracoWasm: false,
    needsExternalDep: false,
    renderHint: 'mesh',
    defaultUnit: 'millimeter',
    color: 'text-violet-500',
  },
  {
    id: 'xyz',
    label: 'XYZ',
    extensions: ['.xyz'],
    loaderModule: 'XYZLoader.js',
    group: 'point',
    sampleFile: 'xyz/helix_201.xyz',
    textBased: true,
    needsDracoWasm: false,
    needsExternalDep: false,
    renderHint: 'pointcloud',
    defaultUnit: 'millimeter',
    color: 'text-fuchsia-500',
  },
  {
    id: 'pdb',
    label: 'PDB',
    extensions: ['.pdb'],
    loaderModule: 'PDBLoader.js',
    group: 'point',
    sampleFile: 'pdb/Al2O3.pdb',
    textBased: true,
    needsDracoWasm: false,
    needsExternalDep: false,
    renderHint: 'pointcloud',
    defaultUnit: 'angstrom',
    color: 'text-red-500',
  },
  {
    id: 'nrrd',
    label: 'NRRD',
    extensions: ['.nrrd'],
    loaderModule: 'NRRDLoader.js',
    group: 'volume',
    sampleFile: 'nrrd/I.nrrd',
    textBased: false,
    needsDracoWasm: false,
    needsExternalDep: false,
    renderHint: 'volume',
    defaultUnit: 'micron',
    color: 'text-blue-400',
  },
  {
    id: 'gcode',
    label: 'GCode',
    extensions: ['.gcode'],
    loaderModule: 'GCodeLoader.js',
    group: 'gcode',
    sampleFile: 'gcode/benchy.gcode',
    textBased: true,
    needsDracoWasm: false,
    needsExternalDep: false,
    renderHint: 'toolpath',
    defaultUnit: 'millimeter',
    color: 'text-emerald-500',
  },
  {
    id: 'wrl',
    label: 'VRML',
    extensions: ['.wrl'],
    loaderModule: 'VRMLLoader.js',
    group: 'other',
    sampleFile: 'vrml/camera.wrl',
    textBased: true,
    needsDracoWasm: false,
    needsExternalDep: false,
    renderHint: 'mesh',
    defaultUnit: 'meter',
    color: 'text-yellow-500',
  },
  {
    id: 'vox',
    label: 'VOX',
    extensions: ['.vox'],
    loaderModule: 'VOXLoader.js',
    group: 'other',
    sampleFile: 'vox/menger.vox',
    textBased: false,
    needsDracoWasm: false,
    needsExternalDep: false,
    renderHint: 'mesh',
    defaultUnit: 'millimeter',
    color: 'text-orange-400',
  },
  {
    id: 'kmz',
    label: 'KMZ',
    extensions: ['.kmz'],
    loaderModule: 'KMZLoader.js',
    group: 'other',
    sampleFile: 'kmz/Box.kmz',
    textBased: false,
    needsDracoWasm: false,
    needsExternalDep: false,
    renderHint: 'mesh',
    defaultUnit: 'meter',
    color: 'text-green-600',
  },
  {
    id: 'amf',
    label: 'AMF',
    extensions: ['.amf'],
    loaderModule: 'AMFLoader.js',
    group: 'mesh',
    sampleFile: 'amf/rook.amf',
    textBased: false, // AMFLoader needs raw ArrayBuffer to detect ZIP vs XML
    needsDracoWasm: false,
    needsExternalDep: false,
    renderHint: 'mesh',
    defaultUnit: 'millimeter',
    color: 'text-blue-300',
  },
  {
    id: 'lwo',
    label: 'LWO',
    extensions: ['.lwo'],
    loaderModule: 'LWOLoader.js',
    group: 'mesh',
    sampleFile: 'lwo/Objects/LWO3/Demo.lwo',
    textBased: false,
    needsDracoWasm: false,
    needsExternalDep: false,
    renderHint: 'mesh',
    defaultUnit: 'millimeter',
    color: 'text-stone-500',
  },
  {
    id: 'md2',
    label: 'MD2',
    extensions: ['.md2'],
    loaderModule: 'MD2Loader.js',
    group: 'animation',
    sampleFile: 'md2/ogro/ogro.md2',
    textBased: false,
    needsDracoWasm: false,
    needsExternalDep: false,
    renderHint: 'mesh',
    defaultUnit: 'millimeter',
    color: 'text-red-400',
  },
  {
    id: 'mdd',
    label: 'MDD',
    extensions: ['.mdd'],
    loaderModule: 'MDDLoader.js',
    group: 'animation',
    sampleFile: 'mdd/cube.mdd',
    textBased: false,
    needsDracoWasm: false,
    needsExternalDep: false,
    disabled: true, // morph data only, no standalone mesh to render
    renderHint: 'mesh',
    defaultUnit: 'millimeter',
    color: 'text-orange-300',
  },
  {
    id: 'pcd',
    label: 'PCD',
    extensions: ['.pcd'],
    loaderModule: 'PCDLoader.js',
    group: 'point',
    sampleFile: 'pcd/ascii/simple.pcd',
    textBased: false,
    needsDracoWasm: false,
    needsExternalDep: false,
    renderHint: 'pointcloud',
    defaultUnit: 'millimeter',
    color: 'text-slate-400',
  },
  {
    id: 'ifc',
    label: 'IFC',
    extensions: ['.ifc'],
    loaderModule: 'IFCLoader.js',
    group: 'bim',
    sampleFile: 'ifc/rac_advanced_sample_project.ifc',
    textBased: false,
    needsDracoWasm: false,
    needsExternalDep: true,
    disabled: true, // needs npm install web-ifc-three web-ifc
    renderHint: 'mesh',
    defaultUnit: 'millimeter',
    color: 'text-yellow-600',
  },
  {
    id: '3dm',
    label: '3DM',
    extensions: ['.3dm'],
    loaderModule: '3DMLoader.js',
    group: 'mesh',
    sampleFile: '3dm/Rhino_Logo.3dm',
    textBased: false,
    needsDracoWasm: false,
    needsExternalDep: false,
    renderHint: 'mesh',
    defaultUnit: 'millimeter',
    color: 'text-gray-400',
  },
  {
    id: 'svg',
    label: 'SVG',
    extensions: ['.svg'],
    loaderModule: '',
    group: 'vector',
    sampleFile: '',
    textBased: true,
    needsDracoWasm: false,
    needsExternalDep: false,
    renderHint: 'svg',
    defaultUnit: 'millimeter',
    color: 'text-yellow-400',
  },
  {
    id: 'dxf',
    label: 'DXF',
    extensions: ['.dxf'],
    loaderModule: '',             // no Three.js loader — converted to SVG
    group: 'vector',              // same group as SVG, reuses vector pipeline
    sampleFile: '',
    textBased: true,              // DXF is ASCII text
    needsDracoWasm: false,
    needsExternalDep: true,       // needs @linkiez/dxf-renew
    renderHint: 'svg',            // renders via the SVG workspace
    defaultUnit: 'millimeter',
    color: 'text-orange-400',
  },
  {
    id: 'hdr',
    label: 'HDR',
    extensions: ['.hdr'],
    loaderModule: '',             // no Three.js loader — loaded as environment map
    group: 'environment',
    sampleFile: '',
    textBased: false,
    needsDracoWasm: false,
    needsExternalDep: false,
    renderHint: 'environment',
    defaultUnit: 'millimeter',
    excludeFromAll: true,
    color: 'text-blue-400',
  },
  {
    id: 'exr',
    label: 'EXR',
    extensions: ['.exr'],
    loaderModule: '',             // no Three.js loader — loaded as environment map
    group: 'environment',
    sampleFile: '',
    textBased: false,
    needsDracoWasm: false,
    needsExternalDep: false,
    renderHint: 'environment',
    defaultUnit: 'millimeter',
    excludeFromAll: true,
    color: 'text-purple-400',
  },
]

// ---- derived lookup tables ----

const ENABLED_FORMATS = FILE_FORMATS.filter((f) => !f.disabled)

/** Map from extension (with dot) to FormatId (enabled formats only) */
export const EXT_TO_FORMAT: Record<string, FormatId> = {}
/** All allowed extensions (with dot) for file input accept attribute */
export const ALL_EXTENSIONS: string[] = []
/** All allowed extensions without dots for filter checks */
export const ALL_EXTENSIONS_NO_DOT: string[] = []

for (const fmt of ENABLED_FORMATS) {
  for (const ext of fmt.extensions) {
    EXT_TO_FORMAT[ext] = fmt.id
    ALL_EXTENSIONS.push(ext)
    ALL_EXTENSIONS_NO_DOT.push(ext.slice(1))
  }
}

/** All extensions for 3D model / vector files only (excludes environment maps and other
 *  formats marked excludeFromAll). Used by file dialogs and directory listing. */
export const ALL_MODEL_EXTENSIONS: string[] = []
/** ALL_MODEL_EXTENSIONS without dots */
export const ALL_MODEL_EXTENSIONS_NO_DOT: string[] = []

for (const fmt of ENABLED_FORMATS) {
  if (fmt.excludeFromAll) continue
  for (const ext of fmt.extensions) {
    ALL_MODEL_EXTENSIONS.push(ext)
    ALL_MODEL_EXTENSIONS_NO_DOT.push(ext.slice(1))
  }
}

/** Map from FormatId to FileFormatEntry */
export const FORMAT_MAP: Record<FormatId, FileFormatEntry> = {} as Record<FormatId, FileFormatEntry>
for (const fmt of FILE_FORMATS) {
  FORMAT_MAP[fmt.id] = fmt
}

/** Map from extension (with dot) to color class (all formats for display) */
export const EXT_COLORS: Record<string, string> = {}
for (const fmt of FILE_FORMATS) {
  for (const ext of fmt.extensions) {
    EXT_COLORS[ext] = fmt.color
  }
}

/** Grouped accept string for file input (e.g. for the "Mesh" group) */
export function getGroupAccept(group: FileGroup): string {
  return ENABLED_FORMATS
    .filter((f) => f.group === group)
    .flatMap((f) => f.extensions)
    .join(',')
}

/** All extensions accept string (model/vector formats only, excludes environment maps) */
export const ALL_ACCEPT = ALL_MODEL_EXTENSIONS.join(',')

export type UpAxis = 'y' | 'z'

/** Formats native to Z-up (3D printing / CAD manufacturing). */
const Z_UP_FORMATS: ReadonlySet<FormatId> = new Set([
  '3mf', 'stl', 'amf', 'step',
])

/** Determines the coordinate-system up-axis native to a given file format.
 *  Most formats default to Y-up; only 3D-printing / CAD formats use Z-up.
 *  For GLB, the presence of a STEP_T extension signals Z-up (CAD data);
 *  otherwise GLB defaults to Y-up (standard glTF convention). */
export function getDefaultUpAxis(format: FormatId, buffer?: ArrayBuffer): UpAxis {
  if (format === 'glb') {
    if (buffer && isCadSkillGlb(buffer)) return 'z'
    return 'y'
  }
  if (Z_UP_FORMATS.has(format)) return 'z'
  return 'y'
}

/** Detect if GLB has STEP_T extension */
export function isCadSkillGlb(buffer: ArrayBuffer): boolean {
  try {
    const header = new Uint32Array(buffer.slice(0, 12))
    if (header[0] !== 0x46546C67) return false
    const view = new Uint8Array(buffer)
    const decoder = new TextDecoder()
    const text = decoder.decode(view.slice(0, Math.min(view.length, 2048)))
    return text.includes('STEP_T')
  } catch {
    return false
  }
}

/** Map unit system to display label */
export function sourceUnitToLabel(unit: UnitSystem): string {
  switch (unit) {
    case 'millimeter': return 'mm'
    case 'centimeter': return 'cm'
    case 'meter':      return 'm'
    case 'inch':       return 'in'
    case 'foot':       return 'ft'
    case 'micron':     return 'µm'
    case 'angstrom':   return 'Å'
    default:           return 'mm'
  }
}

/** 1 unit of this system = how many millimeters. Used for heatbed size calculation. */
export const UNIT_TO_MM: Record<UnitSystem, number> = {
  millimeter: 1,
  centimeter: 10,
  meter: 1000,
  inch: 25.4,
  foot: 304.8,
  micron: 0.001,
  angstrom: 0.000_000_1,
}

// ---- Unit detection from file content ----

/**
 * Parse 3MF unit from XML header.
 * 3MF is a ZIP; the first entry is usually "3D/3dmodel.model" (XML).
 * We scan the raw buffer for <model unit="..."> — works on ZIP header
 * without full decompression.
 */
export function parse3mfUnit(buffer: ArrayBuffer): UnitSystem {
  const header = new Uint8Array(buffer.slice(0, 2048))
  const text = new TextDecoder().decode(header)
  const match = text.match(/<model[^>]*\sunit="([^"]+)"/i)
  if (match) {
    const val = match[1].toLowerCase()
    if (['micron', 'millimeter', 'centimeter', 'inch', 'foot', 'meter'].includes(val)) {
      return val as UnitSystem
    }
  }
  return 'millimeter' // 3MF default
}

/**
 * Parse AMF unit from XML header.
 * AMF: <amf unit="..."> — default is millimeter.
 */
export function parseAmfUnit(buffer: ArrayBuffer): UnitSystem {
  const text = new TextDecoder().decode(buffer.slice(0, 2048))
  const match = text.match(/<amf[^>]*\sunit="([^"]+)"/i)
  if (match) {
    const val = match[1].toLowerCase()
    if (['micron', 'millimeter', 'centimeter', 'inch', 'foot', 'meter'].includes(val)) {
      return val as UnitSystem
    }
  }
  return 'millimeter' // AMF default
}

/** Guess STL unit from bounding box volume (heuristic). */
export function guessStlUnit(bbox: { max: { x: number; y: number; z: number }; min: { x: number; y: number; z: number } }): UnitSystem {
  const w = bbox.max.x - bbox.min.x
  const h = bbox.max.y - bbox.min.y
  const d = bbox.max.z - bbox.min.z
  const volume = w * h * d

  if (volume > 0 && volume < 0.008) return 'meter'   // cube root ≈ 0.2 → coords likely in meters
  if (volume > 0 && volume < 8.0)   return 'inch'    // cube root ≈ 2.0 → coords likely in inches
  return 'millimeter'                                  // default
}

/** Detect format from a filename. Returns FormatId or null. Only matches enabled formats. */
export function detectFormat(filename: string): FormatId | null {
  for (const fmt of ENABLED_FORMATS) {
    for (const ext of fmt.extensions) {
      if (filename.toLowerCase().endsWith(ext)) return fmt.id
    }
  }
  return null
}

/** Check if a filename (or format id) refers to the STEP format
 *  (covers both '.step' and '.stp' extensions). */
export function isStepFile(filenameOrFormat: string | null | undefined): boolean {
  if (!filenameOrFormat) return false
  const f = filenameOrFormat.toLowerCase()
  return f.endsWith('.step') || f.endsWith('.stp') || f === 'step' || f === 'stp'
}
