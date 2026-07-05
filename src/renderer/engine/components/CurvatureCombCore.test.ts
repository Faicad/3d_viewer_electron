/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  computeEdgeCurvature,
  collectEdgeRows,
  buildCombGeometry,
  computeAutoScale,
} from './CurvatureCombCore'
import type { SelectorRuntime, FaceRow, EdgeRow } from '@/lib/topology/types'

function makeEdgeRuntime(overrides: Partial<SelectorRuntime> = {}): SelectorRuntime {
  const empty: SelectorRuntime = {
    cadPath: '',
    stepHash: '',
    bbox: null,
    occurrences: [],
    shapes: [],
    faces: [],
    edges: [],
    vertices: [],
    references: [],
    referenceMap: new Map(),
    referenceByNormalizedSelector: new Map(),
    referenceByDisplaySelector: new Map(),
    faceReferenceByRowIndex: new Map(),
    edgeReferenceByRowIndex: new Map(),
    vertexReferenceByRowIndex: new Map(),
    occurrenceIdByRowIndex: new Map(),
    faceReferenceMap: new Map(),
    edgeReferenceMap: new Map(),
    vertexReferenceMap: new Map(),
    singleOccurrenceId: '',
    proxy: {
      facePositions: new Float32Array(0),
      faceIndices: new Uint32Array(0),
      faceIds: new Uint32Array(0),
      faceRuns: new Uint32Array(0),
      faceRunColumns: [],
      edgePositions: new Float32Array(0),
      edgeIndices: new Uint32Array(0),
      edgeIds: new Uint32Array(0),
      vertexPositions: new Float32Array(0),
      vertexIds: new Uint32Array(0),
      faceEdgeRows: new Uint32Array(0),
      edgeFaceRows: new Uint32Array(0),
      allPointPositions: new Float32Array(0),
      allPointTypes: new Uint8Array(0),
      allPointRefIndices: new Uint32Array(0),
      vertexPointCount: 0,
      edgeMidCount: 0,
      faceCenterCount: 0,
    },
    ...overrides,
  }
  return empty
}

function buildEdgeProxyData(
  vertexChains: number[][][],
): { edgePositions: Float32Array; edgeIndices: Uint32Array } {
  const allPos: number[] = []
  const allIdx: number[] = []
  for (const chain of vertexChains) {
    const offset = allPos.length / 3
    for (const v of chain) {
      allPos.push(v[0], v[1], v[2])
    }
    for (let i = 0; i < chain.length - 1; i++) {
      allIdx.push(offset + i, offset + i + 1)
    }
  }
  return {
    edgePositions: new Float32Array(allPos),
    edgeIndices: new Uint32Array(allIdx),
  }
}

describe('computeEdgeCurvature', () => {
  it('returns null for empty data', () => {
    const result = computeEdgeCurvature(new Float32Array(0), new Uint32Array(0), 0, 0)
    expect(result).toBeNull()
  })

  it('straight line: curvature is 0', () => {
    const { edgePositions, edgeIndices } = buildEdgeProxyData([[[0, 0, 0], [1, 0, 0], [2, 0, 0]]])
    const result = computeEdgeCurvature(edgePositions, edgeIndices, 0, 2)
    expect(result).not.toBeNull()
    expect(result!.vertexCount).toBe(3)
    expect(result!.curvatures[0]).toBeCloseTo(0, 8)
    expect(result!.curvatures[1]).toBeCloseTo(0, 8)
    expect(result!.curvatures[2]).toBeCloseTo(0, 8)
    expect(result!.normals[3]).toBeCloseTo(0, 8)
    expect(result!.normals[4]).toBeCloseTo(0, 8)
    expect(result!.normals[5]).toBeCloseTo(0, 8)
  })

  it('circular arc: curvature ≈ 1/r', () => {
    const r = 10
    const deg10 = Math.PI / 18
    const pts = [
      [r * Math.sin(-deg10), r * Math.cos(-deg10), 0],
      [0, r, 0],
      [r * Math.sin(deg10), r * Math.cos(deg10), 0],
    ]
    const { edgePositions, edgeIndices } = buildEdgeProxyData([pts])
    const result = computeEdgeCurvature(edgePositions, edgeIndices, 0, 2)
    expect(result).not.toBeNull()
    expect(result!.vertexCount).toBe(3)

    const expectedKappa = 1 / r
    expect(result!.curvatures[1]).toBeCloseTo(expectedKappa, 4)

    expect(result!.normals[3]).toBeCloseTo(0, 4)
    expect(result!.normals[4]).toBeCloseTo(1, 1)
    expect(result!.normals[5]).toBeCloseTo(0, 4)
  })

  it('line segment (2 vertices only): all zero', () => {
    const { edgePositions, edgeIndices } = buildEdgeProxyData([[[0, 0, 0], [1, 1, 1]]])
    const result = computeEdgeCurvature(edgePositions, edgeIndices, 0, 1)
    expect(result).not.toBeNull()
    expect(result!.vertexCount).toBe(2)
    expect(result!.curvatures[0]).toBe(0)
    expect(result!.curvatures[1]).toBe(0)
  })

  it('small arc in circle: curvature matches expectation', () => {
    const r = 20
    const pts: number[][] = []
    for (let i = -30; i <= 30; i += 15) {
      const rad = i * Math.PI / 180
      pts.push([r * Math.cos(rad), r * Math.sin(rad), 0])
    }
    const { edgePositions, edgeIndices } = buildEdgeProxyData([pts])
    const result = computeEdgeCurvature(edgePositions, edgeIndices, 0, pts.length - 1)
    expect(result).not.toBeNull()
    for (let i = 1; i < result!.vertexCount - 1; i++) {
      expect(result!.curvatures[i]).toBeCloseTo(1 / r, 2)
    }
  })

  it('uses segmentStart to pick the correct edge from shared buffers', () => {
    const linePts = [[0, 0, 0], [1, 0, 0], [2, 0, 0]]
    const arcPts: number[][] = []
    const r = 5
    for (let i = -30; i <= 30; i += 20) {
      const rad = i * Math.PI / 180
      arcPts.push([r * Math.cos(rad), r * Math.sin(rad), 0])
    }
    const { edgePositions, edgeIndices } = buildEdgeProxyData([linePts, arcPts])

    const e0 = computeEdgeCurvature(edgePositions, edgeIndices, 0, 2)
    expect(e0).not.toBeNull()
    expect(e0!.vertexCount).toBe(3)
    expect(e0!.curvatures[1]).toBeCloseTo(0, 8)

    const e1 = computeEdgeCurvature(edgePositions, edgeIndices, 2, 3)
    expect(e1).not.toBeNull()
    expect(e1!.vertexCount).toBe(4)
    expect(e1!.curvatures[1]).toBeGreaterThan(0)
    expect(e1!.curvatures[1]).toBeCloseTo(1 / r, 1)
  })
})

describe('collectEdgeRows', () => {
  it('returns empty for no selection', () => {
    const runtime = makeEdgeRuntime()
    expect(collectEdgeRows(runtime, [])).toEqual([])
  })

  it('returns edge row index for edge reference', () => {
    const runtime = makeEdgeRuntime({
      edges: [
        { id: 'o1.e1', segmentStart: 0, segmentCount: 1 } as EdgeRow,
        { id: 'o1.e2', segmentStart: 1, segmentCount: 2 } as EdgeRow,
      ],
      referenceMap: new Map([
        ['topology|o1|edge|e1', {
          id: 'topology|o1|edge|e1',
          selectorType: 'edge',
          rowIndex: 0,
        } as any],
        ['topology|o1|edge|e2', {
          id: 'topology|o1|edge|e2',
          selectorType: 'edge',
          rowIndex: 1,
        } as any],
      ]),
    })
    const result = collectEdgeRows(runtime, ['topology|o1|edge|e1'])
    expect(result).toEqual([0])
  })

  it('returns all edge row indices for face reference', () => {
    const runtime = makeEdgeRuntime({
      faces: [
        { id: 'o1.f1', edgeStart: 0, edgeCount: 3 } as FaceRow,
      ],
      edges: [
        { id: 'o1.e1' } as EdgeRow,
        { id: 'o1.e2' } as EdgeRow,
        { id: 'o1.e3' } as EdgeRow,
        { id: 'o1.e4' } as EdgeRow,
      ],
      referenceMap: new Map([
        ['topology|o1|face|f1', {
          id: 'topology|o1|face|f1',
          selectorType: 'face',
          rowIndex: 0,
        } as any],
      ]),
      proxy: {
        faceEdgeRows: new Uint32Array([0, 2, 3]),
      } as any,
    })
    const result = collectEdgeRows(runtime, ['topology|o1|face|f1'])
    expect(result.sort()).toEqual([0, 2, 3])
  })
})

describe('buildCombGeometry', () => {
  it('returns null when runtime is null', () => {
    expect(buildCombGeometry(null, ['test'], 1)).toBeNull()
  })

  it('returns null when no edges selected', () => {
    const runtime = makeEdgeRuntime()
    expect(buildCombGeometry(runtime, [], 1)).toBeNull()
  })

  it('builds geometry for a curved edge', () => {
    const r = 10
    const pts: number[][] = []
    for (let i = -30; i <= 30; i += 20) {
      pts.push([r * Math.cos(i * Math.PI / 180), r * Math.sin(i * Math.PI / 180), 0])
    }
    const { edgePositions, edgeIndices } = buildEdgeProxyData([pts])

    const runtime = makeEdgeRuntime({
      edges: [
        { id: 'o1.e1', segmentStart: 0, segmentCount: pts.length - 1 } as EdgeRow,
      ],
      referenceMap: new Map([
        ['topology|o1|edge|e1', {
          id: 'topology|o1|edge|e1',
          selectorType: 'edge',
          rowIndex: 0,
        } as any],
      ]),
      proxy: {
        edgePositions,
        edgeIndices,
        edgeIds: new Uint32Array(pts.length - 1),
        faceEdgeRows: new Uint32Array(0),
        edgeFaceRows: new Uint32Array(0),
      } as any,
    })

    const geometry = buildCombGeometry(runtime, ['topology|o1|edge|e1'], 1)
    expect(geometry).not.toBeNull()
    expect(geometry).toBeInstanceOf(THREE.BufferGeometry)

    const posAttr = geometry!.getAttribute('position')
    expect(posAttr).not.toBeNull()
    expect(posAttr.count).toBeGreaterThanOrEqual(2)
    expect(posAttr.count % 2).toBe(0)

    geometry!.dispose()
  })

  it('clamps tooth length to MAX_TOOTH_FRACTION of bbox diagonal', () => {
    const r = 5
    const pts: number[][] = []
    for (let i = -30; i <= 30; i += 20) {
      pts.push([r * Math.cos(i * Math.PI / 180), r * Math.sin(i * Math.PI / 180), 0])
    }
    const { edgePositions, edgeIndices } = buildEdgeProxyData([pts])

    const runtime = makeEdgeRuntime({
      edges: [
        { id: 'o1.e1', segmentStart: 0, segmentCount: pts.length - 1 } as EdgeRow,
      ],
      referenceMap: new Map([
        ['topology|o1|edge|e1', {
          id: 'topology|o1|edge|e1',
          selectorType: 'edge',
          rowIndex: 0,
        } as any],
      ]),
      proxy: {
        edgePositions,
        edgeIndices,
        edgeIds: new Uint32Array(pts.length - 1),
        faceEdgeRows: new Uint32Array(0),
        edgeFaceRows: new Uint32Array(0),
      } as any,
    })

    const geometry = buildCombGeometry(runtime, ['topology|o1|edge|e1'], 1000)
    expect(geometry).not.toBeNull()

    const posAttr = geometry!.getAttribute('position')
    expect(posAttr).not.toBeNull()

    for (let i = 1; i < posAttr.count; i += 2) {
      const tx = posAttr.getX(i), ty = posAttr.getY(i), tz = posAttr.getZ(i)
      const bx = posAttr.getX(i - 1), by = posAttr.getY(i - 1), bz = posAttr.getZ(i - 1)
      const len = Math.sqrt((tx - bx) ** 2 + (ty - by) ** 2 + (tz - bz) ** 2)
      expect(len).toBeLessThanOrEqual(1.51)
    }

    geometry!.dispose()
  })

  it('returns null for straight edge (zero curvature)', () => {
    const pts = [[0, 0, 0], [10, 0, 0], [20, 0, 0]]
    const { edgePositions, edgeIndices } = buildEdgeProxyData([pts])

    const runtime = makeEdgeRuntime({
      edges: [
        { id: 'o1.e1', segmentStart: 0, segmentCount: pts.length - 1 } as EdgeRow,
      ],
      referenceMap: new Map([
        ['topology|o1|edge|e1', {
          id: 'topology|o1|edge|e1',
          selectorType: 'edge',
          rowIndex: 0,
        } as any],
      ]),
      proxy: {
        edgePositions,
        edgeIndices,
        edgeIds: new Uint32Array(pts.length - 1),
        faceEdgeRows: new Uint32Array(0),
        edgeFaceRows: new Uint32Array(0),
      } as any,
    })

    const geometry = buildCombGeometry(runtime, ['topology|o1|edge|e1'], 1)
    expect(geometry).toBeNull()
  })
})

describe('computeAutoScale', () => {
  it('returns 1 when no runtime', () => {
    expect(computeAutoScale(null, ['test'])).toBe(1)
  })

  it('returns 1 when no selection', () => {
    const runtime = makeEdgeRuntime()
    expect(computeAutoScale(runtime, [])).toBe(1)
  })
})
