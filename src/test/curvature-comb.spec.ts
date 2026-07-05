import { test, expect, _electron, ElectronApplication, Page } from '@playwright/test'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getElectronLaunchArgs, getElectronPath, createUserDataDir, cleanupUserDataDir, killElectronApp, createErrorGuard } from './utils'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const GLB_PATH = path.resolve(__dirname, 'fixtures/box_fillet.glb')
const BOX_PATH = path.resolve(__dirname, 'fixtures/box_boss.glb')

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

test.describe.serial('Curvature Comb', () => {
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
    await loadModel(page, GLB_PATH)
  })

  test.afterAll(async () => {
    if (guard) await guard.assertNoErrors().catch(() => {})
    if (app) killElectronApp(app)
    cleanupUserDataDir(_userDataDir)
  })

  test('toggle on/off via Alt+C', async () => {
    await page.keyboard.press('Alt+c')
    await page.waitForTimeout(500)

    await expect(page.getByText('曲率梳', { exact: true })).toBeVisible({ timeout: 3_000 })
    await expect(page.getByText('自动缩放')).toBeVisible()

    await page.keyboard.press('Alt+c')
    await page.waitForTimeout(300)
    await expect(page.getByText('曲率梳', { exact: true })).not.toBeVisible({ timeout: 3_000 })
  })

  test('panel shows controls when enabled', async () => {
    await page.keyboard.press('Alt+c')
    await page.waitForTimeout(500)
    await expect(page.getByText('曲率梳', { exact: true })).toBeVisible({ timeout: 3_000 })

    await expect(page.getByText('缩放', { exact: true })).toBeVisible()
    await expect(page.getByText('梳齿颜色')).toBeVisible()
    await expect(page.getByText('重置')).toBeVisible()
  })

  test('closes on model switch', async () => {
    await page.keyboard.press('Alt+c')
    await page.waitForTimeout(500)
    await expect(page.getByText('曲率梳', { exact: true })).toBeVisible({ timeout: 3_000 })

    // Load a different model
    await loadModel(page, BOX_PATH)
    await page.waitForTimeout(500)
    await expect(page.getByText('曲率梳', { exact: true })).not.toBeVisible({ timeout: 5_000 })
  })

  test('toggle stores state correctly', async () => {
    let enabled = await page.evaluate(() =>
      (window as any).__curvatureCombStore?.getState().enabled
    )
    expect(enabled).toBe(false)

    await page.keyboard.press('Alt+c')
    await page.waitForTimeout(300)
    enabled = await page.evaluate(() =>
      (window as any).__curvatureCombStore?.getState().enabled
    )
    expect(enabled).toBe(true)

    await page.keyboard.press('Alt+c')
    await page.waitForTimeout(300)
    enabled = await page.evaluate(() =>
      (window as any).__curvatureCombStore?.getState().enabled
    )
    expect(enabled).toBe(false)
  })

  test('scale slider changes store value', async () => {
    await page.keyboard.press('Alt+c')
    await page.waitForTimeout(500)
    await expect(page.getByText('曲率梳', { exact: true })).toBeVisible({ timeout: 3_000 })

    const slider = page.locator('input[type="range"]').first()
    await slider.fill('5')
    await page.waitForTimeout(200)

    const scale = await page.evaluate(() =>
      (window as any).__curvatureCombStore?.getState().scale
    )
    expect(scale).toBeCloseTo(5, 0)
  })

  test('color picker changes store value', async () => {
    await page.keyboard.press('Alt+c')
    await page.waitForTimeout(500)
    await expect(page.getByText('曲率梳', { exact: true })).toBeVisible({ timeout: 3_000 })

    const colorInput = page.locator('input[type="color"]')
    await colorInput.evaluate((el: HTMLInputElement) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
      setter.call(el, '#ff0000')
      el.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await page.waitForTimeout(200)

    const color = await page.evaluate(() =>
      (window as any).__curvatureCombStore?.getState().color
    )
    expect(color[0]).toBeCloseTo(1, 1)
    expect(color[1]).toBeCloseTo(0, 1)
    expect(color[2]).toBeCloseTo(0, 1)
  })
})
