import { test, expect, _electron, ElectronApplication, Page } from '@playwright/test'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getElectronLaunchArgs, getElectronPath, createUserDataDir, cleanupUserDataDir } from './utils'
import { isSoftwareGpu } from './gpu-utils'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const IFC_FIXTURE = readFileSync(path.join(__dirname, 'fixtures', 'haus.ifc'))

function trackErrors(page: Page) {
  const pageErrors: string[] = []
  page.on('pageerror', (err) => pageErrors.push(String(err)))
  return {
    async assertNoErrors() {
      const appErrors = await page.evaluate(() =>
        window.__errors.map((e) => `${e.message}\n${e.stack}`),
      )
      const all = [...pageErrors, ...appErrors]
      expect(all, `Unexpected errors detected:\n${all.join('\n')}`).toEqual([])
    },
  }
}

async function waitForLoadDone(page: Page, timeout = 60000) {
  await page.waitForFunction(
    () => window.__modelStore?.getState().__loadingPhase === 'done',
    { timeout },
  )
}

test.describe('3D Viewer Electron - IFC Loading', () => {
  let electronApp: ElectronApplication
  let _userDataDir: string

  test.beforeAll(async () => {
    _userDataDir = createUserDataDir()
    electronApp = await _electron.launch({
      executablePath: getElectronPath(),
      args: getElectronLaunchArgs(),
      env: { ...process.env, E2E: '1' },
      userDataDir: _userDataDir,
    })
  })

  test.afterAll(async () => {
    if (electronApp) {
      try { await electronApp.close() } catch { /* may hang on CI */ }
    }
    cleanupUserDataDir(_userDataDir)
  })

  test('app starts and renders canvas', async () => {
    const window = await electronApp.firstWindow()
    const { assertNoErrors } = trackErrors(window)
    await window.waitForLoadState('domcontentloaded')
    await window.locator('canvas').first().waitFor({ state: 'attached', timeout: 20000 })
    expect(await window.locator('canvas').count()).toBeGreaterThan(0)
    await assertNoErrors()
  })

  test('loads haus.ifc and renders parts in scene tree', async () => {
    const window = await electronApp.firstWindow()
    test.skip(isSoftwareGpu(), 'WebGL2 thumbnail generation fails on CI / software GPU')
    const { assertNoErrors } = trackErrors(window)

    await window.locator('input[type="file"]').setInputFiles({
      name: 'haus.ifc',
      mimeType: 'application/octet-stream',
      buffer: IFC_FIXTURE,
    })

    await waitForLoadDone(window, 120000)

    const file = await window.evaluate(() => {
      const files = window.__modelStore.getState().loadedFiles
      return files[files.length - 1]
    })
    expect(file.fileName).toContain('haus.ifc')
    expect(file.format).toBe('ifc')
    expect(file.sourceUnit).toBe('meter')
    expect(file.fileGroup).toBe('bim')

    const partInfos = await window.evaluate(() =>
      window.__modelStore.getState().glbPartInfos.length,
    )
    expect(partInfos).toBeGreaterThan(50)

    await expect(window.locator('canvas').first()).toBeAttached({ timeout: 10000 })
    await expect(window.locator('[data-testid="scene-tree-part"]').first()).toBeAttached({ timeout: 10000 })

    await assertNoErrors()
  })
})
