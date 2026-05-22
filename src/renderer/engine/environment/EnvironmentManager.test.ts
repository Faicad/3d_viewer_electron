import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import * as THREE from 'three'

// Node environment lacks document — provide a minimal shim for CanvasTexture creation
beforeAll(() => {
  if (typeof document === 'undefined') {
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        createLinearGradient: () => ({ addColorStop: vi.fn() }),
        fillRect: vi.fn(),
      }),
      toDataURL: () => '',
    }
    ;(globalThis as Record<string, unknown>).document = {
      createElement: () => canvas,
    }
  }
})

// Mock PMREMGenerator as a proper constructor class
vi.mock('three', async () => {
  const actual = await vi.importActual<typeof import('three')>('three')

  class MockPMREMGenerator {
    fromScene = vi.fn().mockReturnValue({ texture: new actual.Texture() })
    fromEquirectangular = vi.fn().mockReturnValue({ texture: new actual.Texture() })
    dispose = vi.fn()
  }

  return {
    ...actual,
    PMREMGenerator: MockPMREMGenerator,
  }
})

vi.mock('three/examples/jsm/loaders/RGBELoader.js', async () => {
  const { Texture } = await vi.importActual<typeof import('three')>('three')
  return {
    RGBELoader: vi.fn().mockImplementation(() => ({
      setDataType: vi.fn(),
      loadAsync: vi.fn().mockResolvedValue(new Texture()),
    })),
  }
})

import { EnvironmentManager } from './EnvironmentManager'

function mockRenderer() {
  return {
    shadowMap: {},
    render: vi.fn(),
    dispose: vi.fn(),
  } as unknown as THREE.WebGLRenderer
}

describe('EnvironmentManager', () => {
  let renderer: THREE.WebGLRenderer

  beforeEach(() => {
    renderer = mockRenderer()
  })

  it('creates an instance with a renderer', () => {
    const mgr = new EnvironmentManager(renderer)
    expect(mgr).toBeInstanceOf(EnvironmentManager)
    expect(mgr.currentTexture).toBeNull()
    mgr.dispose()
  })

  it('initDefault sets a non-null texture', () => {
    const mgr = new EnvironmentManager(renderer)
    mgr.initDefault()
    expect(mgr.currentTexture).not.toBeNull()
    expect(mgr.currentTexture).toBeInstanceOf(THREE.Texture)
    mgr.dispose()
  })

  it('setEnvironment with "studio" returns clean room texture', async () => {
    const mgr = new EnvironmentManager(renderer)
    const tex = await mgr.setEnvironment('studio')
    expect(tex).toBeInstanceOf(THREE.Texture)
    expect(mgr.currentTexture).toBe(tex)
    mgr.dispose()
  })

  it('__cleanroom__ key also returns clean room texture', async () => {
    const mgr = new EnvironmentManager(renderer)
    const tex = await mgr.setEnvironment('__cleanroom__')
    expect(tex).toBeInstanceOf(THREE.Texture)
    mgr.dispose()
  })

  it('caches results for the same source', async () => {
    const mgr = new EnvironmentManager(renderer)
    const tex1 = await mgr.setEnvironment('studio')
    const tex2 = await mgr.setEnvironment('studio')
    expect(tex2).toBe(tex1) // same reference from cache
    mgr.dispose()
  })

  // -----------------------------------------------------------------------
  // Background modes
  // -----------------------------------------------------------------------

  it('default background mode is grey', () => {
    const mgr = new EnvironmentManager(renderer)
    expect(mgr.backgroundMode).toBe('grey')
    mgr.dispose()
  })

  it('setBackgroundMode updates the mode', () => {
    const mgr = new EnvironmentManager(renderer)
    mgr.setBackgroundMode('white')
    expect(mgr.backgroundMode).toBe('white')
    mgr.dispose()
  })

  it('applyBackground with grey sets a Color background', () => {
    const mgr = new EnvironmentManager(renderer)
    const scene = new THREE.Scene()
    mgr.applyBackground(scene, 0)
    expect(scene.background).toBeInstanceOf(THREE.Color)
    mgr.dispose()
  })

  it('applyBackground with transparent sets null background', () => {
    const mgr = new EnvironmentManager(renderer)
    mgr.setBackgroundMode('transparent')
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xffffff)
    mgr.applyBackground(scene, 0)
    expect(scene.background).toBeNull()
    mgr.dispose()
  })

  it('applyBackground with environment mode requires current texture', () => {
    const mgr = new EnvironmentManager(renderer)
    mgr.initDefault()
    mgr.setBackgroundMode('environment')
    const scene = new THREE.Scene()
    mgr.applyBackground(scene, 0)
    // Background should be set to a clone of the current env texture
    expect(scene.background).toBeInstanceOf(THREE.Texture)
    mgr.dispose()
  })

  it('applyBackground with darkgrey sets a Color background', () => {
    const mgr = new EnvironmentManager(renderer)
    mgr.setBackgroundMode('darkgrey')
    const scene = new THREE.Scene()
    mgr.applyBackground(scene, 0)
    expect(scene.background).toBeInstanceOf(THREE.Color)
    mgr.dispose()
  })

  it('applyBackground with gradient creates a CanvasTexture', () => {
    const mgr = new EnvironmentManager(renderer)
    mgr.setBackgroundMode('gradient')
    const scene = new THREE.Scene()
    mgr.applyBackground(scene, 0)
    expect(scene.background).toBeInstanceOf(THREE.CanvasTexture)
    mgr.dispose()
  })

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  it('dispose clears cached textures', () => {
    const mgr = new EnvironmentManager(renderer)
    mgr.initDefault()
    expect(mgr.currentTexture).not.toBeNull()
    mgr.dispose()
    expect(mgr.currentTexture).toBeNull()
  })
})
