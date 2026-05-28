import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  parseGlbJson,
  extractExtensions,
  extractMaterials,
  extractTextures,
  extractAnimations,
  buildGlbExtensionData,
} from '@/engine/gltfExtensions'

const FIXTURES_DIR = path.resolve('src/test/fixtures')

function loadGlb(name: string): ArrayBuffer {
  const buf = fs.readFileSync(path.join(FIXTURES_DIR, name))
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

// ---- AnisotropyBarnLamp.glb ----

describe('AnisotropyBarnLamp.glb', () => {
  const buffer = loadGlb('AnisotropyBarnLamp.glb')
  const json = parseGlbJson(buffer)

  it('parses GLB JSON without error', () => {
    expect(json).toBeDefined()
    expect(json.asset).toBeDefined()
  })

  it('extracts 5 extensions, all supported, none required', () => {
    const exts = extractExtensions(json)
    expect(exts).toHaveLength(5)
    for (const e of exts) {
      expect(e.status).toBe('supported')
      expect(e.required).toBe(false)
    }
    const names = exts.map((e) => e.name)
    expect(names).toContain('KHR_materials_anisotropy')
    expect(names).toContain('KHR_materials_clearcoat')
    expect(names).toContain('KHR_materials_emissive_strength')
    expect(names).toContain('KHR_materials_transmission')
    expect(names).toContain('KHR_materials_volume')
  })

  it('extracts 3 materials with correct fields', () => {
    const mats = extractMaterials(json)
    expect(mats).toHaveLength(3)

    // Material #0: lamp metal — 6 texture slots (including extension textures)
    expect(mats[0].name).toBe('lamp metal')
    expect(mats[0].instanceCount).toBe(1)
    expect(mats[0].textureSlotCount).toBe(6)
    expect(mats[0].alphaMode).toBe('OPAQUE')
    expect(mats[0].doubleSided).toBe(false)

    // Material #1: lamp filament — no textures
    expect(mats[1].name).toBe('lamp filament')
    expect(mats[1].instanceCount).toBe(1)
    expect(mats[1].textureSlotCount).toBe(0)
    expect(mats[1].alphaMode).toBe('OPAQUE')
    expect(mats[1].doubleSided).toBe(false)

    // Material #2: lamp glass — no textures
    expect(mats[2].name).toBe('lamp glass')
    expect(mats[2].instanceCount).toBe(1)
    expect(mats[2].textureSlotCount).toBe(0)
    expect(mats[2].alphaMode).toBe('OPAQUE')
    expect(mats[2].doubleSided).toBe(false)
  })

  it('extracts 4 PNG textures with correct slots', () => {
    const texs = extractTextures(json)
    expect(texs).toHaveLength(4)

    // All textures should be PNG
    for (const t of texs) {
      expect(t.mimeType).toBe('image/png')
    }

    // Texture #0: baseColorTexture only (1 material ref)
    expect(texs[0].slots).toContain('material[0].baseColorTexture')
    expect(texs[0].instanceCount).toBe(1)

    // Texture #1: normalTexture + clearcoatNormalTexture (2 slots, 1 material ref)
    expect(texs[1].slots).toHaveLength(2)
    expect(texs[1].slots).toContain('material[0].normalTexture')
    expect(texs[1].slots).toContain('material[0].KHR_materials_clearcoat.clearcoatNormalTexture')
    expect(texs[1].instanceCount).toBe(1)

    // Texture #2: metallicRoughnessTexture + occlusionTexture (2 slots, 1 material ref)
    expect(texs[2].slots).toHaveLength(2)
    expect(texs[2].slots).toContain('material[0].metallicRoughnessTexture')
    expect(texs[2].slots).toContain('material[0].occlusionTexture')
    expect(texs[2].instanceCount).toBe(1)

    // Texture #3: anisotropyTexture (1 slot, 1 material ref)
    expect(texs[3].slots).toContain('material[0].KHR_materials_anisotropy.anisotropyTexture')
    expect(texs[3].instanceCount).toBe(1)
  })

  it('extracts texture size estimates from bufferViews', () => {
    const texs = extractTextures(json)
    // BufferView sizes verified via gltf-transform
    expect(texs[0].sizeEstimate).toBeGreaterThan(0) // baseColor — largest
    expect(texs[3].sizeEstimate).toBeGreaterThan(0) // anisotropy
  })

  it('extracts no animations', () => {
    const anims = extractAnimations(json)
    expect(anims).toHaveLength(0)
  })

  it('builds complete GlbExtensionData', () => {
    const data = buildGlbExtensionData(json)
    expect(data.used).toHaveLength(5)
    expect(data.required).toHaveLength(0)
    expect(data.extensions).toHaveLength(5)
    expect(data.materials).toHaveLength(3)
    expect(data.textures).toHaveLength(4)
    expect(data.animations).toHaveLength(0)
  })
})

// ---- RobotExpressive.glb ----

describe('RobotExpressive.glb', () => {
  const buffer = loadGlb('RobotExpressive.glb')
  const json = parseGlbJson(buffer)

  it('extracts no extensions', () => {
    const data = buildGlbExtensionData(json)
    expect(data.used).toHaveLength(0)
    expect(data.required).toHaveLength(0)
    expect(data.extensions).toHaveLength(0)
  })

  it('extracts 3 materials with correct instance counts', () => {
    const mats = extractMaterials(json)
    expect(mats).toHaveLength(3)

    // Material #0: Grey — 6 primitives (Foot.L, Torso.prim0, Head.prim0, Foot.R, Hand.R.prim1, Hand.L.prim1)
    expect(mats[0].name).toBe('Grey')
    expect(mats[0].instanceCount).toBe(6)
    expect(mats[0].textureSlotCount).toBe(0)
    expect(mats[0].alphaMode).toBe('OPAQUE')
    expect(mats[0].doubleSided).toBe(false)

    // Material #1: Main — 12 primitives
    expect(mats[1].name).toBe('Main')
    expect(mats[1].instanceCount).toBe(12)
    expect(mats[1].textureSlotCount).toBe(0)

    // Material #2: Black — 1 primitive (Head.prim2)
    expect(mats[2].name).toBe('Black')
    expect(mats[2].instanceCount).toBe(1)
    expect(mats[2].textureSlotCount).toBe(0)
  })

  it('extracts no textures', () => {
    const texs = extractTextures(json)
    expect(texs).toHaveLength(0)
  })

  it('extracts 14 animations with correct names and channels', () => {
    const anims = extractAnimations(json)
    expect(anims).toHaveLength(14)

    const expectedAnims = [
      { name: 'Dance', channels: 12 },
      { name: 'Death', channels: 18 },
      { name: 'Idle', channels: 7 },
      { name: 'Jump', channels: 18 },
      { name: 'No', channels: 7 },
      { name: 'Punch', channels: 15 },
      { name: 'Running', channels: 18 },
      { name: 'Sitting', channels: 10 },
      { name: 'Standing', channels: 10 },
      { name: 'ThumbsUp', channels: 15 },
      { name: 'Walking', channels: 20 },
      { name: 'WalkJump', channels: 18 },
      { name: 'Wave', channels: 18 },
      { name: 'Yes', channels: 7 },
    ]

    for (let i = 0; i < expectedAnims.length; i++) {
      expect(anims[i].name).toBe(expectedAnims[i].name)
      expect(anims[i].channels).toBe(expectedAnims[i].channels)
    }
  })
})

// ---- bath_day.glb ----

describe('bath_day.glb', () => {
  const buffer = loadGlb('bath_day.glb')
  const json = parseGlbJson(buffer)

  it('extracts 4 extensions, 2 required', () => {
    const data = buildGlbExtensionData(json)
    expect(data.used).toHaveLength(4)
    expect(data.required).toHaveLength(2)
    expect(data.required).toContain('EXT_texture_webp')
    expect(data.required).toContain('KHR_draco_mesh_compression')

    const names = data.extensions.map((e) => e.name)
    expect(names).toContain('KHR_materials_transmission')
    expect(names).toContain('EXT_mesh_gpu_instancing')
    expect(names).toContain('EXT_texture_webp')
    expect(names).toContain('KHR_draco_mesh_compression')

    for (const e of data.extensions) {
      expect(e.status).toBe('supported')
    }
  })

  it('extracts 6 materials with BLEND/MASK and doubleSided=true', () => {
    const mats = extractMaterials(json)
    expect(mats).toHaveLength(6)

    expect(mats[0].name).toBe('Pol__0')
    expect(mats[0].instanceCount).toBe(6)
    expect(mats[0].alphaMode).toBe('OPAQUE')
    expect(mats[0].doubleSided).toBe(true)

    expect(mats[1].name).toBe('07_-_Default')
    expect(mats[1].instanceCount).toBe(5)
    expect(mats[1].alphaMode).toBe('BLEND')
    expect(mats[1].doubleSided).toBe(true)

    expect(mats[2].name).toBe('03_-_Default')
    expect(mats[2].instanceCount).toBe(1)
    expect(mats[2].alphaMode).toBe('MASK')

    expect(mats[3].name).toBe('08_-_Default')
    expect(mats[3].instanceCount).toBe(8)
    // Has 2 texture slots: baseColorTexture + transmissionTexture
    expect(mats[3].textureSlotCount).toBe(2)

    expect(mats[4].name).toBe('02_-_Default')
    expect(mats[4].instanceCount).toBe(1)
    expect(mats[4].alphaMode).toBe('BLEND')

    expect(mats[5].name).toBe('01_-_Default')
    expect(mats[5].instanceCount).toBe(1)
    expect(mats[5].alphaMode).toBe('MASK')
  })

  it('extracts 4 WebP textures via EXT_texture_webp source', () => {
    const texs = extractTextures(json)
    expect(texs).toHaveLength(4)

    // All should be WebP
    for (const t of texs) {
      expect(t.mimeType).toBe('image/webp')
      expect(t.compression).toBe('WebP')
    }

    // Texture #1 referenced by 3 materials (#1, #2, #3)
    expect(texs[1].instanceCount).toBe(3)
    expect(texs[1].slots.length).toBeGreaterThanOrEqual(3)

    // Texture #3 has transmissionTexture slot
    expect(texs[3].slots).toContain('material[3].KHR_materials_transmission.transmissionTexture')
    expect(texs[3].instanceCount).toBe(1)

    // Texture #2 has 2 material references (#4, #5)
    expect(texs[2].instanceCount).toBe(2)
  })

  it('extracts 1 animation with 47 channels', () => {
    const anims = extractAnimations(json)
    expect(anims).toHaveLength(1)
    expect(anims[0].name).toBe('Take 001')
    expect(anims[0].channels).toBe(47)
  })
})

// ---- Edge cases ----

describe('edge cases', () => {
  it('parseGlbJson throws on non-GLB buffer', () => {
    const buf = new ArrayBuffer(100)
    new DataView(buf).setUint32(0, 0xDEADBEEF, true)
    expect(() => parseGlbJson(buf)).toThrow('Not a GLB file')
  })

  it('parseGlbJson throws on buffer too small', () => {
    expect(() => parseGlbJson(new ArrayBuffer(4))).toThrow()
  })

  it('material without alphaMode defaults to OPAQUE', () => {
    const json = { materials: [{}] }
    const mats = extractMaterials(json)
    expect(mats[0].alphaMode).toBe('OPAQUE')
  })

  it('material without doubleSided defaults to false', () => {
    const json = { materials: [{}] }
    const mats = extractMaterials(json)
    expect(mats[0].doubleSided).toBe(false)
  })

  it('material without name shows (unnamed)', () => {
    const json = { materials: [{}] }
    const mats = extractMaterials(json)
    expect(mats[0].name).toBe('(unnamed)')
  })

  it('empty materials array returns empty', () => {
    expect(extractMaterials({})).toHaveLength(0)
  })

  it('empty textures array returns empty', () => {
    expect(extractTextures({})).toHaveLength(0)
  })

  it('empty animations returns empty', () => {
    expect(extractAnimations({})).toHaveLength(0)
  })

  it('no extensionsUsed returns empty', () => {
    const exts = extractExtensions({})
    expect(exts).toHaveLength(0)
  })
})
