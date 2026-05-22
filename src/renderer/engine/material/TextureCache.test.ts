import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { TextureCache, getMapColorSpace, TEXTURE_MAP_KEYS } from './TextureCache'

function fakeTexture(): THREE.Texture {
  const tex = new THREE.Texture()
  tex.needsUpdate = true
  return tex
}

function createMockTextureLoader() {
  let callCount = 0
  return {
    loader: {
      load: vi.fn((_url: string, onLoad: (tex: THREE.Texture) => void) => {
        callCount++
        queueMicrotask(() => onLoad(fakeTexture()))
      }),
    },
    get callCount() {
      return callCount
    },
  }
}

describe('TextureCache', () => {
  let cache: TextureCache

  beforeEach(() => {
    cache = new TextureCache()
  })

  afterEach(() => {
    cache.dispose()
  })

  // ---------------------------------------------------------------------------
  // Basic caching
  // ---------------------------------------------------------------------------

  it('load returns a texture and caches it', async () => {
    const mock = createMockTextureLoader()
    ;(cache as Record<string, unknown>)._loader = mock.loader

    const t1 = await cache.load('test.png', 'sRGB')
    expect(t1).toBeInstanceOf(THREE.Texture)

    const t2 = await cache.load('test.png', 'sRGB')
    expect(t2).toBe(t1)
    expect(mock.callCount).toBe(1)
  })

  it('get returns undefined for uncached texture', () => {
    expect(cache.get('nope.png')).toBeUndefined()
  })

  it('get returns the texture after caching', async () => {
    const tex = fakeTexture()
    ;(cache as Record<string, unknown>)._cache = new Map([['cached.png', tex]])
    expect(cache.get('cached.png')).toBe(tex)
  })

  it('has returns false for uncached, true for cached', async () => {
    expect(cache.has('x.png')).toBe(false)
    const mock = createMockTextureLoader()
    ;(cache as Record<string, unknown>)._loader = mock.loader
    await cache.load('x.png', 'sRGB')
    expect(cache.has('x.png')).toBe(true)
  })

  // ---------------------------------------------------------------------------
  // In-flight dedup
  // ---------------------------------------------------------------------------

  it('reuses in-flight promise for concurrent requests', async () => {
    const mock = createMockTextureLoader()
    ;(cache as Record<string, unknown>)._loader = mock.loader

    const [a, b] = await Promise.all([
      cache.load('shared.png', 'sRGB'),
      cache.load('shared.png', 'sRGB'),
    ])
    expect(a).toBe(b)
    expect(mock.callCount).toBe(1)
  })

  // ---------------------------------------------------------------------------
  // Color space
  // ---------------------------------------------------------------------------

  it('sets SRGBColorSpace on sRGB textures', async () => {
    const mock = createMockTextureLoader()
    mock.loader.load.mockImplementation(
      (_url: string, onLoad: (tex: THREE.Texture) => void) => {
        queueMicrotask(() => onLoad(fakeTexture()))
      },
    )
    ;(cache as Record<string, unknown>)._loader = mock.loader

    const tex = await cache.load('color.png', 'sRGB')
    expect(tex.colorSpace).toBe(THREE.SRGBColorSpace)
  })

  it('sets LinearSRGBColorSpace on linear textures', async () => {
    const mock = createMockTextureLoader()
    mock.loader.load.mockImplementation(
      (_url: string, onLoad: (tex: THREE.Texture) => void) => {
        queueMicrotask(() => onLoad(fakeTexture()))
      },
    )
    ;(cache as Record<string, unknown>)._loader = mock.loader

    const tex = await cache.load('normal.png', 'linear')
    expect(tex.colorSpace).toBe(THREE.LinearSRGBColorSpace)
  })

  // ---------------------------------------------------------------------------
  // Anisotropy
  // ---------------------------------------------------------------------------

  it('applies maxAnisotropy when texture supports it', async () => {
    cache.maxAnisotropy = 8
    const mock = createMockTextureLoader()
    ;(cache as Record<string, unknown>)._loader = mock.loader

    const tex = await cache.load('test.png', 'sRGB')
    expect(tex.anisotropy).toBe(8)
  })

  // ---------------------------------------------------------------------------
  // Dispose
  // ---------------------------------------------------------------------------

  it('dispose clears cache and in-flight', async () => {
    const mock = createMockTextureLoader()
    ;(cache as Record<string, unknown>)._loader = mock.loader
    await cache.load('a.png', 'sRGB')
    expect(cache.has('a.png')).toBe(true)

    cache.dispose()
    expect(cache.has('a.png')).toBe(false)
  })

  it('disposeFull clears loader reference', () => {
    ;(cache as Record<string, unknown>)._loader = {} as THREE.TextureLoader
    cache.disposeFull()
    expect((cache as Record<string, unknown>)._loader).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// getMapColorSpace
// ---------------------------------------------------------------------------

describe('getMapColorSpace', () => {
  it('returns sRGB for base colour map', () => {
    expect(getMapColorSpace('map')).toBe('sRGB')
  })

  it('returns sRGB for emissive map', () => {
    expect(getMapColorSpace('emissiveMap')).toBe('sRGB')
  })

  it('returns linear for normal map', () => {
    expect(getMapColorSpace('normalMap')).toBe('linear')
  })

  it('returns linear for roughness map', () => {
    expect(getMapColorSpace('roughnessMap')).toBe('linear')
  })

  it('returns linear for unknown map keys', () => {
    expect(getMapColorSpace('unknownMap')).toBe('linear')
  })
})

// ---------------------------------------------------------------------------
// TEXTURE_MAP_KEYS
// ---------------------------------------------------------------------------

describe('TEXTURE_MAP_KEYS', () => {
  it('includes the essential PBR texture slots', () => {
    expect(TEXTURE_MAP_KEYS).toContain('map')
    expect(TEXTURE_MAP_KEYS).toContain('metalnessMap')
    expect(TEXTURE_MAP_KEYS).toContain('roughnessMap')
    expect(TEXTURE_MAP_KEYS).toContain('normalMap')
    expect(TEXTURE_MAP_KEYS).toContain('aoMap')
    expect(TEXTURE_MAP_KEYS).toContain('emissiveMap')
  })
})
