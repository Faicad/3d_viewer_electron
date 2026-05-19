/**
 * Format loader integration tests — Vitest (no Electron needed).
 *
 * Tests each format loader by calling loadFormat() directly with fixture files.
 * Validates that parse succeeds and returns valid meshes/objects.
 *
 * The 4 key formats (STL/GLB/3MF/STEP) are only tested in Playwright E2E.
 * This file covers all remaining enabled non-disabled formats.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { loadFormat } from '@/engine/formatLoaders'
import { detectFormat, FORMAT_MAP, type FormatId } from '@/config/file-formats'

const FIXTURES_DIR = path.resolve('src/test/fixtures')

// Formats that require special runtime setup (WASM paths, external packages)
// and are either covered by Playwright E2E or not currently testable in Node.
const PLAYWRIGHT_ONLY: Set<FormatId> = new Set(['stl', 'glb', '3mf', 'step'])
const SKIP_FORMATS: Set<FormatId> = new Set([
  'gltf',  // disabled: needs external .bin/texture references
  'mdd',   // disabled: morph data only, no standalone render
  'ifc',   // disabled: needs web-ifc-three npm package
  'ldraw', // disabled: needs setPartsLibraryPath
  'drc',   // needs DRACOLoader WASM decoder path
  '3dm',   // needs Rhino3dmLoader WASM library path
  'kmz',   // fixture appears corrupted (fflate: invalid zip data)
  'wrl',   // fixture has VRML lexing errors
  'usdz',  // needs complex texture/image loading in USDComposer
])

interface FixtureEntry {
  file: string
  format: FormatId
  label: string
}

function findFixtures(): FixtureEntry[] {
  const allFiles = fs.readdirSync(FIXTURES_DIR)

  const fixtures: FixtureEntry[] = []
  const seen = new Set<FormatId>()

  for (const file of allFiles) {
    const format = detectFormat(file)
    if (!format) continue
    if (PLAYWRIGHT_ONLY.has(format)) continue
    if (SKIP_FORMATS.has(format)) continue
    if (seen.has(format)) continue
    seen.add(format)

    const fmtEntry = FORMAT_MAP[format]
    fixtures.push({
      file,
      format,
      label: fmtEntry?.label ?? format,
    })
  }

  return fixtures
}

const fixtures = findFixtures()

describe('Format loaders (Vitest integration)', () => {
  fixtures.forEach(({ file, format, label }) => {
    it(`loadFormat ${label} (${file})`, async () => {
      const filePath = path.join(FIXTURES_DIR, file)
      const buffer = fs.readFileSync(filePath).buffer.slice(
        fs.readFileSync(filePath).byteOffset,
        fs.readFileSync(filePath).byteOffset + fs.readFileSync(filePath).byteLength,
      ) as ArrayBuffer

      const result = await loadFormat(buffer, format)

      const totalObjects = result.meshes.length + result.objects.length
      expect(totalObjects, `${label} should produce at least 1 mesh/object`).toBeGreaterThan(0)
    })
  })

  it('at least some format fixtures were found', () => {
    expect(fixtures.length).toBeGreaterThan(0)
    console.log(`[format test] Testing ${fixtures.length} formats: ${fixtures.map(f => f.format).join(', ')}`)
  })
})
