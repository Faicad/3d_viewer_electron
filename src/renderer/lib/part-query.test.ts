import { describe, it, expect, beforeEach } from 'vitest'
import * as THREE from 'three'
import { useModelStore } from '@/stores/model-store'
import { useSelectionStore } from '@/stores/selection-store'
import { useMaterialStore } from '@/stores/material-store'
import type { LoadedFileModel, GlbPartInfo } from '@/stores/model-store'
import type { MaterialAppearance } from '@/engine/material/types'
import { queryParts } from '@/lib/part-query'

// ---------------------------------------------------------------------------
// RobotExpressive.glb — test fixture data
//
// The actual RobotExpressive.glb has 14 meshes across 3 materials:
//   Grey  (index 0):  baseColor=[0.374,0.371,0.335], metalness=0.1, roughness=0.9
//   Main  (index 1):  baseColor=[0.590,0.291,0.038], metalness=0.1, roughness=0.9
//   Black (index 2):  baseColor=[0.046,0.046,0.046], metalness=0.1, roughness=0.9
// ---------------------------------------------------------------------------

interface PartDef {
  partId: string
  name: string
  triangleCount: number
  materialIndex: number
}

const ROBOT_PARTS: PartDef[] = [
  // Grey (material index 0) — 6 parts
  { partId: 'Foot.L',     name: 'Foot.L', triangleCount: 120, materialIndex: 0 },
  { partId: 'Torso_Grey',  name: 'Torso',  triangleCount: 250, materialIndex: 0 },
  { partId: 'Head_Grey',   name: 'Head',   triangleCount: 100, materialIndex: 0 },
  { partId: 'Foot.R',     name: 'Foot.R', triangleCount: 120, materialIndex: 0 },
  { partId: 'Hand.R_Grey', name: 'Hand.R', triangleCount:  40, materialIndex: 0 },
  { partId: 'Hand.L_Grey', name: 'Hand.L', triangleCount:  40, materialIndex: 0 },

  // Main / orange (material index 1) — 12 parts
  { partId: 'Torso_Main',  name: 'Torso',      triangleCount: 350, materialIndex: 1 },
  { partId: 'Head_Main',   name: 'Head',       triangleCount:  80, materialIndex: 1 },
  { partId: 'Shoulder.L',  name: 'Shoulder.L', triangleCount:  60, materialIndex: 1 },
  { partId: 'Arm.L',       name: 'Arm.L',      triangleCount:  90, materialIndex: 1 },
  { partId: 'Shoulder.R',  name: 'Shoulder.R', triangleCount:  60, materialIndex: 1 },
  { partId: 'Arm.R',       name: 'Arm.R',      triangleCount:  90, materialIndex: 1 },
  { partId: 'Leg.L',       name: 'Leg.L',      triangleCount: 140, materialIndex: 1 },
  { partId: 'LowerLeg.L',  name: 'LowerLeg.L', triangleCount: 110, materialIndex: 1 },
  { partId: 'Leg.R',       name: 'Leg.R',      triangleCount: 140, materialIndex: 1 },
  { partId: 'LowerLeg.R',  name: 'LowerLeg.R', triangleCount: 110, materialIndex: 1 },
  { partId: 'Hand.R_Main', name: 'Hand.R',     triangleCount:  35, materialIndex: 1 },
  { partId: 'Hand.L_Main', name: 'Hand.L',     triangleCount:  35, materialIndex: 1 },

  // Black (material index 2) — 1 part
  { partId: 'Head_Black',  name: 'Head', triangleCount: 25, materialIndex: 2 },
]

const GREY_APPEARANCE: MaterialAppearance = {
  name: 'Grey',
  color: [0.374, 0.371, 0.335, 1],
  metalness: 0.1,
  roughness: 0.9,
}

const MAIN_APPEARANCE: MaterialAppearance = {
  name: 'Main',
  color: [0.590, 0.291, 0.038, 1],
  metalness: 0.1,
  roughness: 0.9,
}

const BLACK_APPEARANCE: MaterialAppearance = {
  name: 'Black',
  color: [0.046, 0.046, 0.046, 1],
  metalness: 0.1,
  roughness: 0.9,
}

const FILE_ID = 'robot'

function buildGlbPartInfos(parts: PartDef[]): GlbPartInfo[] {
  return parts.map((p, i) => ({
    partId: p.partId,
    name: p.name,
    meshIndex: i,
    triangleCount: p.triangleCount,
    materialIndex: p.materialIndex,
  }))
}

function loadRobotIntoStore() {
  const file: LoadedFileModel = {
    id: FILE_ID,
    fileName: 'RobotExpressive.glb',
    filePath: '/fixtures/RobotExpressive.glb',
    buffer: new ArrayBuffer(0),
    format: 'glb',
    sceneTree: [],
    glbPartInfos: buildGlbPartInfos(ROBOT_PARTS),
    modelCenteringOffset: null,
    sourceUnit: 'meter',
    fileGroup: 'mesh',
    loadingPhase: 'done',
  }
  useModelStore.getState().addLoadedFile(file)

  const originals: Record<string, MaterialAppearance> = {}
  for (const p of ROBOT_PARTS) {
    const app =
      p.materialIndex === 0 ? GREY_APPEARANCE
        : p.materialIndex === 1 ? MAIN_APPEARANCE
          : BLACK_APPEARANCE
    originals[p.partId] = app
  }
  useMaterialStore.getState().setMaterialOriginalsForFile(FILE_ID, originals)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('queryParts', () => {
  beforeEach(() => {
    useModelStore.getState().reset()
    useSelectionStore.getState().clearSelection()
    useMaterialStore.getState().clearAllOverrides()
  })

  // ---- no model loaded ----

  describe('no model loaded', () => {
    it('returns empty array when no active file', () => {
      const result = queryParts({ name: 'Foot.L' })
      expect(result).toEqual([])
    })
  })

  // ---- name regex ----

  describe('by name regex', () => {
    beforeEach(() => {
      loadRobotIntoStore()
    })

    it('matches all parts starting with "Foot"', () => {
      const result = queryParts({ name: '^Foot' })
      expect(result).toHaveLength(2)
      expect(result.map((r) => r.partId).sort()).toEqual(['Foot.L', 'Foot.R'])
    })

    it('matches all right-side parts (ending with .R)', () => {
      const result = queryParts({ name: '\\.R$' })
      const expected = ['Foot.R', 'Shoulder.R', 'Arm.R', 'Leg.R', 'LowerLeg.R', 'Hand.R_Main', 'Hand.R_Grey']
      expect(result).toHaveLength(expected.length)
      expect(result.map((r) => r.partId).sort()).toEqual(expected.sort())
    })

    it('matches left-side parts (ending with .L)', () => {
      const result = queryParts({ name: '\\.L$' })
      const expected = ['Foot.L', 'Shoulder.L', 'Arm.L', 'Leg.L', 'LowerLeg.L', 'Hand.L_Main', 'Hand.L_Grey']
      expect(result).toHaveLength(expected.length)
      expect(result.map((r) => r.partId).sort()).toEqual(expected.sort())
    })

    it('matches all Head parts (3 primitives)', () => {
      const result = queryParts({ name: '^Head$' })
      expect(result).toHaveLength(3)
      expect(result.map((r) => r.partId).sort()).toEqual(['Head_Black', 'Head_Grey', 'Head_Main'])
    })

    it('returns empty array when no name matches', () => {
      const result = queryParts({ name: 'zzz_nonexistent' })
      expect(result).toEqual([])
    })

    it('throws on invalid regex', () => {
      expect(() => queryParts({ name: '[invalid' })).toThrow('Invalid regex')
    })
  })

  // ---- materialIndex ----

  describe('by materialIndex', () => {
    beforeEach(() => {
      loadRobotIntoStore()
    })

    it('matches all Grey material parts (index 0)', () => {
      const result = queryParts({ materialIndex: 0 })
      expect(result).toHaveLength(6)
      for (const r of result) {
        expect(r.info.materialIndex).toBe(0)
      }
    })

    it('matches all Main material parts (index 1)', () => {
      const result = queryParts({ materialIndex: 1 })
      expect(result).toHaveLength(12)
      for (const r of result) {
        expect(r.info.materialIndex).toBe(1)
      }
    })

    it('matches Black material part (index 2)', () => {
      const result = queryParts({ materialIndex: 2 })
      expect(result).toHaveLength(1)
      expect(result[0].partId).toBe('Head_Black')
    })

    it('matches multiple material indices', () => {
      const result = queryParts({ materialIndex: [0, 2] })
      for (const r of result) {
        expect([0, 2]).toContain(r.info.materialIndex)
      }
      expect(result).toHaveLength(7)
    })
  })

  // ---- triangleCount ----

  describe('by triangleCount range', () => {
    beforeEach(() => {
      loadRobotIntoStore()
    })

    it('matches parts with triangle count between 100 and 150', () => {
      const result = queryParts({ triangleCount: { min: 100, max: 150 } })
      const expected = ['Foot.L', 'Foot.R', 'Head_Grey', 'Leg.L', 'Leg.R', 'LowerLeg.L', 'LowerLeg.R']
      expect(result).toHaveLength(expected.length)
      expect(result.map((r) => r.partId).sort()).toEqual(expected.sort())
    })

    it('matches parts with triangle count >= 200', () => {
      const result = queryParts({ triangleCount: { min: 200 } })
      expect(result).toHaveLength(2)
      for (const r of result) {
        expect(r.info.triangleCount).toBeGreaterThanOrEqual(200)
      }
    })

    it('matches parts with triangle count <= 50', () => {
      const result = queryParts({ triangleCount: { max: 50 } })
      const expected = ['Hand.R_Grey', 'Hand.L_Grey', 'Hand.R_Main', 'Hand.L_Main', 'Head_Black']
      expect(result).toHaveLength(expected.length)
      for (const r of result) {
        expect(r.info.triangleCount).toBeLessThanOrEqual(50)
      }
    })
  })

  // ---- metalness ----

  describe('by metalness', () => {
    beforeEach(() => {
      loadRobotIntoStore()
    })

    it('matches parts where metalness == 0.1', () => {
      const result = queryParts({ metalness: { value: 0.1 } })
      expect(result).toHaveLength(ROBOT_PARTS.length)
    })

    it('matches parts where metalness != 1', () => {
      const result = queryParts({ metalness: { value: 1, op: 'neq' } })
      expect(result).toHaveLength(ROBOT_PARTS.length)
    })

    it('returns empty when metalness > 0.5', () => {
      const result = queryParts({ metalness: { value: 0.5, op: 'gt' } })
      expect(result).toEqual([])
    })

    it('returns empty when metalness < 0.05', () => {
      const result = queryParts({ metalness: { value: 0.05, op: 'lt' } })
      expect(result).toEqual([])
    })

    it('matches parts where metalness >= 0.1', () => {
      const result = queryParts({ metalness: { value: 0.1, op: 'gte' } })
      expect(result).toHaveLength(ROBOT_PARTS.length)
    })

    it('matches parts where metalness <= 0.1', () => {
      const result = queryParts({ metalness: { value: 0.1, op: 'lte' } })
      expect(result).toHaveLength(ROBOT_PARTS.length)
    })
  })

  // ---- roughness ----

  describe('by roughness', () => {
    beforeEach(() => {
      loadRobotIntoStore()
    })

    it('matches parts where roughness == 0.9', () => {
      const result = queryParts({ roughness: { value: 0.9 } })
      expect(result).toHaveLength(ROBOT_PARTS.length)
    })

    it('matches parts where roughness > 0.5', () => {
      const result = queryParts({ roughness: { value: 0.5, op: 'gt' } })
      expect(result).toHaveLength(ROBOT_PARTS.length)
    })

    it('returns empty when roughness < 0.5', () => {
      const result = queryParts({ roughness: { value: 0.5, op: 'lt' } })
      expect(result).toEqual([])
    })
  })

  // ---- color ----

  describe('by color', () => {
    beforeEach(() => {
      loadRobotIntoStore()
    })

    // Grey:  rgb(95, 95, 85)   → #5f5f55
    // Main:  rgb(151, 74, 10)  → #974a0a
    // Black: rgb(12, 12, 12)   → #0c0c0c

    it('matches Grey parts via rgb with hex string', () => {
      const result = queryParts({ color: { rgb: '#5f5f55', tolerance: 5 } })
      expect(result).toHaveLength(6)
      for (const r of result) {
        expect(r.info.materialIndex).toBe(0)
      }
    })

    it('matches Main (orange) parts via rgb with hex string', () => {
      const result = queryParts({ color: { rgb: '#974a0a', tolerance: 5 } })
      expect(result).toHaveLength(12)
      for (const r of result) {
        expect(r.info.materialIndex).toBe(1)
      }
    })

    it('matches Black part via rgb with hex string', () => {
      const result = queryParts({ color: { rgb: '#0c0c0c', tolerance: 3 } })
      expect(result).toHaveLength(1)
      expect(result[0].partId).toBe('Head_Black')
    })

    it('matches Grey parts by RGB array', () => {
      const result = queryParts({ color: { rgb: [95, 95, 85], tolerance: 5 } })
      expect(result).toHaveLength(6)
    })

    it('matches Main parts by RGBA tuple', () => {
      const result = queryParts({ color: { rgb: [151, 74, 10, 255], tolerance: 5 } })
      expect(result).toHaveLength(12)
    })

    it('matches Grey parts by RGB object', () => {
      const result = queryParts({ color: { rgb: { r: 95, g: 95, b: 85 }, tolerance: 5 } })
      expect(result).toHaveLength(6)
    })

    it('matches Main parts by RGB object with alpha', () => {
      const result = queryParts({ color: { rgb: { r: 151, g: 74, b: 10, a: 255 }, tolerance: 5 } })
      expect(result).toHaveLength(12)
    })

    it('matches Grey parts by css rgb() string', () => {
      const result = queryParts({ color: { rgb: 'rgb(95,95,85)', tolerance: 5 } })
      expect(result).toHaveLength(6)
    })

    it('matches Main parts by css rgba() string', () => {
      const result = queryParts({ color: { rgb: 'rgba(151,74,10,1)', tolerance: 5 } })
      expect(result).toHaveLength(12)
    })

    it('matches Grey parts by plain comma-separated string', () => {
      const result = queryParts({ color: { rgb: '95,95,85', tolerance: 5 } })
      expect(result).toHaveLength(6)
    })

    it('matches Grey parts by hex string via rgb field', () => {
      const result = queryParts({ color: { rgb: '#5f5f55', tolerance: 5 } })
      expect(result).toHaveLength(6)
    })

    it('matches Main parts by hex string without hash via rgb field', () => {
      const result = queryParts({ color: { rgb: '974a0a', tolerance: 5 } })
      expect(result).toHaveLength(12)
    })

    it('matches Black part by name with tolerance', () => {
      const result = queryParts({ color: { name: 'black', tolerance: 15 } })
      expect(result).toHaveLength(1)
      expect(result[0].partId).toBe('Head_Black')
    })

    it('matches nothing when named color does not match', () => {
      const result = queryParts({ color: { name: 'red', tolerance: 5 } })
      expect(result).toEqual([])
    })

    it('returns empty when color does not match (rgb)', () => {
      const result = queryParts({ color: { rgb: '#ff0000', tolerance: 0 } })
      expect(result).toEqual([])
    })
  })

  // ---- combined conditions (AND) ----

  describe('combined conditions (AND)', () => {
    beforeEach(() => {
      loadRobotIntoStore()
    })

    it('name regex + materialIndex', () => {
      const result = queryParts({ name: '^Head$', materialIndex: 1 })
      expect(result).toHaveLength(1)
      expect(result[0].partId).toBe('Head_Main')
    })

    it('name regex + metalness', () => {
      const result = queryParts({ name: '\\.L$', metalness: { value: 0.1 } })
      const expected = ['Foot.L', 'Shoulder.L', 'Arm.L', 'Leg.L', 'LowerLeg.L', 'Hand.L_Main', 'Hand.L_Grey']
      expect(result).toHaveLength(expected.length)
    })

    it('materialIndex + triangleCount', () => {
      const result = queryParts({ materialIndex: 1, triangleCount: { max: 99 } })
      const expected = ['Head_Main', 'Shoulder.L', 'Arm.L', 'Shoulder.R', 'Arm.R', 'Hand.R_Main', 'Hand.L_Main']
      expect(result).toHaveLength(expected.length)
    })

    it('color + name regex', () => {
      const result = queryParts({
        color: { rgb: '#5f5f55', tolerance: 5 },
        name: '^Hand',
      })
      expect(result).toHaveLength(2)
      expect(result.map((r) => r.partId).sort()).toEqual(['Hand.L_Grey', 'Hand.R_Grey'])
    })
  })

  // ---- query across different files ----

  describe('query by fileId option', () => {
    beforeEach(() => {
      loadRobotIntoStore()
    })

    it('queries the specified file when fileId is given', () => {
      const result = queryParts({ name: '^Foot' }, { fileId: FILE_ID })
      expect(result).toHaveLength(2)
    })

    it('returns empty for unknown fileId', () => {
      const result = queryParts({ name: '^Foot' }, { fileId: 'nonexistent' })
      expect(result).toEqual([])
    })

    it('queries active file when no fileId given', () => {
      expect(useModelStore.getState().activeFileId).toBe(FILE_ID)
      const result = queryParts({ name: '^Foot' })
      expect(result).toHaveLength(2)
    })
  })

  // ---- override does not affect query ----

  describe('material override does not affect query', () => {
    beforeEach(() => {
      loadRobotIntoStore()
    })

    it('still matches by original color after setting an override', () => {
      useMaterialStore.getState().setMaterialOverride(FILE_ID, 'Foot.L', {
        name: 'Red',
        color: [1, 0, 0, 1],
        metalness: 0.5,
        roughness: 0.2,
      })

      const result = queryParts({ color: { rgb: '#5f5f55', tolerance: 5 } })
      expect(result.find((r) => r.partId === 'Foot.L')).toBeDefined()
    })

    it('still matches by original metalness after setting an override', () => {
      useMaterialStore.getState().setMaterialOverride(FILE_ID, 'Foot.L', {
        name: 'Red',
        color: [1, 0, 0, 1],
        metalness: 0.5,
        roughness: 0.2,
      })

      const result = queryParts({ metalness: { value: 0.1 } })
      expect(result.find((r) => r.partId === 'Foot.L')).toBeDefined()
    })
  })

  // ---- fallback to meshLookup when materialOriginals missing ----

  describe('fallback to meshLookup', () => {
    beforeEach(() => {
      const file: LoadedFileModel = {
        id: FILE_ID,
        fileName: 'RobotExpressive.glb',
        filePath: '/fixtures/RobotExpressive.glb',
        buffer: new ArrayBuffer(0),
        format: 'glb',
        sceneTree: [],
        glbPartInfos: buildGlbPartInfos(ROBOT_PARTS),
        modelCenteringOffset: null,
        sourceUnit: 'meter',
        fileGroup: 'mesh',
        loadingPhase: 'done',
      }
      useModelStore.getState().addLoadedFile(file)
    })

    it('reads metalness from Three.js material via meshLookup', () => {
      useMaterialStore.getState().registerMeshLookup(FILE_ID, (partId: string) => {
        const part = ROBOT_PARTS.find((p) => p.partId === partId)
        if (!part) return undefined
        const mat = new THREE.MeshPhysicalMaterial({
          color: part.materialIndex === 0 ? 0x5f5f55
            : part.materialIndex === 1 ? 0x974a0a
              : 0x0c0c0c,
          metalness: 0.1,
          roughness: 0.9,
        })
        return {
          mesh: new THREE.Mesh(new THREE.BoxGeometry(), mat),
          originalMaterial: mat,
          name: part.name,
        }
      })

      const result = queryParts({ metalness: { value: 0.1 } })
      expect(result).toHaveLength(ROBOT_PARTS.length)
    })

    it('reads color from Three.js material via meshLookup', () => {
      useMaterialStore.getState().registerMeshLookup(FILE_ID, (partId: string) => {
        const part = ROBOT_PARTS.find((p) => p.partId === partId)
        if (!part) return undefined
        const mat = new THREE.MeshPhysicalMaterial({
          color: part.materialIndex === 0 ? 0x5f5f55
            : part.materialIndex === 1 ? 0x974a0a
              : 0x0c0c0c,
          metalness: 0.1,
          roughness: 0.9,
        })
        return {
          mesh: new THREE.Mesh(new THREE.BoxGeometry(), mat),
          originalMaterial: mat,
          name: part.name,
        }
      })

      const result = queryParts({ color: { rgb: '#974a0a', tolerance: 5 } })
      expect(result).toHaveLength(12)
    })
  })

  // ---- empty / edge cases ----

  describe('edge cases', () => {
    it('returns empty array when file has no parts', () => {
      useModelStore.getState().addLoadedFile({
        id: 'empty',
        fileName: 'empty.glb',
        filePath: '/fixtures/empty.glb',
        buffer: new ArrayBuffer(0),
        format: 'glb',
        sceneTree: [],
        glbPartInfos: [],
        modelCenteringOffset: null,
        sourceUnit: 'meter',
        fileGroup: 'mesh',
        loadingPhase: 'done',
      })
      const result = queryParts({ name: '.*' })
      expect(result).toEqual([])
    })

    it('empty filter matches all parts', () => {
      loadRobotIntoStore()
      const result = queryParts({})
      expect(result).toHaveLength(ROBOT_PARTS.length)
    })

    it('empty fileId option falls back to activeFileId', () => {
      loadRobotIntoStore()
      const result = queryParts({}, { fileId: undefined as unknown as string })
      expect(result).toHaveLength(ROBOT_PARTS.length)
    })
  })
})
