import { test, expect, _electron, ElectronApplication } from '@playwright/test'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getElectronLaunchArgs, getElectronPath, createUserDataDir, cleanupUserDataDir } from './utils'
import { isSoftwareGpu } from './gpu-utils'
import type { Page } from '@playwright/test'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STL_PATH = path.join(__dirname, 'fixtures', 'testdata', 'cube1.stl')

async function waitForLoadDone(page: Page, timeout = 30000) {
  await page.waitForFunction(
    () => window.__modelStore?.getState().__loadingPhase === 'done',
    { timeout },
  )
}

test.describe('noise texture on default material', () => {
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
      try { await electronApp.close() } catch { /* ok */ }
    }
    cleanupUserDataDir(_userDataDir)
  })

  test('STL mesh receives noise DataTexture via createDefaultMaterial', async () => {
    test.skip(_isSwGpu, 'STL loading may time out on software GPU')
    const page = await electronApp.firstWindow()
    const stlBuffer = readFileSync(STL_PATH)

    await page.locator('input[type="file"]').setInputFiles({
      name: 'cube1.stl',
      mimeType: 'application/octet-stream',
      buffer: stlBuffer,
    })

    await waitForLoadDone(page)

    const loaded = await page.evaluate(() => {
      const s = (window as any).__modelStore?.getState()
      return s?.loadedFiles.length >= 1 && !s?.loadingState?.isVisible
    })
    expect(loaded).toBeTruthy()

    await expect(page.locator('canvas').first()).toBeAttached({ timeout: 5_000 })

    const result = await page.evaluate(() => {
      const dev = (window as any).__r3f_dev
      if (!dev?.scene) return { ok: false, reason: '__r3f_dev not found' }

      const stlMeshes: any[] = []

      dev.scene.traverse((obj: any) => {
        if (!obj.isMesh || !obj.material) return
        const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material
        if (mat.type !== 'MeshPhysicalMaterial') return
        stlMeshes.push({
          hasMap: !!mat.map,
          mapIsDataTexture: !!(mat.map as any)?.isDataTexture,
          mapWidth: mat.map?.image?.width ?? null,
          mapHeight: mat.map?.image?.height ?? null,
          mapColorSpace: mat.map?.colorSpace ?? null,
          mapWrapS: mat.map?.wrapS ?? null,
          mapWrapT: mat.map?.wrapT ?? null,
          mapRepeat: mat.map?.repeat?.toArray() ?? null,
          color: mat.color?.getHex?.()?.toString(16) ?? null,
          roughness: mat.roughness ?? null,
          metalness: mat.metalness ?? null,
        })
      })

      if (stlMeshes.length === 0) return { ok: false, reason: 'no MeshPhysicalMaterial found' }
      return { ok: true, stlMeshes }
    })

    expect(result.ok).toBe(true)

    for (const m of result.stlMeshes!) {
      expect(m.hasMap).toBe(true)
      expect(m.mapIsDataTexture).toBe(true)
      expect(m.mapWidth).toBe(512)
      expect(m.mapHeight).toBe(512)
      expect(m.mapColorSpace).toBe('srgb-linear')
      expect(m.mapWrapS).toBe(1000)
      expect(m.mapWrapT).toBe(1000)
    }
  })
})
