import { test, expect, _electron, ElectronApplication, Page } from '@playwright/test'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getElectronLaunchArgs, getElectronPath, createUserDataDir, cleanupUserDataDir, killElectronApp, createErrorGuard } from './utils'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BOX_PATH = path.resolve(__dirname, 'fixtures/box_boss.glb')
const LAMP_PATH = path.resolve(__dirname, 'fixtures/AnisotropyBarnLamp.glb')

async function loadModel(page: Page, fixturePath: string) {
  const buffer = readFileSync(fixturePath)
  const input = page.locator('input[type="file"]')
  await input.setInputFiles({
    name: path.basename(fixturePath),
    mimeType: 'model/gltf-binary',
    buffer,
  })
  await page.waitForFunction(() => {
    const s = (window as any).__modelStore?.getState()
    return s?.loadedFiles?.length >= 1 && !s?.loadingState?.isVisible
  }, { timeout: 30_000 })
  await expect(page.locator('canvas').first()).toBeAttached({ timeout: 5_000 })
}

test.describe.serial('Cross-section', () => {
  let app: ElectronApplication
  let page: Page
  let _userDataDir: string
  let guard: ReturnType<typeof createErrorGuard>

  test.beforeAll(async () => {
    _userDataDir = createUserDataDir()
    app = await _electron.launch({
      executablePath: getElectronPath(),
      args: [...getElectronLaunchArgs(), '--in-process-gpu', '--disable-gpu-sandbox'],
      env: { ...process.env, E2E: '1' },
      userDataDir: _userDataDir,
    })
    page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    guard = createErrorGuard(page)
  })

  test.afterAll(async () => {
    if (guard) await guard.assertNoErrors().catch(() => {})
    if (app) killElectronApp(app)
    cleanupUserDataDir(_userDataDir)
  })

  test('closes on model switch and sliders reset to defaults', async () => {
    // Load first model
    await loadModel(page, BOX_PATH)
    await page.evaluate(() => (window as any).__engineStore?.getState().setStudioMode(false))
    await page.waitForTimeout(300)

    // Open cross-section via toolbar button
    await page.locator('[aria-label="剖面 (Alt+S)"]').click()
    await page.waitForTimeout(500)
    await expect(page.getByText('剖面控制')).toBeVisible({ timeout: 5_000 })

    // Set X and Y sliders to 50
    const sliders = page.locator('input[type="range"]')
    await expect(sliders).toHaveCount(3)

    await sliders.nth(0).evaluate((el) => {
      const input = el as HTMLInputElement
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
      setter.call(input, '50')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    await sliders.nth(1).evaluate((el) => {
      const input = el as HTMLInputElement
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
      setter.call(input, '50')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    await expect(sliders.nth(0)).toHaveValue('50')
    await expect(sliders.nth(1)).toHaveValue('50')

    // Load second model via IPC — file input is unmounted after the first
    // model load because the drop overlay hides itself when hasAnyModel=true.
    await page.evaluate(async (fp) => {
      const modelStore = (window as any).__modelStore
      modelStore.getState().reset()
      await (window as any).__executeCommand('loadFile', { filePath: fp })
    }, LAMP_PATH)
    await page.waitForFunction(() => {
      const s = (window as any).__modelStore?.getState()
      return s?.loadedFiles?.length >= 1 && !s?.loadingState?.isVisible
    }, { timeout: 30_000 })
    await expect(page.locator('canvas').first()).toBeAttached({ timeout: 5_000 })
    await page.evaluate(() => (window as any).__engineStore?.getState().setStudioMode(false))
    await page.waitForTimeout(300)

    // Panel should be closed on model switch
    await expect(page.getByText('剖面控制')).not.toBeVisible({ timeout: 5_000 })

    // Reopen
    await page.locator('[aria-label="剖面 (Alt+S)"]').click()
    await page.waitForTimeout(500)
    await expect(page.getByText('剖面控制')).toBeVisible({ timeout: 5_000 })

    // Verify sliders at defaults
    const sliders2 = page.locator('input[type="range"]')
    await expect(sliders2.nth(0)).toHaveValue('100')
    await expect(sliders2.nth(1)).toHaveValue('0')
    await expect(sliders2.nth(2)).toHaveValue('100')
  })
})
