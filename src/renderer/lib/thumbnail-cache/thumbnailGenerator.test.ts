import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { waitForTextures } from './thumbnailGenerator'

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
