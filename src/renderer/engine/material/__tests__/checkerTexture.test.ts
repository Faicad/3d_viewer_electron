import { describe, it, expect, beforeEach, vi, afterAll } from 'vitest'
import * as THREE from 'three'

// Mock Canvas 2D context — jsdom provides document.createElement('canvas')
// but getContext('2d') returns null. We mock the API surface and spy on calls
// to verify correct rendering behavior.
let fillRectCalls: { x: number; y: number; w: number; h: number; fillStyle: string }[] = []
let fillTextCalls: { text: string; x: number; y: number }[] = []
let setFillStyleValues: string[] = []
let toDataUriCallCount = 0

function createMockCtx(_canvas: HTMLCanvasElement) {
  const ctx = {
    get fillStyle() { return setFillStyleValues[setFillStyleValues.length - 1] ?? '#000000' },
    set fillStyle(v: string) { setFillStyleValues.push(v) },

    font: '',
    textAlign: 'left' as CanvasTextAlign,
    textBaseline: 'top' as CanvasTextBaseline,

    fillRect(x: number, y: number, w: number, h: number) {
      fillRectCalls.push({ x, y, w, h, fillStyle: setFillStyleValues[setFillStyleValues.length - 1] ?? '#000000' })
    },

    fillText(text: string, x: number, y: number) {
      fillTextCalls.push({ text, x, y })
    },

    getImageData() {
      return { data: new Uint8ClampedArray(0), width: 0, height: 0, colorSpace: 'srgb' as PredefinedColorSpace }
    },
  }
  return ctx
}

const origGetContext = HTMLCanvasElement.prototype.getContext

beforeEach(() => {
  fillRectCalls = []
  fillTextCalls = []
  setFillStyleValues = []
  toDataUriCallCount = 0

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    function (this: HTMLCanvasElement, ctxId: string) {
      if (ctxId === '2d') {
        return createMockCtx(this) as unknown as CanvasRenderingContext2D
      }
      return origGetContext.call(this, ctxId)
    },
  )

  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(function () {
    return `data:image/png;base64,test${toDataUriCallCount++}`
  })
})

afterAll(() => {
  vi.restoreAllMocks()
})

// Import under test after mocks
import { createCheckerTexture, getCheckerDataUri, disposeCheckerTexture } from '../checkerTexture'

beforeEach(() => {
  disposeCheckerTexture()
})

describe('createCheckerTexture', () => {
  it('returns a CanvasTexture', () => {
    const tex = createCheckerTexture()
    expect(tex).toBeInstanceOf(THREE.CanvasTexture)
  })

  it('has 512×512 image dimensions', () => {
    const tex = createCheckerTexture()
    expect(tex.image.width).toBe(512)
    expect(tex.image.height).toBe(512)
  })

  it('has correct wrapping and color space', () => {
    const tex = createCheckerTexture()
    expect(tex.wrapS).toBe(THREE.RepeatWrapping)
    expect(tex.wrapT).toBe(THREE.RepeatWrapping)
    expect(tex.colorSpace).toBe(THREE.SRGBColorSpace)
  })

  it('returns the same cached instance on subsequent calls', () => {
    const a = createCheckerTexture()
    const b = createCheckerTexture()
    expect(a).toBe(b)
  })

  it('draws 64 fillRects (8×8 grid)', () => {
    createCheckerTexture()
    expect(fillRectCalls).toHaveLength(64)
  })

  it('draws all cells at correct positions with correct sizes', () => {
    createCheckerTexture()
    const cellSize = 512 / 8
    for (const call of fillRectCalls) {
      expect(call.w).toBe(cellSize)
      expect(call.h).toBe(cellSize)
      expect(call.x).toBeGreaterThanOrEqual(0)
      expect(call.y).toBeGreaterThanOrEqual(0)
      expect(call.x).toBeLessThan(512)
      expect(call.y).toBeLessThan(512)
    }
  })

  it('alternates white and gray fill colors', () => {
    createCheckerTexture()
    // Grid pattern: (row + col) % 2 === 0 → white, else gray
    const whiteCalls = fillRectCalls.filter(c => c.fillStyle === '#ffffff')
    const grayCalls = fillRectCalls.filter(c => c.fillStyle === '#cccccc')
    expect(whiteCalls.length).toBe(32)
    expect(grayCalls.length).toBe(32)
  })

  it('draws numbered text in every cell', () => {
    createCheckerTexture()
    expect(fillTextCalls).toHaveLength(64)
    // Verify numbers 1-64 are drawn
    const texts = fillTextCalls.map(c => Number(c.text))
    for (let i = 1; i <= 64; i++) {
      expect(texts).toContain(i)
    }
  })

  it('draws text at cell centers', () => {
    createCheckerTexture()
    const cellSize = 512 / 8
    for (let i = 0; i < 64; i++) {
      const row = Math.floor(i / 8)
      const col = i % 8
      const call = fillTextCalls[i]
      const expectedX = col * cellSize + cellSize / 2
      const expectedY = row * cellSize + cellSize / 2
      expect(call.x).toBe(expectedX)
      expect(call.y).toBe(expectedY)
    }
  })
})

describe('getCheckerDataUri', () => {
  it('returns a data URI string', () => {
    const uri = getCheckerDataUri()
    expect(uri).toMatch(/^data:image\/png;base64,/)
  })

  it('returns same URI on repeated calls', () => {
    const a = getCheckerDataUri()
    const b = getCheckerDataUri()
    expect(a).toBe(b)
  })
})

describe('disposeCheckerTexture', () => {
  it('clears the cache so next create returns a new instance', () => {
    const a = createCheckerTexture()
    disposeCheckerTexture()
    const b = createCheckerTexture()
    expect(a).not.toBe(b)
  })

  it('clears the data URI cache', () => {
    const a = getCheckerDataUri()
    disposeCheckerTexture()
    const b = getCheckerDataUri()
    expect(a).not.toBe(b)
  })
})
