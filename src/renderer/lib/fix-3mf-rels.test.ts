import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { JSDOM } from 'jsdom'

const AUGER_FIXTURE = path.resolve('src/test/fixtures/Auger.3mf')
const VISE_FIXTURE = path.resolve('src/test/fixtures/vise.3mf')

// ThreeMFLoader.parse() uses global DOMParser — polyfill from jsdom for Node
const dom = new JSDOM()
if (typeof globalThis.DOMParser === 'undefined') {
  ;(globalThis as any).DOMParser = dom.window.DOMParser
}

function readFixture(file: string): ArrayBuffer {
  const raw = fs.readFileSync(file)
  return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer
}

describe('parse3mf (rels Target fix)', () => {
  it('fixes Auger.3mf so ThreeMFLoader can parse it', async () => {
    const { ThreeMFLoader } = await import('three/examples/jsm/loaders/3MFLoader.js')
    const { parse3mf } = await import('@/lib/fix-3mf-rels')

    const buf = readFixture(AUGER_FIXTURE)

    // Without parse3mf this would throw:
    //   TypeError: Cannot read properties of undefined (reading 'build')
    const group = parse3mf(new ThreeMFLoader(), buf)
    expect(group.children.length).toBeGreaterThan(0)
  }, 30000)

  it('does not break vise.3mf (which already has leading / in rels Target)', async () => {
    const { ThreeMFLoader } = await import('three/examples/jsm/loaders/3MFLoader.js')
    const { parse3mf } = await import('@/lib/fix-3mf-rels')

    const buf = readFixture(VISE_FIXTURE)
    const group = parse3mf(new ThreeMFLoader(), buf)
    expect(group.children.length).toBeGreaterThan(0)
  }, 30000)

  it('loadFormat handles Auger.3mf without error', async () => {
    const { loadFormat } = await import('@/engine/formatLoaders')

    const buf = readFixture(AUGER_FIXTURE)
    const result = await loadFormat(buf, '3mf')
    expect(result.meshes.length).toBeGreaterThan(0)
  }, 30000)

  it('does not modify DOMParser after returning', async () => {
    const { parse3mf } = await import('@/lib/fix-3mf-rels')
    const { ThreeMFLoader } = await import('three/examples/jsm/loaders/3MFLoader.js')

    const buf = readFixture(AUGER_FIXTURE)
    parse3mf(new ThreeMFLoader(), buf)

    // After parse3mf returns, DOMParser should be back to normal
    const doc = new DOMParser().parseFromString(
      '<Relationship Target="3D/foo.model"/>', 'application/xml',
    )
    const target = doc.querySelector('Relationship')?.getAttribute('Target')
    expect(target).toBe('3D/foo.model') // unchanged, not '/3D/foo.model'
  }, 30000)
})