/**
 * E2E test for scene tree right-click context menu.
 *
 * Reproduces the bug where right-clicking a part node in the scene tree
 * throws "Palette is not defined" because the Palette icon is used in
 * the context menu items but not imported from lucide-react.
 *
 * The fix: add Palette to the lucide-react import in DesktopLayout.tsx.
 */
import { test, expect, _electron, ElectronApplication, Page } from '@playwright/test'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getElectronPath, createErrorGuard, type ErrorGuard } from './utils'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROBOT_GLB = readFileSync(path.join(__dirname, 'fixtures', 'RobotExpressive.glb'))

async function waitForLoadDone(page: Page, timeout = 30000) {
  await page.waitForFunction(
    () => window.__modelStore?.getState().__loadingPhase === 'done',
    { timeout },
  )
}

test.describe('Scene Tree Context Menu', () => {
  let app: ElectronApplication
  let guard: ErrorGuard

  test.beforeAll(async () => {
    app = await _electron.launch({
      executablePath: getElectronPath(),
      args: ['--no-sandbox', '--ozone-platform-hint=x11'],
      env: { ...process.env, E2E: '1' },
    })
  })

  test.afterAll(async () => {
    if (app) await app.close()
  })

  test.beforeEach(async () => {
    const page = await app.firstWindow()
    guard = createErrorGuard(page)
    await page.evaluate(() => { (window as any).__errors = [] })
  })

  test.afterEach(async () => {
    await guard.assertNoErrors()
  })

  test('right-click on scene tree part node does not throw Palette error', async () => {
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.locator('canvas').first().waitFor({ state: 'attached', timeout: 20000 })

    // Load RobotExpressive.glb — has a hierarchical scene tree with part nodes
    await page.locator('input[type="file"]').setInputFiles({
      name: 'RobotExpressive.glb',
      mimeType: 'model/gltf-binary',
      buffer: ROBOT_GLB,
    })
    await waitForLoadDone(page)

    // Verify part nodes exist in the scene tree
    const partNodes = page.locator('[data-testid="scene-tree-part"]')
    expect(
      await partNodes.count(),
      'Scene tree should have at least one part node',
    ).toBeGreaterThan(0)

    // Right-click the first part node to trigger the context menu.
    // If Palette is not imported, handlePartContextMenu throws
    // "Palette is not defined" — caught by guard.assertNoErrors() in afterEach.
    await partNodes.first().click({ button: 'right' })
    await page.waitForTimeout(500)

    // Context menu should render after a successful right-click
    const menuItems = page.locator('.fixed.z-\\[100\\] button')
    expect(
      await menuItems.count(),
      'Context menu should render after right-clicking a part node',
    ).toBeGreaterThan(0)
  })
})
