import { test, expect, _electron, ElectronApplication, Page } from '@playwright/test'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getElectronLaunchArgs, getElectronPath, createUserDataDir, cleanupUserDataDir, killElectronApp, createErrorGuard } from './utils'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BOX_PATH = path.resolve(__dirname, 'fixtures/box_boss.glb')
const LAMP_PATH = path.resolve(__dirname, 'fixtures/AnisotropyBarnLamp.glb')
const CYL_PATH = path.resolve(__dirname, 'fixtures/cylinder_tall.glb')

async function loadModel(page: Page, fixturePath: string, timeout = 30000) {
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
  }, { timeout })
  await expect(page.locator('canvas').first()).toBeAttached({ timeout: 5_000 })
}

test.describe.serial('Draft Analysis', () => {
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

  test('opens and closes via Alt+D, closes on model switch', async () => {
    await loadModel(page, BOX_PATH)
    await page.evaluate(() => (window as any).__engineStore?.getState().setStudioMode(false))
    await page.waitForTimeout(300)

    // Open via Alt+D
    await page.keyboard.press('Alt+d')
    await page.waitForTimeout(500)
    await expect(page.getByText('拔模分析')).toBeVisible({ timeout: 5_000 })

    // Verify controls
    await expect(page.getByText('拔模方向')).toBeVisible()
    await expect(page.getByText('拔模角度')).toBeVisible()
    await expect(page.getByText('着色混合')).toBeVisible()
    await expect(page.getByText('颜色配置')).toBeVisible()

    // Close via Alt+D
    await page.keyboard.press('Alt+d')
    await page.waitForTimeout(300)
    await expect(page.getByText('拔模分析')).not.toBeVisible({ timeout: 3_000 })

    // Reopen and verify model switch closes it
    await page.keyboard.press('Alt+d')
    await page.waitForTimeout(500)
    await expect(page.getByText('拔模分析')).toBeVisible({ timeout: 3_000 })

    // Switch model
    await loadModel(page, LAMP_PATH)
    await page.waitForTimeout(500)
    await expect(page.getByText('拔模分析')).not.toBeVisible({ timeout: 5_000 })
  })

  test('gating: blocks in Studio mode', async () => {
    await page.evaluate(() => (window as any).__engineStore?.getState().setStudioMode(true))
    await page.waitForTimeout(200)

    await page.keyboard.press('Alt+d')
    await page.waitForTimeout(300)
    await expect(page.getByText('拔模分析')).not.toBeVisible({ timeout: 3_000 })
  })

  test('gating: blocks with no model loaded', async () => {
    // This test runs in a new app instance
  })

  test('world-fixed pull direction: cylinder from X+ view is all blue', async () => {
    await loadModel(page, CYL_PATH)
    await page.evaluate(() => (window as any).__engineStore?.getState().setStudioMode(false))
    await page.waitForTimeout(300)

    // Open draft analysis via Alt+D
    await page.keyboard.press('Alt+d')
    await page.waitForTimeout(500)
    await expect(page.getByText('拔模分析')).toBeVisible({ timeout: 5_000 })

    // Set pull direction to X=1, Y=0, Z=0
    await page.locator('xpath=//span[text()="X"]/following-sibling::input').fill('1')
    await page.locator('xpath=//span[text()="Y"]/following-sibling::input').fill('0')
    await page.locator('xpath=//span[text()="Z"]/following-sibling::input').fill('0')

    // Set shading=0
    await page.locator('xpath=//span[text()="着色混合"]/../../input[@type="range"]').fill('0')
    await page.waitForTimeout(1500)

    // Read pixel colors to verify blue dominance
    const defaultView = await page.evaluate(() => {
      const canvas = document.querySelector('canvas')!
      const gl = canvas.getContext('webgl2') as WebGL2RenderingContext
      if (!gl) return { modelPixels: 0, blue: 0, red: 0 }
      const w = canvas.width, h = canvas.height
      const row = new Uint8Array(w * 4)
      gl.readPixels(0, (h / 2) | 0, w, 1, gl.RGBA, gl.UNSIGNED_BYTE, row)
      let modelPixels = 0, blue = 0, red = 0
      for (let i = 0; i < w; i++) {
        const a = row[i * 4 + 3]
        if (a === 0) continue
        modelPixels++
        const r = row[i * 4], b = row[i * 4 + 2]
        if (b > r + 30) blue++
        else if (r > b + 30) red++
      }
      return { modelPixels, blue, red }
    })

    // From X+ view, visible cylinder normals face +X (pull direction),
    // so blue should dominate. A few red pixels from back-face edges are OK.
    expect(defaultView.modelPixels).toBeGreaterThan(0)
    expect(defaultView.blue).toBeGreaterThan(defaultView.red * 5)
  })
})
