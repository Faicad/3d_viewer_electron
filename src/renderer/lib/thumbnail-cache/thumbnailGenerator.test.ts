import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import {
  waitForTextures,
  computeCropRegion,
  THUMBNAIL_TARGET_WIDTH,
  THUMBNAIL_TARGET_HEIGHT,
  THUMBNAIL_TARGET_RATIO,
} from './thumbnailGenerator'

beforeAll(() => {
  globalThis.requestAnimationFrame ??= ((cb: FrameRequestCallback) => {
    return setTimeout(() => cb(Date.now()), 16) as unknown as number
  })
  globalThis.HTMLImageElement ??= class {
    complete = false
  } as unknown as typeof HTMLImageElement
  globalThis.HTMLCanvasElement ??= class {
    width = 2
    height = 2
  } as unknown as typeof HTMLCanvasElement
})

afterAll(() => {
  const { requestAnimationFrame } =
    globalThis as Record<string, unknown>
  if (requestAnimationFrame && typeof requestAnimationFrame === 'function') {
    // Restore would require saving originals; this is fine for test isolation
  }
})

describe('waitForTextures', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('resolves immediately when scene has no textures', async () => {
    const group = new THREE.Group()
    group.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()))
    await expect(waitForTextures(group)).resolves.toBeUndefined()
  })

  it('resolves immediately when scene has no meshes', async () => {
    const group = new THREE.Group()
    await expect(waitForTextures(group)).resolves.toBeUndefined()
  })

  it('resolves immediately when texture has a non-ImageElement image', async () => {
    const texture = new THREE.Texture({ data: 'fake' } as unknown as HTMLImageElement)
    const material = new THREE.MeshBasicMaterial({ map: texture })
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material)

    const promise = waitForTextures(mesh)
    vi.advanceTimersByTime(16)
    await expect(promise).resolves.toBeUndefined()
  })

  it('sets needsUpdate (increments source.version) on all textures after ready', async () => {
    const t1 = new THREE.Texture({ a: 1 } as unknown as HTMLImageElement)
    const t2 = new THREE.Texture({ b: 2 } as unknown as HTMLImageElement)
    const ver1 = t1.source.version
    const ver2 = t2.source.version
    const mat = new THREE.MeshStandardMaterial({ map: t1, roughnessMap: t2 })
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), mat)

    const promise = waitForTextures(mesh)
    vi.advanceTimersByTime(16)
    await promise
    expect(t1.source.version).toBe(ver1 + 1)
    expect(t2.source.version).toBe(ver2 + 1)
  })

  it('traverses nested Object3D hierarchy to find textures', async () => {
    const tex = new THREE.Texture({ x: 1 } as unknown as HTMLImageElement)
    const mat = new THREE.MeshBasicMaterial({ map: tex })
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), mat)
    const sub = new THREE.Group()
    sub.add(mesh)
    const root = new THREE.Group()
    root.add(sub)

    const promise = waitForTextures(root)
    vi.advanceTimersByTime(16)
    await expect(promise).resolves.toBeUndefined()
  })

  it('handles meshes with multiple materials (material array)', async () => {
    const t1 = new THREE.Texture({ x: 1 } as unknown as HTMLImageElement)
    const t2 = new THREE.Texture({ y: 2 } as unknown as HTMLImageElement)
    const materials = [
      new THREE.MeshBasicMaterial({ map: t1 }),
      new THREE.MeshBasicMaterial({ map: t2 }),
    ]
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), materials)

    const promise = waitForTextures(mesh)
    vi.advanceTimersByTime(16)
    await expect(promise).resolves.toBeUndefined()
  })

  it('resolves when texture has a complete HTMLImageElement', async () => {
    const img = new HTMLImageElement()
    img.complete = true
    const texture = new THREE.Texture(img)
    const mat = new THREE.MeshBasicMaterial({ map: texture })
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), mat)

    const promise = waitForTextures(mesh)
    vi.advanceTimersByTime(16)
    await expect(promise).resolves.toBeUndefined()
  })

  it('polls until timeout when texture images never load', async () => {
    vi.useRealTimers()
    const img = new HTMLImageElement()
    img.complete = false
    const texture = new THREE.Texture(img)
    const mat = new THREE.MeshBasicMaterial({ map: texture })
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), mat)

    const start = Date.now()
    await waitForTextures(mesh, 100)
    const elapsed = Date.now() - start
    expect(elapsed).toBeGreaterThanOrEqual(90)
    expect(elapsed).toBeLessThan(500)
  }, 10_000)
})

// ---------------------------------------------------------------------------
// computeCropRegion — pure math, no DOM
// ---------------------------------------------------------------------------
describe('computeCropRegion', () => {
  it('returns identity crop for an already-4:3 source', () => {
    const r = computeCropRegion(200, 150)
    expect(r.sx).toBe(0)
    expect(r.sy).toBe(0)
    expect(r.sw).toBe(200)
    expect(r.sh).toBe(150)
  })

  it('returns identity crop for 800×600 (exact 4:3 multiple)', () => {
    const r = computeCropRegion(800, 600)
    expect(r.sx).toBe(0)
    expect(r.sy).toBe(0)
    expect(r.sw).toBe(800)
    expect(r.sh).toBe(600)
  })

  it('center-crops top/bottom for a square source (1:1 → 4:3)', () => {
    const r = computeCropRegion(256, 256)
    const expectedH = 256 / THUMBNAIL_TARGET_RATIO // 256 / 1.333... = 192
    expect(r.sx).toBe(0)
    expect(r.sy).toBeCloseTo((256 - expectedH) / 2) // (256-192)/2 = 32
    expect(r.sw).toBe(256)
    expect(r.sh).toBeCloseTo(expectedH)
  })

  it('center-crops left/right for a wide source (16:9 → 4:3)', () => {
    const r = computeCropRegion(1600, 900)
    const expectedW = 900 * THUMBNAIL_TARGET_RATIO // 900 * 1.333... = 1200
    expect(r.sx).toBeCloseTo((1600 - expectedW) / 2) // (1600-1200)/2 = 200
    expect(r.sy).toBe(0)
    expect(r.sw).toBeCloseTo(expectedW)
    expect(r.sh).toBe(900)
  })

  it('center-crops top/bottom for a tall source (3:4 → 4:3)', () => {
    const r = computeCropRegion(300, 400)
    const expectedH = 300 / THUMBNAIL_TARGET_RATIO // 300 / 1.333... = 225
    expect(r.sx).toBe(0)
    expect(r.sy).toBeCloseTo((400 - expectedH) / 2) // (400-225)/2 = 87.5
    expect(r.sw).toBe(300)
    expect(r.sh).toBeCloseTo(expectedH)
  })

  it('handles vise.3mf actual thumbnail dimensions: 240×239 (nearly square → crop top/bottom)', () => {
    // 240/239 ≈ 1.0042 < 1.3333 → source is taller → crop top/bottom
    const r = computeCropRegion(240, 239)
    const expectedH = 240 / THUMBNAIL_TARGET_RATIO // 240 / 1.333... = 180
    expect(r.sx).toBe(0)
    expect(r.sy).toBeCloseTo((239 - expectedH) / 2) // (239-180)/2 = 29.5
    expect(r.sw).toBe(240)
    expect(r.sh).toBeCloseTo(expectedH, 5)
    // Cropped region must have 4:3 aspect ratio
    expect(r.sw / r.sh).toBeCloseTo(THUMBNAIL_TARGET_RATIO, 5)
  })

  it('handles very large square dimensions', () => {
    const r = computeCropRegion(4096, 4096)
    expect(r.sx).toBe(0)
    expect(r.sy).toBeGreaterThan(0)
    expect(r.sw).toBe(4096)
    expect(r.sh).toBeLessThan(4096)
    expect(r.sw / r.sh).toBeCloseTo(THUMBNAIL_TARGET_RATIO, 5)
  })
})

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
describe('thumbnail constants', () => {
  it('target size is 200×150', () => {
    expect(THUMBNAIL_TARGET_WIDTH).toBe(200)
    expect(THUMBNAIL_TARGET_HEIGHT).toBe(150)
  })

  it('target aspect ratio is 4:3', () => {
    expect(THUMBNAIL_TARGET_RATIO).toBeCloseTo(4 / 3, 5)
  })
})
