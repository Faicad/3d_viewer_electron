/**
 * E2E test for Model Info floating panel.
 *
 * Tests:
 * 1. Toolbar button is disabled when no model is loaded
 * 2. Clicking "模型信息" opens floating panel with model stats
 * 3. File list panel remains visible alongside floating model info
 * 4. Clicking close (X) hides the panel
 * 5. Clicking toolbar button again toggles panel back on
 */
import { test, expect, _electron, ElectronApplication, Page } from '@playwright/test'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getElectronLaunchArgs, getElectronPath, createErrorGuard, createUserDataDir, cleanupUserDataDir, type ErrorGuard } from './utils'
import { isSoftwareGpu } from './gpu-utils'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEST_GLB = readFileSync(path.join(__dirname, 'fixtures', 'test-box.glb'))

async function waitForLoadDone(page: Page, timeout = 30000) {
  await page.waitForFunction(
    () => (window as any).__modelStore?.getState().__loadingPhase === 'done',
    { timeout },
  )
}

test.describe('Model Info Panel', () => {
  let app: ElectronApplication
  let guard: ErrorGuard
  let _userDataDir: string

  test.beforeAll(async () => {
    _userDataDir = createUserDataDir()
    app = await _electron.launch({
      executablePath: getElectronPath(),
      args: getElectronLaunchArgs(),
      env: { ...process.env, E2E: '1' },
      userDataDir: _userDataDir,
    })

    const page = await app.firstWindow()
    guard = createErrorGuard(page)
    await page.waitForLoadState('domcontentloaded')
    await page.locator('canvas').first().waitFor({ state: 'attached', timeout: 20000 })
    await page.evaluate(() => { (window as any).__errors = [] })
  })

  test.afterAll(async () => {
    const page = await app.firstWindow().catch(() => null)
    if (page) {
      const sw = isSoftwareGpu()
      if (!sw) {
        await guard?.assertNoErrors()
      }
    }
    if (app) await app.close()
    cleanupUserDataDir(_userDataDir)
  })

  test('toolbar button is disabled when no model is loaded', async () => {
    const page = await app.firstWindow()
    const btn = page.locator('[data-testid="toolbar-model-info"]')
    await expect(btn).toBeVisible({ timeout: 5000 })
    await expect(btn).toBeDisabled()
  })

  test('clicking toolbar button opens floating model info panel', async () => {
    const page = await app.firstWindow()

    // Load a GLB file so model info has data to display
    await page.locator('input[type="file"]').setInputFiles({
      name: 'test-box.glb',
      mimeType: 'model/gltf-binary',
      buffer: TEST_GLB,
    })
    await waitForLoadDone(page)

    // Button should now be enabled
    const btn = page.locator('[data-testid="toolbar-model-info"]')
    await expect(btn).toBeEnabled({ timeout: 10000 })

    // Click to open model info
    await btn.click()

    // Floating panel should appear — it's a fixed div with z-50 containing "模型信息" title
    const panel = page.locator('.fixed.z-50').filter({ hasText: '模型信息' })
    await expect(panel).toBeVisible({ timeout: 5000 })

    // Verify model stats are shown
    await expect(panel.getByText('顶点数')).toBeVisible()
    await expect(panel.getByText('三角面数')).toBeVisible()
    await expect(panel.getByText('表面积')).toBeVisible()
    await expect(panel.getByText('体积')).toBeVisible()
    await expect(panel.getByText('包围盒尺寸')).toBeVisible()
    await expect(panel.getByText('部件数')).toBeVisible()
    await expect(panel.getByText('文件格式')).toBeVisible()
    await expect(panel.getByText('预估耗材')).toBeVisible()

    // Verify format is GLB (exact: true avoids matching "test-box.glb" filename)
    await expect(panel.getByText('GLB', { exact: true })).toBeVisible()
  })

  test('file list panel remains visible alongside floating model info', async () => {
    const page = await app.firstWindow()

    // Model info panel should still be open from previous test
    const modelInfoPanel = page.locator('.fixed.z-50').filter({ hasText: '模型信息' })
    await expect(modelInfoPanel).toBeVisible({ timeout: 5000 })

    // File list should also be visible in the right sidebar
    // The right panel toggle close button indicates right panel is open
    const rightPanelToggle = page.locator('button[aria-label="右侧面板"]')
    // If not visible, open it
    const isVisible = await rightPanelToggle.isVisible().catch(() => false)
    if (!isVisible) {
      const openBtn = page.locator('.lucide-panel-right-open').first()
      if (await openBtn.isVisible().catch(() => false)) {
        await openBtn.click()
      }
    }

    // File list title should be visible
    const fileListTitle = page.getByText('文件列表')
    await expect(fileListTitle).toBeVisible({ timeout: 5000 })

    // Both panels visible simultaneously — model info is floating, not replacing file list
    await expect(modelInfoPanel).toBeVisible()
    await expect(fileListTitle).toBeVisible()
  })

  test('clicking X button closes the model info panel', async () => {
    const page = await app.firstWindow()

    const panel = page.locator('.fixed.z-50').filter({ hasText: '模型信息' })
    await expect(panel).toBeVisible({ timeout: 5000 })

    // Click the X close button inside the panel
    const closeBtn = panel.locator('button').filter({ has: page.locator('.lucide-x') })
    await closeBtn.click()

    // Panel should disappear
    await expect(panel).not.toBeVisible({ timeout: 5000 })

    // File list should still be visible
    const fileListTitle = page.getByText('文件列表')
    await expect(fileListTitle).toBeVisible({ timeout: 5000 })
  })

  test('clicking toolbar button again reopens model info panel', async () => {
    const page = await app.firstWindow()

    // Panel should be closed from previous test
    const panel = page.locator('.fixed.z-50').filter({ hasText: '模型信息' })
    await expect(panel).not.toBeVisible({ timeout: 5000 })

    // Click toolbar button to reopen
    const btn = page.locator('[data-testid="toolbar-model-info"]')
    await btn.click()

    // Panel should reappear
    await expect(panel).toBeVisible({ timeout: 5000 })
    await expect(panel.getByText('顶点数')).toBeVisible()
  })
})
