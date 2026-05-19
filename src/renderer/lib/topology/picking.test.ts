import { describe, it, expect } from 'vitest'
import {
  faceReferenceFromIntersection,
  edgeReferenceFromIntersection,
  vertexReferenceFromIntersection,
  pointReferenceFromIntersection,
  partIdFromIntersection,
  type PickIntersection,
} from './picking'
import type { SelectorRuntime, Reference } from './types'

function makeRuntime(overrides: Partial<SelectorRuntime> = {}): SelectorRuntime {
  return {
    occurrences: [],
    shapes: [],
    faces: [
      { id: 'o0.f1', occurrenceId: 'o0', shapeId: 'o0.s1', ordinal: 1, surfaceType: 'plane', area: 10, center: [0, 0, 0], normal: [0, 0, 1], bbox: { min: [0, 0, 0], max: [1, 1, 0] }, edgeStart: 0, edgeCount: 0, relevance: 0, flags: 0, params: null, triangleStart: 0, triangleCount: 10 },
      { id: 'o0.f2', occurrenceId: 'o0', shapeId: 'o0.s1', ordinal: 2, surfaceType: 'plane', area: 5, center: [1, 0, 0], normal: [0, 0, 1], bbox: { min: [1, 0, 0], max: [2, 1, 0] }, edgeStart: 0, edgeCount: 0, relevance: 0, flags: 0, params: null, triangleStart: 10, triangleCount: 5 },
    ],
    edges: [
      { id: 'o0.e1', occurrenceId: 'o0', shapeId: 'o0.s1', ordinal: 1, curveType: 'line', length: 1, center: [0.5, 0, 0], bbox: { min: [0, 0, 0], max: [1, 0, 0] }, faceStart: 0, faceCount: 2, relevance: 0, flags: 0, params: null, segmentStart: 0, segmentCount: 1 },
    ],
    occurrenceIdByRowIndex: new Map([[0, 'o0']]),
    shapeIdByRowIndex: new Map([[0, 'o0.s1']]),
    faceReferenceByRowIndex: new Map([
      [0, { selectorType: 'face', pickData: { adjacentSelectors: [] } } as unknown as Reference],
      [1, { selectorType: 'face', pickData: { adjacentSelectors: [] } } as unknown as Reference],
    ]),
    edgeReferenceByRowIndex: new Map([
      [0, { selectorType: 'edge', pickData: { segmentStart: 0, segmentCount: 1, adjacentSelectors: [] } } as unknown as Reference],
    ]),
    vertexReferenceByRowIndex: new Map([
      [0, { selectorType: 'vertex', pickData: { adjacentSelectors: [] } } as unknown as Reference],
      [1, { selectorType: 'vertex', pickData: { adjacentSelectors: [] } } as unknown as Reference],
    ]),
    proxy: {
      faceRuns: new Uint32Array(0),
      faceRunColumns: [],
      edgePositions: new Float32Array(0),
      edgeIndices: new Uint32Array(0),
      edgeIds: new Uint32Array(0),
      vertexIds: new Uint32Array(0),
      vertexPointCount: 0,
      edgeMidCount: 0,
      faceCenterCount: 0,
      allPointPositions: new Float32Array(0),
      allPointTypes: new Uint8Array(0),
      allPointRefIndices: new Uint32Array(0),
    },
    ...overrides,
  }
}

function makeIntersection(overrides: Partial<PickIntersection> = {}): PickIntersection {
  return {
    faceIndex: null,
    index: null,
    object: { userData: {} },
    ...overrides,
  }
}

describe('faceReferenceFromIntersection', () => {
  it('resolves face index via faceIds', () => {
    const runtime = makeRuntime()
    const faceIds = new Uint32Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1]) // 10 for face 0, 5 for face 1
    const intersection = makeIntersection({
      faceIndex: 10, // triangle 10 → face row 1
      object: { userData: { faceIds } },
    })
    const ref = faceReferenceFromIntersection(intersection, runtime)
    expect(ref).not.toBeNull()
    expect(ref!.selectorType).toBe('face')
  })

  it('returns null for faceIndex at NONE sentinel', () => {
    const runtime = makeRuntime()
    const faceIds = new Uint32Array([0xffffffff, 0, 0])
    const intersection = makeIntersection({
      faceIndex: 0,
      object: { userData: { faceIds } },
    })
    expect(faceReferenceFromIntersection(intersection, runtime)).toBeNull()
  })

  it('returns null without faceIds userData', () => {
    const runtime = makeRuntime()
    const intersection = makeIntersection({ faceIndex: 5 })
    expect(faceReferenceFromIntersection(intersection, runtime)).toBeNull()
  })

  it('returns null for null faceIndex', () => {
    const runtime = makeRuntime()
    const intersection = makeIntersection()
    expect(faceReferenceFromIntersection(intersection, runtime)).toBeNull()
  })
})

describe('edgeReferenceFromIntersection', () => {
  it('resolves edge segment via edgeIds', () => {
    const runtime = makeRuntime()
    const edgeIds = new Uint32Array([0, 0]) // vertex indices 0 and 1 → segment 0 → edge row 0
    const intersection = makeIntersection({
      index: 0, // first vertex of segment → segment 0
      object: { userData: { edgeIds } },
    })
    const ref = edgeReferenceFromIntersection(intersection, runtime)
    expect(ref).not.toBeNull()
    expect(ref!.selectorType).toBe('edge')
  })

  it('returns null for segment with non-existent edge row', () => {
    const runtime = makeRuntime()
    // edgeIds[1] = 0 → segment 1 maps to edge row 0, which exists
    // Use edgeIds[segmentIndex] = 99 which doesn't exist
    const edgeIds = new Uint32Array([0, 99])
    const intersection = makeIntersection({
      index: 2, // vertex 2 → floor(2/2)=1 → edgeIds[1]=99 → not in map
      object: { userData: { edgeIds } },
    })
    expect(edgeReferenceFromIntersection(intersection, runtime)).toBeNull()
  })

  it('returns null without edgeIds', () => {
    const runtime = makeRuntime()
    expect(edgeReferenceFromIntersection(makeIntersection({ index: 0 }), runtime)).toBeNull()
  })
})

describe('vertexReferenceFromIntersection', () => {
  it('resolves vertex point index via vertexIds', () => {
    const runtime = makeRuntime()
    const vertexIds = new Uint32Array([0, 1, 0])
    const intersection = makeIntersection({
      index: 1,
      object: { userData: { vertexIds } },
    })
    const ref = vertexReferenceFromIntersection(intersection, runtime)
    expect(ref).not.toBeNull()
    expect(ref!.selectorType).toBe('vertex')
  })

  it('returns null for NONE sentinel', () => {
    const runtime = makeRuntime()
    const vertexIds = new Uint32Array([0xffffffff])
    const intersection = makeIntersection({
      index: 0,
      object: { userData: { vertexIds } },
    })
    expect(vertexReferenceFromIntersection(intersection, runtime)).toBeNull()
  })

  it('returns null without vertexIds', () => {
    const runtime = makeRuntime()
    expect(vertexReferenceFromIntersection(makeIntersection({ index: 0 }), runtime)).toBeNull()
  })
})

describe('pointReferenceFromIntersection', () => {
  it('resolves via pointRefIndices', () => {
    const runtime = makeRuntime()
    const pointRefIndices = new Uint32Array([0, 1])
    const intersection = makeIntersection({
      index: 1,
      object: { userData: { pointRefIndices } },
    })
    const ref = pointReferenceFromIntersection(intersection, runtime)
    expect(ref).not.toBeNull()
    expect(ref!.selectorType).toBe('vertex')
  })

  it('falls back to vertexIds when no pointRefIndices', () => {
    const runtime = makeRuntime()
    const vertexIds = new Uint32Array([0])
    const intersection = makeIntersection({
      index: 0,
      object: { userData: { vertexIds } },
    })
    const ref = pointReferenceFromIntersection(intersection, runtime)
    expect(ref).not.toBeNull()
    expect(ref!.selectorType).toBe('vertex')
  })

  it('returns null for NONE sentinel in pointRefIndices', () => {
    const runtime = makeRuntime()
    const pointRefIndices = new Uint32Array([0xffffffff])
    const intersection = makeIntersection({
      index: 0,
      object: { userData: { pointRefIndices } },
    })
    expect(pointReferenceFromIntersection(intersection, runtime)).toBeNull()
  })
})

describe('partIdFromIntersection', () => {
  it('extracts partId from userData', () => {
    const intersection = makeIntersection({
      object: { userData: { partId: 'o0' } },
    })
    expect(partIdFromIntersection(intersection)).toBe('o0')
  })

  it('returns null for missing partId', () => {
    expect(partIdFromIntersection(makeIntersection())).toBeNull()
  })

  it('returns null for empty partId', () => {
    const intersection = makeIntersection({
      object: { userData: { partId: '' } },
    })
    expect(partIdFromIntersection(intersection)).toBeNull()
  })
})
