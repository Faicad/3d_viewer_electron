import { useModelStore } from '@/stores/model-store'
import { useMaterialStore } from '@/stores/material-store'
import type { GlbPartInfo } from '@/stores/model-store'
import type { MaterialAppearance } from '@/engine/material/types'
import * as THREE from 'three'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NumberMatch {
  value: number
  op?: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
}

export interface RangeMatch {
  min?: number
  max?: number
}

export interface ColorMatch {
  rgb?:
    | [number, number, number]
    | [number, number, number, number]
    | { r: number; g: number; b: number; a?: number }
    | string
  name?: string
  tolerance?: number
}

export interface PartQuery {
  name?: string
  color?: ColorMatch
  metalness?: NumberMatch
  roughness?: NumberMatch
  materialIndex?: number | number[]
  triangleCount?: RangeMatch
  extruder?: number
  plateId?: number
}

export interface QueryResult {
  fileId: string
  partId: string
  partName: string
  info: GlbPartInfo
}

// ---------------------------------------------------------------------------
// Matching helpers
// ---------------------------------------------------------------------------

function matchNumber(value: number, match: NumberMatch): boolean {
  const op = match.op ?? 'eq'
  switch (op) {
    case 'eq':   return Math.abs(value - match.value) < 1e-6
    case 'neq':  return Math.abs(value - match.value) >= 1e-6
    case 'gt':   return value > match.value
    case 'gte':  return value >= match.value
    case 'lt':   return value < match.value
    case 'lte':  return value <= match.value
  }
}

const NAMED_COLORS: Record<string, [number, number, number]> = {
  black:   [0, 0, 0],
  white:   [255, 255, 255],
  red:     [255, 0, 0],
  green:   [0, 128, 0],
  blue:    [0, 0, 255],
  yellow:  [255, 255, 0],
  cyan:    [0, 255, 255],
  magenta: [255, 0, 255],
  grey:    [128, 128, 128],
  gray:    [128, 128, 128],
  orange:  [255, 165, 0],
  brown:   [165, 42, 42],
  pink:    [255, 192, 203],
  purple:  [128, 0, 128],
  navy:    [0, 0, 128],
}

function parseRgbString(s: string): [number, number, number] {
  if (/^#?[0-9a-f]{3,8}$/i.test(s.replace(/\s/g, ''))) {
    const hex = s.replace('#', '').trim()
    if (hex.length === 3) {
      return [
        parseInt(hex[0] + hex[0], 16),
        parseInt(hex[1] + hex[1], 16),
        parseInt(hex[2] + hex[2], 16),
      ]
    }
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ]
  }

  const cleaned = s.replace(/^rgba?\(|\)$/g, '').trim()
  const parts = cleaned.split(',').map((v) => parseFloat(v.trim()))
  return [parts[0], parts[1], parts[2]]
}

function matchColor(
  color: [number, number, number, number],
  match: ColorMatch,
): boolean {
  const [r, g, b] = [color[0], color[1], color[2]].map((v) => Math.round(v * 255))
  const tolerance = match.tolerance ?? 0

  if (match.name !== undefined) {
    const named = NAMED_COLORS[match.name.toLowerCase()]
    if (!named) return false
    return (
      Math.abs(r - named[0]) <= tolerance &&
      Math.abs(g - named[1]) <= tolerance &&
      Math.abs(b - named[2]) <= tolerance
    )
  }

  if (match.rgb !== undefined) {
    let mr: number, mg: number, mb: number
    if (typeof match.rgb === 'string') {
      ;[mr, mg, mb] = parseRgbString(match.rgb)
    } else if (Array.isArray(match.rgb)) {
      mr = match.rgb[0]
      mg = match.rgb[1]
      mb = match.rgb[2]
    } else {
      mr = match.rgb.r
      mg = match.rgb.g
      mb = match.rgb.b
    }
    return (
      Math.abs(r - mr) <= tolerance &&
      Math.abs(g - mg) <= tolerance &&
      Math.abs(b - mb) <= tolerance
    )
  }

  return false
}

// ---------------------------------------------------------------------------
// queryParts
// ---------------------------------------------------------------------------

export function queryParts(
  filter: PartQuery,
  options?: { fileId?: string },
): QueryResult[] {
  const ms = useModelStore.getState()
  const mat = useMaterialStore.getState()

  const fileId = options?.fileId ?? ms.activeFileId
  if (!fileId) return []

  const file = ms.loadedFiles.find((f) => f.id === fileId)
  if (!file || file.glbPartInfos.length === 0) return []

  return file.glbPartInfos.reduce<QueryResult[]>((acc, info) => {
    // -- GlbPartInfo fields --

    if (filter.name !== undefined) {
      try {
        if (!new RegExp(filter.name).test(info.name)) return acc
      } catch {
        throw new Error(`Invalid regex: ${filter.name}`)
      }
    }

    if (filter.materialIndex !== undefined) {
      const targets = Array.isArray(filter.materialIndex)
        ? filter.materialIndex
        : [filter.materialIndex]
      if (!targets.includes(info.materialIndex)) return acc
    }

    if (filter.triangleCount !== undefined) {
      const { min, max } = filter.triangleCount
      if (min !== undefined && info.triangleCount < min) return acc
      if (max !== undefined && info.triangleCount > max) return acc
    }

    if (filter.extruder !== undefined && info.extruder !== filter.extruder) return acc
    if (filter.plateId !== undefined && info.plateId !== filter.plateId) return acc

    // -- MaterialAppearance fields --
    const key = `${fileId}:${info.partId}`
    let appearance: MaterialAppearance | undefined = mat.materialOriginals[key]

    if (!appearance) {
      const lookup = mat.meshLookups[fileId]
      if (lookup) {
        const entry = lookup(info.partId)
        if (entry?.originalMaterial) {
          const mat3 = Array.isArray(entry.originalMaterial)
            ? entry.originalMaterial[0]
            : entry.originalMaterial
          if (mat3 instanceof THREE.Material) {
            appearance = {
              name: info.name,
              color: [mat3.color.r, mat3.color.g, mat3.color.b, 1],
              metalness:
                'metalness' in mat3
                  ? (mat3 as THREE.MeshStandardMaterial).metalness
                  : undefined,
              roughness:
                'roughness' in mat3
                  ? (mat3 as THREE.MeshStandardMaterial).roughness
                  : undefined,
            }
          }
        }
      }
    }

    if (filter.color !== undefined) {
      if (!appearance?.color) return acc
      if (!matchColor(appearance.color, filter.color)) return acc
    }

    if (filter.metalness !== undefined) {
      if (appearance?.metalness === undefined) return acc
      if (!matchNumber(appearance.metalness, filter.metalness)) return acc
    }

    if (filter.roughness !== undefined) {
      if (appearance?.roughness === undefined) return acc
      if (!matchNumber(appearance.roughness, filter.roughness)) return acc
    }

    acc.push({ fileId, partId: info.partId, partName: info.name, info })
    return acc
  }, [])
}
