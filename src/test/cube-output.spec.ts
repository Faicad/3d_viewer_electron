import { test, expect, _electron, ElectronApplication, Page } from '@playwright/test'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getElectronLaunchArgs, getElectronPath, createUserDataDir, cleanupUserDataDir } from './utils'
import { isSoftwareGpu } from './gpu-utils'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function waitForLoadDone(page: Page, timeout = 30000) {
  await page.waitForFunction(
    () => window.__modelStore?.getState().__loadingPhase === 'done',
    { timeout },
  )
}

test.describe('cube_output.glb', () => {
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
      try { await electronApp.close() } catch { /* may hang on CI */ }
    }
    cleanupUserDataDir(_userDataDir)
  })

  test('loads cube_output.glb and renders mesh', async () => {
    test.skip(_isSwGpu, 'GLB loading may time out on software GPU')
    const page = await electronApp.firstWindow()
    const glbBuffer = readFileSync(path.join(__dirname, 'fixtures', 'cube_output.glb'))

    await page.locator('input[type="file"]').setInputFiles({
      name: 'cube_output.glb',
      mimeType: 'model/gltf-binary',
      buffer: glbBuffer,
    })

    await waitForLoadDone(page)

    const loaded = await page.evaluate(() => {
      const s = (window as any).__modelStore?.getState()
      return s?.loadedFiles.length >= 1 && !s?.loadingState?.isVisible
    })
    expect(loaded).toBeTruthy()

    await expect(page.locator('canvas').first()).toBeAttached({ timeout: 5_000 })
  })
})
