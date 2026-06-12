/**
 * E2E: SCAD → export STL → re-import round-trip.
 *
 * Regression test for the bug where exporting a SCAD-generated model as STL
 * produced a file containing source code instead of STL binary (root cause:
 * STLExporter returns DataView, not ArrayBuffer — DataView fails instanceof
 * ArrayBuffer, falling through to TextEncoder path).
 *
 * Flow:
 *   1. Load test.scad fixture via file input
 *   2. Wait for model to appear in scene
 *   3. Evaluate STLExporter in-page → get STL ArrayBuffer → base64
 *   4. Verify the STL is valid binary (≥84 bytes, not SCAD source)
 *   5. Write the STL to a temp file
 *   6. Reset + load the exported STL via file input
 *   7. Wait for model to appear in scene
 *   8. Assert no errors throughout
 */

import { test, expect, _electron, ElectronApplication, Page } from '@playwright/test'
import { readFileSync, writeFileSync, unlinkSync } from 'fs'
import path from 'path'
import { tmpdir } from 'os'
import { fileURLToPath } from 'url'
import { getElectronLaunchArgs, getElectronPath, createUserDataDir, cleanupUserDataDir } from './utils'
import { isSoftwareGpu } from './gpu-utils'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES_DIR = path.join(__dirname, 'fixtures')
const SCAD_FIXTURE = path.join(FIXTURES_DIR, 'test.scad')

/** Collect page + app errors and fail on any. */
function trackErrors(page: Page) {
  const pageErrors: string[] = []
  page.on('pageerror', (err) => pageErrors.push(String(err)))
  return {
    async assertNoErrors() {
      const appErrors = await page.evaluate(() =>
        (window as any).__errors?.map((e: any) => `${e.message}\n${e.stack}`) ?? [],
      )
      const all = [...pageErrors, ...appErrors]
      // Clear app errors after check so they don't carry over
      await page.evaluate(() => { (window as any).__errors = [] })
      expect(all, `Unexpected errors:\n${all.join('\n')}`).toEqual([])
    },
  }
}

/** Wait for ModelGroup loading phase to reach 'done'. */
async function waitForLoadDone(page: Page, timeout = 30000) {
  await page.waitForFunction(
    () => (window as any).__modelStore?.getState().__loadingPhase === 'done',
    { timeout },
  )
}

/** Count meshes in the R3F scene. */
async function sceneMeshCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const dev = (window as any).__r3f_dev
    if (!dev?.scene) return 0
    let count = 0
    dev.scene.traverse((obj: any) => {
      if (obj?.isMesh) count++
    })
    return count
  })
}

test.describe('Export → Import round-trip', () => {
  let electronApp: ElectronApplication
  let _userDataDir: string
  let _isSwGpu = false

  test.beforeAll(async () => {
    _userDataDir = createUserDataDir()
    electronApp = await _electron.launch({
      executablePath: getElectronPath(),
      args: getElectronLaunchArgs(),
      env: { ...process.env, E2E: '1' },
      userDataDir: _userDataDir,
    })
    const page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.locator('canvas').first().waitFor({ state: 'attached', timeout: 20000 })
    _isSwGpu = isSoftwareGpu()
  })

  test.afterAll(async () => {
    if (electronApp) {
      try { await electronApp.close() } catch { /* CI cleanup */ }
    }
    cleanupUserDataDir(_userDataDir)
  })

  test('SCAD → STL → re-import round-trip with no errors', async () => {
    test.skip(_isSwGpu, 'Skipped on software GPU — no WebGL2')
    test.setTimeout(90000)

    const page = await electronApp.firstWindow()
    const { assertNoErrors } = trackErrors(page)

    // ── Step 1: load SCAD fixture ──
    const scadBuffer = readFileSync(SCAD_FIXTURE)
    await page.locator('input[type="file"]').setInputFiles({
      name: 'test.scad',
      mimeType: 'text/plain',
      buffer: scadBuffer,
    })

    await waitForLoadDone(page)

    // The SCAD file should have loaded and produced meshes in the scene
    const meshCountAfterScad = await sceneMeshCount(page)
    expect(meshCountAfterScad, 'SCAD model should produce meshes').toBeGreaterThan(0)

    // ── Step 2: confirm scene has valid mesh data ──
    // Before exporting, verify the scene's userData.partId exists
    // (needed by collectFileMeshes for single-file export)
    const partIds = await page.evaluate(() => {
      const dev = (window as any).__r3f_dev
      if (!dev?.scene) return []
      const ids: string[] = []
      dev.scene.traverse((obj: any) => {
        if (obj?.isMesh && obj.userData?.partId) ids.push(obj.userData.partId)
      })
      return ids
    })
    expect(partIds.length, 'Meshes should have partId in userData').toBeGreaterThan(0)

    // ── Step 3: export STL via window.__exportSceneToStlBase64 ──
    const exportResult: { ok: boolean; data?: string; byteLength?: number; error?: string } =
      await page.evaluate(async () => {
        try {
          const result = await (window as any).__exportSceneToStlBase64()
          return { ok: true, ...result }
        } catch (e: any) {
          return { ok: false, error: e.message ?? String(e) }
        }
      })

    expect(exportResult.ok, `Export should succeed: ${exportResult.error ?? ''}`).toBe(true)
    expect(exportResult.byteLength!).toBeGreaterThanOrEqual(84)

    // ── Step 4: verify exported STL is valid binary ──
    const stlBytes = Buffer.from(exportResult.data!, 'base64')
    expect(stlBytes.length, 'Decoded byteLength should match').toBe(exportResult.byteLength!)

    // STL binary header: 80 bytes + 4 bytes triangle count (uint32 LE)
    const stlView = new DataView(stlBytes.buffer, stlBytes.byteOffset, stlBytes.byteLength)
    const triangleCount = stlView.getUint32(80, true)
    expect(triangleCount, 'STL should contain triangles').toBeGreaterThan(0)

    // Must NOT contain SCAD source code
    const stlText = stlBytes.subarray(0, Math.min(stlBytes.length, 256)).toString('utf-8')
    expect(stlText, 'STL must not contain SCAD source').not.toContain('cube(')
    expect(stlText, 'STL must not contain OpenSCAD keywords').not.toContain('module ')

    // ── Step 5: write exported STL to temp file ──
    const tmpStlPath = path.join(tmpdir(), `e2e-exported-${Date.now()}.stl`)
    writeFileSync(tmpStlPath, stlBytes)

    // ── Step 6: reset and load the exported STL ──
    await page.evaluate(() => {
      (window as any).__modelStore?.getState().reset()
    })
    await page.waitForTimeout(500)

    // Clear errors before loading the exported STL
    await page.evaluate(() => { (window as any).__errors = [] })

    const exportedStlBuffer = readFileSync(tmpStlPath)
    await page.locator('input[type="file"]').setInputFiles({
      name: 'exported.stl',
      mimeType: 'model/stl',
      buffer: exportedStlBuffer,
    })

    await waitForLoadDone(page)

    // ── Step 7: verify re-imported STL renders meshes ──
    const meshCountAfterReimport = await sceneMeshCount(page)
    expect(meshCountAfterReimport, 'Re-imported STL should produce meshes').toBeGreaterThan(0)

    // No errors during the entire process
    await assertNoErrors()

    // Cleanup temp file
    try { unlinkSync(tmpStlPath) } catch { /* ignore */ }
  })
})
