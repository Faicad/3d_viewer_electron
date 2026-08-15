/**
 * Blender (.blend) loader integration tests — Vitest (jsdom).
 *
 * .blend files require Blender CLI for conversion, which is not available in
 * CI. We mock the main-process IPC (blendFindExe / blendConvertToGlb) and feed
 * a real GLB fixture through the conversion result, verifying the full
 * loadFormat('blend') pipeline (detect → convert → GLB load) with the real
 * test-cube.blend fixture without throwing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { loadFormat } from '@/engine/formatLoaders'
import { useUIStore } from '@/stores/ui-store'

const BLEND_FIXTURE = path.resolve('src/test/fixtures/test-cube.blend')
const GLB_FIXTURE = path.resolve('src/test/fixtures/RobotExpressive.glb')

function readFixtureAsArrayBuffer(filePath: string): ArrayBuffer {
  // new Uint8Array(raw) copies into the current realm's ArrayBuffer.
  // raw.buffer.slice() keeps the Node-realm ArrayBuffer, which fails
  // `instanceof ArrayBuffer` in jsdom and breaks GLTFLoader's binary detection.
  return new Uint8Array(fs.readFileSync(filePath)).buffer as ArrayBuffer
}

describe('Blender (.blend) loader integration', () => {
  beforeEach(() => {
    useUIStore.getState().setBlenderPath('')
  })

  it('loads test-cube.blend without error via mocked Blender IPC', async () => {
    const originalApi = window.electronAPI
    const blendConvertToGlb = vi.fn(async () => readFixtureAsArrayBuffer(GLB_FIXTURE))
    window.electronAPI = {
      ...originalApi,
      blendFindExe: vi.fn(async () => 'C:\\fake\\blender.exe'),
      blendConvertToGlb,
    } as any

    try {
      const buffer = readFixtureAsArrayBuffer(BLEND_FIXTURE)
      const result = await loadFormat(buffer, 'blend', BLEND_FIXTURE)

      expect(blendConvertToGlb).toHaveBeenCalledTimes(1)
      expect(blendConvertToGlb).toHaveBeenCalledWith(BLEND_FIXTURE, undefined)
      expect(result.meshes.length + result.objects.length, 'should produce at least 1 mesh/object').toBeGreaterThan(0)
    } finally {
      window.electronAPI = originalApi
    }
  })

  it('caches the converted GLB for 30 minutes (no second IPC call)', async () => {
    const originalApi = window.electronAPI
    const blendConvertToGlb = vi.fn(async () => readFixtureAsArrayBuffer(GLB_FIXTURE))
    window.electronAPI = {
      ...originalApi,
      blendFindExe: vi.fn(async () => 'C:\\fake\\blender.exe'),
      blendConvertToGlb,
    } as any

    try {
      // Fresh path so the module-level cache is empty on the first call
      const cacheTestPath = 'C:\\fake\\cached-load.blend'
      const buffer = readFixtureAsArrayBuffer(BLEND_FIXTURE)
      await loadFormat(buffer, 'blend', cacheTestPath)
      await loadFormat(buffer, 'blend', cacheTestPath)

      expect(blendConvertToGlb).toHaveBeenCalledTimes(1)
    } finally {
      window.electronAPI = originalApi
    }
  })

  it('throws BLENDER_NOT_FOUND when Blender executable is missing', async () => {
    const originalApi = window.electronAPI
    window.electronAPI = {
      ...originalApi,
      blendFindExe: vi.fn(async () => null),
      blendConvertToGlb: vi.fn(async () => new ArrayBuffer(0)),
    } as any

    try {
      const buffer = readFixtureAsArrayBuffer(BLEND_FIXTURE)
      await expect(loadFormat(buffer, 'blend', BLEND_FIXTURE)).rejects.toMatchObject({
        name: 'BLENDER_NOT_FOUND',
      })
    } finally {
      window.electronAPI = originalApi
    }
  })

  it('wraps conversion failure into a readable error', async () => {
    const originalApi = window.electronAPI
    window.electronAPI = {
      ...originalApi,
      blendFindExe: vi.fn(async () => 'C:\\fake\\blender.exe'),
      blendConvertToGlb: vi.fn(async () => { throw new Error('boom') }),
    } as any

    try {
      // Different path so the module-level GLB cache does not short-circuit
      const buffer = readFixtureAsArrayBuffer(BLEND_FIXTURE)
      await expect(loadFormat(buffer, 'blend', 'C:\\fake\\other.blend')).rejects.toThrow(
        'Blender conversion failed: boom',
      )
    } finally {
      window.electronAPI = originalApi
    }
  })

  it('requires a resource path for .blend files', async () => {
    const buffer = readFixtureAsArrayBuffer(BLEND_FIXTURE)
    await expect(loadFormat(buffer, 'blend')).rejects.toThrow(
      'require a file path',
    )
  })
})