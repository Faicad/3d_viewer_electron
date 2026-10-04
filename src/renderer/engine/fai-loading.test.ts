/**
 * End-to-end test for the `.fai.zip` loader path (`loadFormat(…, 'fai')`).
 *
 * Lives OUTSIDE `__tests__` so it is picked up by `vitest.config.ts` (node env,
 * not jsdom). In a node environment `faijs-viewer`'s engine validator accepts
 * the self-hosted wasm URLs and core auto-loads the real OCCT/manifold wasm
 * from node_modules — so this is a genuine `.fai.zip` → triangle-soup run, not a
 * mock. Requires the faijs runtime packages to be installed (see package.json
 * devDependencies).
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { writeContainer } from '@faicad/faijs/io/fai-zip'
import { loadFormat } from '@/engine/formatLoaders'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixtureSource = readFileSync(
  path.resolve(__dirname, '../../test/fixtures/Box.fai.js'),
  'utf8',
)

/** Build a real `.fai.zip` container from the Box.fai.js fixture. */
function buildFaiZip(): Uint8Array {
  const assembly = {
    models: [{ id: 'box-model', entry: 'model/Box.fai.js' }],
    active: 'box-model',
    modules: { 'model/Box.fai.js': fixtureSource },
    dataMembers: {},
    files: {},
    assets: {},
  } as const
  const { bytes } = writeContainer(assembly)
  return bytes
}

describe('loadFormat fai (.fai.zip) end-to-end', () => {
  it(
    'executes a cad.box model into an indexed BufferGeometry mesh',
    async () => {
      const bytes = buildFaiZip()
      expect(bytes.byteLength).toBeGreaterThan(0)

      // `.fai.zip` rounds the generic mesh pipeline: buffer → LoaderResult.
      const result = await loadFormat(bytes.buffer as ArrayBuffer, 'fai', 'parts/model.fai.zip')

      expect(result.meshes.length).toBeGreaterThan(0)
      for (const mesh of result.meshes) {
        const geo = mesh.geometry
        const pos = geo.getAttribute('position')
        const idx = geo.getIndex()
        expect(pos.count, 'positions exist').toBeGreaterThan(0)
        expect(idx, 'indexed geometry').toBeTruthy()
        expect(idx!.count, 'indices are a triangle soup').toBeGreaterThan(0)
        expect(idx!.count % 3).toBe(0)
        // Every index must reference a valid vertex (a tessellated box: e.g.
        // 24 verts / 36 indices for cad.box(20,33,20)).
        const array = idx!.array
        for (let i = 0; i < array.length; i++) {
          expect(array[i]).toBeGreaterThanOrEqual(0)
          expect(array[i]).toBeLessThan(pos.count)
        }
      }
      expect(result.sourceUnit).toBe('millimeter')
      // Each parsed part carries the fixture variable name.
      expect(result.meshes[0].name).toBe('part0')
    },
    120_000,
  )
})