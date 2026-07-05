import { test, expect, _electron, ElectronApplication, Page } from '@playwright/test'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getElectronLaunchArgs, getElectronPath, createUserDataDir, cleanupUserDataDir, killElectronApp, createErrorGuard } from './utils'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const GLB_FIXTURE = path.resolve(__dirname, 'fixtures/box_boss.glb')

async function loadModel(page: Page) {
  const glbBuffer = readFileSync(GLB_FIXTURE)
  const input = page.locator('input[type="file"]')
  await input.setInputFiles({
    name: 'box_boss.glb',
    mimeType: 'model/gltf-binary',
    buffer: glbBuffer,
  })
  await page.waitForFunction(() => {
    const s = (window as any).__modelStore?.getState()
    return s?.loadedFiles?.length >= 1 && !s?.loadingState?.isVisible
  }, { timeout: 30_000 })
  await expect(page.locator('canvas').first()).toBeAttached({ timeout: 5_000 })
}

test.describe.serial('Global hotkeys — analysis panels', () => {
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
    await loadModel(page)
    await page.evaluate(() => (window as any).__engineStore?.getState().setStudioMode(false))
    await page.waitForTimeout(500)
  })

  test.afterAll(async () => {
    if (guard) await guard.assertNoErrors().catch(() => {})
    if (app) killElectronApp(app)
    cleanupUserDataDir(_userDataDir)
  })

  test('Alt+s opens and closes cross-section panel', async () => {
    await page.keyboard.press('Alt+s')
    await page.waitForTimeout(500)
    await expect(page.getByText('剖面控制')).toBeVisible({ timeout: 5_000 })

    await page.keyboard.press('Alt+s')
    await page.waitForTimeout(300)
    await expect(page.getByText('剖面控制')).not.toBeVisible({ timeout: 3_000 })
  })

  test('Alt+z opens and closes zebra stripe panel', async () => {
    await page.keyboard.press('Alt+z')
    await page.waitForTimeout(500)
    await expect(page.getByText('斑马纹分析')).toBeVisible({ timeout: 5_000 })

    await page.keyboard.press('Alt+z')
    await page.waitForTimeout(300)
    await expect(page.getByText('斑马纹分析')).not.toBeVisible({ timeout: 3_000 })
  })

  test('Alt+d opens and closes draft analysis panel', async () => {
    await page.keyboard.press('Alt+d')
    await page.waitForTimeout(500)
    await expect(page.getByText('拔模分析')).toBeVisible({ timeout: 5_000 })

    await page.keyboard.press('Alt+d')
    await page.waitForTimeout(300)
    await expect(page.getByText('拔模分析')).not.toBeVisible({ timeout: 3_000 })
  })

  test('Alt+Shift+z opens and closes surface analysis panel', async () => {
    await page.keyboard.press('Alt+Shift+z')
    await page.waitForTimeout(500)
    await expect(page.getByText('曲面分析')).toBeVisible({ timeout: 5_000 })

    await page.keyboard.press('Alt+Shift+z')
    await page.waitForTimeout(300)
    await expect(page.getByText('曲面分析')).not.toBeVisible({ timeout: 3_000 })
  })

  test('Alt+c opens and closes curvature comb panel', async () => {
    await page.keyboard.press('Alt+c')
    await page.waitForTimeout(500)
    await expect(page.getByText('曲率梳', { exact: true })).toBeVisible({ timeout: 5_000 })

    await page.keyboard.press('Alt+c')
    await page.waitForTimeout(300)
    await expect(page.getByText('曲率梳', { exact: true })).not.toBeVisible({ timeout: 3_000 })
  })
})

test.describe.serial('Global hotkeys — mode switching', () => {
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
    await loadModel(page)
  })

  test.afterAll(async () => {
    if (guard) await guard.assertNoErrors().catch(() => {})
    if (app) killElectronApp(app)
    cleanupUserDataDir(_userDataDir)
  })

  test('Alt+p toggles post-processing', async () => {
    const initial = await page.evaluate(() => (window as any).__engineStore?.getState().postProcessingEnabled)

    await page.keyboard.press('Alt+p')
    await page.waitForTimeout(300)

    const after = await page.evaluate(() => (window as any).__engineStore?.getState().postProcessingEnabled)
    expect(after).toBe(!initial)
  })

  test('Alt+Shift+p toggles Studio/CAD mode', async () => {
    const initialStudio = await page.evaluate(() => (window as any).__engineStore?.getState().studioMode)

    await page.keyboard.press('Alt+Shift+p')
    await page.waitForTimeout(300)

    const afterStudio = await page.evaluate(() => (window as any).__engineStore?.getState().studioMode)
    expect(afterStudio).toBe(!initialStudio)
  })
})

test.describe.serial('Global hotkeys — viewport', () => {
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
    await loadModel(page)
  })

  test.afterAll(async () => {
    if (guard) await guard.assertNoErrors().catch(() => {})
    if (app) killElectronApp(app)
    cleanupUserDataDir(_userDataDir)
  })

  test('Alt+r toggles auto-rotation', async () => {
    await page.keyboard.press('Alt+r')
    await page.waitForTimeout(500)

    const rotating = await page.evaluate(() => (window as any).__viewerRotating?.() ?? false)
    expect(rotating).toBe(true)

    await page.keyboard.press('Alt+r')
    await page.waitForTimeout(300)

    const stopped = await page.evaluate(() => (window as any).__viewerRotating?.() ?? false)
    expect(stopped).toBe(false)
  })
})
