/**
 * E2E test for GLTF animation player.
 *
 * Tests:
 * 1. Loading RobotExpressive.glb — animations extracted, button appears
 * 2. Clicking "播放动画" opens dialog with playing animation
 * 3. Scene tree context menu shows "播放动画" for animated files
 * 4. Closing dialog resets animation store
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
    () => (window as any).__modelStore?.getState().__loadingPhase === 'done',
    { timeout },
  )
}

test.describe('Animation Player', () => {
  let app: ElectronApplication
  let guard: ErrorGuard

  test.beforeAll(async () => {
    app = await _electron.launch({
      executablePath: getElectronPath(),
      args: ['--no-sandbox', '--ozone-platform-hint=x11'],
      env: { ...process.env, E2E: '1' },
    })

    // Load RobotExpressive.glb once before all tests
    const page = await app.firstWindow()
    guard = createErrorGuard(page)
    await page.waitForLoadState('domcontentloaded')
    await page.locator('canvas').first().waitFor({ state: 'attached', timeout: 20000 })
    await page.evaluate(() => { (window as any).__errors = [] })

    await page.locator('input[type="file"]').setInputFiles({
      name: 'RobotExpressive.glb',
      mimeType: 'model/gltf-binary',
      buffer: ROBOT_GLB,
    })
    await waitForLoadDone(page)
  })

  test.afterAll(async () => {
    await guard?.assertNoErrors()
    if (app) await app.close()
  })

  test('shows Play Animation toolbar button when animated file is loaded', async () => {
    const page = await app.firstWindow()
    // Toolbar icon with aria-label, enabled when file has animations
    const playBtn = page.locator('[data-testid="toolbar-animation-player"]')
    await expect(playBtn).toBeVisible({ timeout: 5000 })
    await expect(playBtn).toBeEnabled({ timeout: 5000 })

    // Verify animations stored in model
    const hasAnimations = await page.evaluate(() => {
      const store = (window as any).__modelStore?.getState()
      return store?.loadedFiles?.some((f: any) => f.animations?.length > 0) ?? false
    })
    expect(hasAnimations).toBe(true)
  })

  test('clicking Play Animation button opens dialog and plays animation', async () => {
    const page = await app.firstWindow()

    // Click toolbar animation button
    await page.locator('[data-testid="toolbar-animation-player"]').click()

    // Wait for dialog to appear
    await page.locator('[role="dialog"]').waitFor({ state: 'visible', timeout: 5000 })

    // Verify animation store has clips loaded
    const clipCount = await page.evaluate(() => {
      const store = (window as any).__animationStore?.getState()
      return store?.clips?.length ?? 0
    })
    expect(clipCount, 'Animation store should have clips').toBeGreaterThan(0)

    // Verify animation is playing (currentTime advances)
    const t0 = await page.evaluate(() => {
      return (window as any).__animationStore?.getState().currentTime ?? 0
    })
    await page.waitForTimeout(2000)
    const t1 = await page.evaluate(() => {
      return (window as any).__animationStore?.getState().currentTime ?? 0
    })
    expect(t1, 'Animation time should advance').toBeGreaterThan(t0)

    // Close dialog
    const dialog = page.locator('[role="dialog"]')
    const xBtn = dialog.locator('button svg.lucide-x').first()
    await xBtn.click()

    // After close, clips should be empty
    await page.waitForTimeout(500)
    const clipsAfterClose = await page.evaluate(() => {
      return (window as any).__animationStore?.getState().clips?.length ?? -1
    })
    expect(clipsAfterClose, 'Animation store should be reset after close').toBe(0)
  })

  // FIXME: restart after LoopOnce completion needs investigation
  test.skip('restarts from beginning after non-repeat clip finishes', async () => {
    const page = await app.firstWindow()

    await page.locator('[data-testid="toolbar-animation-player"]').click()
    await page.locator('[role="dialog"]').waitFor({ state: 'visible', timeout: 5000 })

    // Select a short clip (Walking ~1.0s)
    await page.locator('[role="dialog"] select').first().selectOption('Walking (1.0s)')

    // Turn off repeat
    const repeatBtn = page.locator('[role="dialog"] button', { hasText: '⟳' })
    await repeatBtn.click()

    // Wait for clip to finish (Walking is 1.0s, wait 3s to be safe)
    await page.waitForTimeout(3000)

    // Verify stopped
    const stopped = await page.evaluate(() =>
      (window as any).__animationStore?.getState().isPlaying === false,
    )
    expect(stopped, 'Should have stopped').toBe(true)

    // Click play/pause to restart
    const playPauseBtn = page.locator('[role="dialog"] button').filter({ has: page.locator('.lucide-play, .lucide-pause') })
    await playPauseBtn.click()
    await page.waitForTimeout(1500)

    // Time must advance
    const t1 = await page.evaluate(() =>
      (window as any).__animationStore?.getState().currentTime ?? 0,
    )
    const stillPlaying = await page.evaluate(() =>
      (window as any).__animationStore?.getState().isPlaying,
    )
    expect(stillPlaying, 'Should be playing after restart').toBe(true)
    expect(t1, 'Time should advance after restart').toBeGreaterThan(0)

    await page.locator('[role="dialog"]').locator('svg.lucide-x').first().click()
    await page.waitForTimeout(500)
  })

  test('scene tree right-click menu shows Play Animation for animated file', async () => {
    const page = await app.firstWindow()

    // Right-click the file node in the scene tree
    const fileNode = page.locator('[data-testid="scene-tree-file"]').first()
    await expect(fileNode, 'Scene tree file node should exist').toBeVisible({ timeout: 5000 })
    await fileNode.click({ button: 'right' })
    await page.waitForTimeout(500)

    // Context menu should appear with "播放动画" option
    const ctxMenu = page.locator('.fixed.z-\\[100\\]')
    await expect(ctxMenu, 'Context menu should appear').toBeVisible({ timeout: 3000 })
    const menuItem = ctxMenu.getByText('播放动画')
    await expect(menuItem, 'Context menu should show 播放动画').toBeVisible({ timeout: 3000 })
  })
})
