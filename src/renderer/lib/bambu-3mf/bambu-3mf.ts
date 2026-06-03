import { unzipSync } from 'three/examples/jsm/libs/fflate.module.js'

const KNOWN_EXTENSIONS = new Set([
  'stl', 'step', 'stp', 'obj', '3mf', 'glb', 'gltf',
  'ply', 'fbx', 'dae', '3ds', 'usdz', 'wrl', 'amf',
])

/** Remove a known 3D file extension from a filename.
 *  Handles both simple names ("screw holder.stl" → "screw holder")
 *  and multi-part suffixes ("vise body.stl_1" → "vise body_1"). */
export function stripExtension(name: string): string {
  const extPattern = Array.from(KNOWN_EXTENSIONS).join('|')

  // "basename.stl_1" → "basename_1"
  const multiRe = new RegExp(
    `^(.+)\\.(?:${extPattern})_(\\d+)$`, 'i',
  )
  const multiMatch = name.match(multiRe)
  if (multiMatch) return `${multiMatch[1]}_${multiMatch[2]}`

  // "basename.stl" → "basename"
  const singleRe = new RegExp(
    `^(.+)\\.(?:${extPattern})$`, 'i',
  )
  const singleMatch = name.match(singleRe)
  if (singleMatch) return singleMatch[1]

  return name
}

/** Metadata for a 3MF object (from model_settings.config `<object>`). */
export interface BambuObjectMeta {
  objectId: string
  name: string
  extruder: number
  plateId: number
}

/** A single flat part — the atomic unit that ThreeMFLoader outputs as one Mesh. */
export interface BambuPartMeta {
  partIndex: number
  objectId: string
  partId: string
  name: string
  extruder: number
  plateId: number
}

export interface BambuPlateSize {
  width: number
  depth: number
  height: number
}

export interface BambuPlateInfo {
  plateId: number
  plateName: string
  size?: BambuPlateSize
}

export interface BambuModelMeta {
  title?: string
  designer?: string
  description?: string
  license?: string
}

export interface Bambu3mfMetadata {
  filamentColors: string[]
  filamentTypes: string[]
  objects: Map<string, BambuObjectMeta>
  /** Flat part list indexed 0..N-1, ordered to match ThreeMFLoader's flattened output. */
  parts: BambuPartMeta[]
  plates: Map<number, BambuPlateInfo>
  /** Model-level metadata from 3D/3dmodel.model <metadata> tags. */
  modelMeta?: BambuModelMeta
  /** All raw <metadata name="..."> entries from 3D/3dmodel.model, in document order. */
  metadataEntries: Array<{ name: string; value: string }>
  /** Extracted standard 3MF thumbnail PNG blob, if found in the ZIP. */
  thumbnailBlob?: Blob
  /** Assembly item transforms (keyed by objectId). */
  assembleTransforms?: Map<string, AssembleItemTransform>
  /** Part import transforms (keyed by "objectId:partId"). */
  importTransforms?: Map<string, PartImportTransform>
  /** Build items from 3D/3dmodel.model, for transform reference. */
  buildItems?: BuildItem[]
}

export interface BuildItem {
  objectId: string
  transform: number[] | null
}

/** Assembly item transform from model_settings.config `<assemble_item>`. */
export interface AssembleItemTransform {
  objectId: string
  /** 12-value 4×3 matrix (same format as build <item transform>). */
  transform: number[]
  /** Additional fine-tune translation [tx, ty, tz]. */
  offset: [number, number, number]
}

/** Part-level import transform from model_settings.config `<part>` metadata. */
export interface PartImportTransform {
  objectId: string
  partId: string
  /** 16-value 4×4 matrix (row-major). */
  matrix: number[]
  /** Additional import translation offset. */
  sourceOffset: [number, number, number]
}

/** Parse `<build>` section object IDs and transforms from 3D/3dmodel.model XML. */
export function parse3mfBuild(xml: string): BuildItem[] {
  const items: BuildItem[] = []
  const itemRe = /<item\s+objectid="(\d+)"[^>]*\/?>/g
  let m: RegExpExecArray | null
  while ((m = itemRe.exec(xml)) !== null) {
    const objectId = m[1]
    const transformMatch = m[0].match(/transform="([^"]*)"/)
    const transform = transformMatch
      ? transformMatch[1].split(/\s+/).map(Number)
      : null
    items.push({ objectId, transform })
  }
  return items
}

/**
 * Parse model-level <metadata> tags from 3D/3dmodel.model XML.
 * These use <metadata name="...">value</metadata> format (3MF standard),
 * distinct from Bambu's <metadata key="..." value="..."/> format.
 *
 * Returns both the structured BambuModelMeta (known fields) and
 * all raw entries for display in the metadata panel.
 */
export function parseModelMeta(xml: string): {
  modelMeta: BambuModelMeta
  metadataEntries: Array<{ name: string; value: string }>
} {
  const meta: BambuModelMeta = {}
  const entries: Array<{ name: string; value: string }> = []
  const re = /<metadata\s+name="([^"]*)"[^>]*>([\s\S]*?)<\/metadata>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    const name = m[1]
    const value = m[2].trim()
    entries.push({ name, value })
    if (name === 'Title') meta.title = value
    else if (name === 'Designer') meta.designer = value
    else if (name === 'Description') meta.description = value
    else if (name === 'License') meta.license = value
  }
  return { modelMeta: Object.keys(meta).length > 0 ? meta : undefined, metadataEntries: entries }
}

/**
 * Extract a standard 3MF thumbnail PNG from the unzipped ZIP entries.
 *
 * Checks known paths in priority order:
 *   1. MetaData/thumbnail.png       (ISO 3MF standard)
 *   2. Auxiliaries/.thumbnails/thumbnail_3mf.png
 *   3. Auxiliaries/.thumbnails/thumbnail_middle.png
 *   4. Auxiliaries/.thumbnails/thumbnail_small.png
 *
 * Returns the first found, or undefined if none exist.
 */
export function extractThumbnailBlob(
  unzipped: Record<string, Uint8Array>,
): Blob | undefined {
  const candidates = [
    'MetaData/thumbnail.png',
    'Auxiliaries/.thumbnails/thumbnail_3mf.png',
    'Auxiliaries/.thumbnails/thumbnail_middle.png',
    'Auxiliaries/.thumbnails/thumbnail_small.png',
  ]

  // Also search case-insensitively for MetaData/thumbnail.png
  const keys = Object.keys(unzipped)
  for (const path of candidates) {
    const entry = keys.find(k => k === path)
    if (entry) {
      return new Blob([unzipped[entry]], { type: 'image/png' })
    }
  }

  // Fallback: case-insensitive match for /thumbnail.png under MetaData/
  const metaDataEntry = keys.find(
    k => /^metadata\/thumbnail\.png$/i.test(k),
  )
  if (metaDataEntry) {
    return new Blob([unzipped[metaDataEntry]], { type: 'image/png' })
  }

  return undefined
}

/**
 * Parse Bambu Lab 3MF metadata from a raw `.3mf` ArrayBuffer.
 *
 * Extracts:
 * - Filament colors / types from `project_settings.config`
 * - Object + part metadata (name, extruder) and plate layout from `model_settings.config`
 * - Build-item order from `3D/3dmodel.model` for correct part indexing
 * - Model-level metadata (title, designer, description, license) from 3D/3dmodel.model
 * - Standard 3MF thumbnail from the ZIP
 *
 * The returned `parts` array is flat (0..N-1), ordered to match the flattened
 * mesh output of ThreeMFLoader: build items first, then components within each.
 * Part names have known 3D file extensions stripped (e.g. "vise body.stl" → "vise body").
 */
export function parseBambu3mf(buffer: ArrayBuffer): Bambu3mfMetadata {
  const data = new Uint8Array(buffer)
  const unzipped = unzipSync(data)
  const decoder = new TextDecoder()

  const filamentColors: string[] = []
  const filamentTypes: string[] = []
  const objects = new Map<string, BambuObjectMeta>()
  const plates = new Map<number, BambuPlateInfo>()

  // ---- 1. project_settings.config (JSON) ----
  const projFile = Object.keys(unzipped).find(f =>
    f.endsWith('project_settings.config'),
  )
  let bedSize: BambuPlateSize | undefined
  if (projFile) {
    try {
      const json = JSON.parse(decoder.decode(unzipped[projFile]))
      const rawColors = json.filament_colour ?? json.filament_color ?? []
      const cArr = Array.isArray(rawColors) ? rawColors : [rawColors]
      for (const c of cArr) {
        filamentColors.push(
          typeof c === 'string' ? c.replace(/^"(.*)"$/, '$1').trim() : String(c),
        )
      }
      const fTypes = json.filament_type ?? []
      if (Array.isArray(fTypes)) {
        for (const t of fTypes) {
          filamentTypes.push(typeof t === 'string' ? t : String(t))
        }
      }

      // Plate/bed dimensions from printable_area polygon + printable_height
      if (json.printable_area) {
        const area = Array.isArray(json.printable_area) ? json.printable_area : [json.printable_area]
        let maxX = 0
        let maxY = 0
        for (const pt of area) {
          const parts = String(pt).split('x')
          if (parts.length === 2) {
            const x = parseFloat(parts[0])
            const y = parseFloat(parts[1])
            if (Number.isFinite(x) && x > maxX) maxX = x
            if (Number.isFinite(y) && y > maxY) maxY = y
          }
        }
        const height = parseFloat(String(json.printable_height ?? '0'))
        if (maxX > 0 && maxY > 0 && Number.isFinite(height) && height > 0) {
          bedSize = { width: maxX, depth: maxY, height }
        }
      }
    } catch {
      /* ignore parse errors */
    }
  }

  // ---- 2. model_settings.config (XML) — collect per-object & per-part data ----
  // Store part info per objectId → [{partId, name, extruder}]
  const objectParts = new Map<string, { partId: string; name: string; extruder: number }[]>()

  const assembleTransforms = new Map<string, AssembleItemTransform>()
  const importTransforms = new Map<string, PartImportTransform>()

  const msFile = Object.keys(unzipped).find(f =>
    f.endsWith('model_settings.config'),
  )
  if (msFile) {
    const xml = decoder.decode(unzipped[msFile])

    // ---- 2a. <object> blocks ----
    const objBlockRe = /<object\s+id="(\d+)"[^>]*>([\s\S]*?)<\/object>/gi
    let objMatch: RegExpExecArray | null
    while ((objMatch = objBlockRe.exec(xml)) !== null) {
      const oid = objMatch[1]
      const body = objMatch[2]

      // Object-level metadata (strip <part> to keep only direct <object> children)
      const topLevel = body.replace(/<part[^>]*>[\s\S]*?<\/part>/gi, '')
      let objName = ''
      let objExtruder = 1

      const metaRe = /<metadata\s+key="([^"]*)"\s+value="([^"]*)"\s*\/?>/gi
      let mm: RegExpExecArray | null
      while ((mm = metaRe.exec(topLevel)) !== null) {
        if (mm[1] === 'name') objName = mm[2]
        if (mm[1] === 'extruder') objExtruder = parseInt(mm[2], 10) || 1
      }

      objects.set(oid, { objectId: oid, name: objName, extruder: objExtruder, plateId: 0 })

      // ---- 2b. <part> children ----
      const partList: { partId: string; name: string; extruder: number }[] = []
      const partBlockRe = /<part\s+id="(\d+)"[^>]*>([\s\S]*?)<\/part>/gi
      let pm: RegExpExecArray | null
      while ((pm = partBlockRe.exec(body)) !== null) {
        const pid = pm[1]
        const partBody = pm[2]

        let partName = objName
        let partExtruder = objExtruder

        const pmRe = /<metadata\s+key="([^"]*)"\s+value="([^"]*)"\s*\/?>/gi
        let pmm: RegExpExecArray | null
        while ((pmm = pmRe.exec(partBody)) !== null) {
          if (pmm[1] === 'name') partName = pmm[2]
          if (pmm[1] === 'extruder') partExtruder = parseInt(pmm[2], 10) || objExtruder
        }

        partList.push({ partId: pid, name: partName, extruder: partExtruder })
      }

      // If no <part> children found, create one implicit part from object metadata
      if (partList.length === 0) {
        partList.push({ partId: '0', name: objName, extruder: objExtruder })
      }

      objectParts.set(oid, partList)
    }

    // ---- 2c. <plate> blocks → plate-level assignments ----
    const plateBlockRe = /<plate>([\s\S]*?)<\/plate>/gi
    let plateMatch: RegExpExecArray | null
    while ((plateMatch = plateBlockRe.exec(xml)) !== null) {
      const plateBody = plateMatch[1]

      let platerId = 0
      let platerName = ''

      const pmRe2 = /<metadata\s+key="([^"]*)"\s+value="([^"]*)"\s*\/?>/gi
      let m2: RegExpExecArray | null
      while ((m2 = pmRe2.exec(plateBody)) !== null) {
        if (m2[1] === 'plater_id') platerId = parseInt(m2[2], 10) || 0
        if (m2[1] === 'plater_name') platerName = m2[2]
      }

      if (platerId > 0) {
        plates.set(platerId, { plateId: platerId, plateName: platerName, size: bedSize })
      }

      const instRe = /<model_instance>([\s\S]*?)<\/model_instance>/gi
      let im: RegExpExecArray | null
      while ((im = instRe.exec(plateBody)) !== null) {
        const instBody = im[1]
        const oidMatch = /<metadata\s+key="object_id"\s+value="(\d+)"\s*\/?>/i.exec(instBody)
        if (oidMatch) {
          const refOid = oidMatch[1]
          const obj = objects.get(refOid)
          if (obj) obj.plateId = platerId
        }
      }
    }

    // ---- 2d. <assemble> block → assembly transforms ----
    const assembleBlockRe = /<assemble>([\s\S]*?)<\/assemble>/i
    const assembleBlockMatch = xml.match(assembleBlockRe)
    if (assembleBlockMatch) {
      const assembleBody = assembleBlockMatch[1]
      const assembleItemRe = /<assemble_item\s+([^>]*)\/?>/gi
      let am: RegExpExecArray | null
      while ((am = assembleItemRe.exec(assembleBody)) !== null) {
        const attrs = am[1]
        const oidMatch = /object_id="(\d+)"/.exec(attrs)
        const xformMatch = /transform="([^"]*)"/.exec(attrs)
        const offsetMatch = /offset="([^"]*)"/.exec(attrs)
        const oid = oidMatch?.[1]
        if (oid && xformMatch) {
          const xform = xformMatch[1].split(/\s+/).map(Number)
          const offsetArr = offsetMatch
            ? offsetMatch[1].split(/\s+/).map(Number)
            : [0, 0, 0]
          if (xform.length === 12 && offsetArr.length === 3) {
            assembleTransforms.set(oid, {
              objectId: oid,
              transform: xform,
              offset: offsetArr as [number, number, number],
            })
          }
        }
      }
    }

    // ---- 2e. <part> matrix metadata (per-part import transforms) ----
    const importObjBlockRe = /<object\s+id="(\d+)"[^>]*>([\s\S]*?)<\/object>/gi
    let importObjMatch: RegExpExecArray | null
    while ((importObjMatch = importObjBlockRe.exec(xml)) !== null) {
      const oid = importObjMatch[1]
      const body = importObjMatch[2]
      const importPartRe = /<part\s+id="(\d+)"[^>]*>([\s\S]*?)<\/part>/gi
      let ipm: RegExpExecArray | null
      while ((ipm = importPartRe.exec(body)) !== null) {
        const pid = ipm[1]
        const partBody = ipm[2]
        let matrix: number[] | undefined
        let sox = 0, soy = 0, soz = 0
        const imRe = /<metadata\s+key="([^"]*)"\s+value="([^"]*)"\s*\/?>/gi
        let imm: RegExpExecArray | null
        while ((imm = imRe.exec(partBody)) !== null) {
          if (imm[1] === 'matrix') matrix = imm[2].split(/\s+/).map(Number)
          if (imm[1] === 'source_offset_x') sox = parseFloat(imm[2]) || 0
          if (imm[1] === 'source_offset_y') soy = parseFloat(imm[2]) || 0
          if (imm[1] === 'source_offset_z') soz = parseFloat(imm[2]) || 0
        }
        if (matrix && matrix.length === 16) {
          importTransforms.set(`${oid}:${pid}`, {
            objectId: oid,
            partId: pid,
            matrix,
            sourceOffset: [sox, soy, soz],
          })
        }
      }
    }
  }

  // ---- 3. Model-level metadata + build items from 3D/3dmodel.model ----
  let modelMeta: BambuModelMeta | undefined
  let metadataEntries: Array<{ name: string; value: string }> = []
  const thumbnailBlob: Blob | undefined = extractThumbnailBlob(unzipped)
  let buildItems: BuildItem[] = []

  const modelFile = Object.keys(unzipped).find(
    f => f.endsWith('/3dmodel.model') || f === '3D/3dmodel.model',
  )
  if (modelFile) {
    const modelXml = decoder.decode(unzipped[modelFile])

    // 3a. Model-level metadata
    const parsed = parseModelMeta(modelXml)
    modelMeta = parsed.modelMeta
    metadataEntries = parsed.metadataEntries

    // 3b. Build items for ordering
    buildItems = parse3mfBuild(modelXml)
  }

  // ---- 4. Build ordered flat parts list ----
  // The order must match ThreeMFLoader: iterate build items, then for each
  // object emit its parts in <part id> order.
  // Part names have known 3D file extensions stripped.
  const parts: BambuPartMeta[] = []
  let partIndex = 0

  for (const item of buildItems) {
    const oid = item.objectId
    const objMeta = objects.get(oid)
    const partList = objectParts.get(oid) ?? []

    for (const p of partList) {
      parts.push({
        partIndex: partIndex++,
        objectId: oid,
        partId: p.partId,
        name: stripExtension(p.name),
        extruder: p.extruder,
        plateId: objMeta?.plateId ?? 0,
      })
    }
  }

  return {
    filamentColors,
    filamentTypes,
    objects,
    parts,
    plates,
    modelMeta,
    metadataEntries,
    thumbnailBlob,
    assembleTransforms: assembleTransforms.size > 0 ? assembleTransforms : undefined,
    importTransforms: importTransforms.size > 0 ? importTransforms : undefined,
    buildItems: buildItems.length > 0 ? buildItems : undefined,
  }
}
