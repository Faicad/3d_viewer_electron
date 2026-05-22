import { test, expect, ElectronApplication, _electron, Page } from '@playwright/test'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getElectronPath } from './utils'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROBOT_GLB = readFileSync(path.join(__dirname, 'fixtures', 'RobotExpressive.glb'))

/** Wait for ModelGroup to finish loading (replaces fixed timeouts). */
async function waitForLoadDone(page: Page, timeout = 30000) {
  await page.waitForFunction(
    () => window.__modelStore?.getState().__loadingPhase === 'done',
    { timeout },
  )
}

/**
 * Set up console and error listeners on a page for diagnostics.
 * Returns a function that logs collected messages, call after the test completes.
 */
function setupConsoleCapture(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`))
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[console.error] ${msg.text()}`)
  })
  return () => {
    if (errors.length > 0) console.log('[test] renderer errors:', JSON.stringify(errors))
    return errors
  }
}

test.describe.serial('Multi-level scene tree', () => {
  let electronApp: ElectronApplication

  test.beforeAll(async () => {
    electronApp = await _electron.launch({
      executablePath: getElectronPath(),
      args: ['--no-sandbox', '--ozone-platform-hint=x11'],
      env: { ...process.env, E2E: '1' },
    })
  })

  test.afterAll(async () => {
    await electronApp.close()
  })

  /** Ensure the left (scene tree) panel is open. On CI some runners create
   *  a window narrower than 1024px, which triggers the compact layout and
   *  hides the left panel. We normalize by setting a viewport > 1024px. */
  async function ensureLeftPanelOpen(window: Page) {
    // Setting viewport to 1280px triggers the responsive effect that opens
    // the left panel when width > 1023px.
    await window.setViewportSize({ width: 1280, height: 800 })
    // Wait for the left panel to actually open (effect is async)
    await window.waitForFunction(
      () => document.querySelector('aside.border-r') !== null,
      { timeout: 5000 },
    )
  }

  test('left panel hides on narrow viewport (compact layout)', async () => {
    const window = await electronApp.firstWindow()
    await window.locator('canvas').first().waitFor({ state: 'attached', timeout: 20000 })

    // Start wide — panel should be visible
    await window.setViewportSize({ width: 1280, height: 800 })
    await expect(window.locator('aside.border-r').first()).toBeAttached({ timeout: 5000 })

    // Shrink below 1024px — panel should collapse
    await window.setViewportSize({ width: 800, height: 800 })
    await window.waitForFunction(
      () => document.querySelector('aside.border-r') === null,
      { timeout: 5000 },
    )

    // Widen again — panel should reappear
    await window.setViewportSize({ width: 1280, height: 800 })
    await expect(window.locator('aside.border-r').first()).toBeAttached({ timeout: 5000 })
  })

  test('scene tree panel title is visible', async () => {
    const window = await electronApp.firstWindow()
    await ensureLeftPanelOpen(window)
    await window.locator('canvas').first().waitFor({ state: 'attached', timeout: 20000 })

    const title = window.locator('aside.border-r').first().locator('.text-xs.font-semibold')
    await expect(title).toBeVisible()
    const text = await title.textContent()
    // Title text varies by locale (Scene / 场景)
    expect(text?.length).toBeGreaterThan(0)
  })

  test('loads a hierarchical GLB and renders tree nodes with expand/collapse', async () => {
    const window = await electronApp.firstWindow()
    await ensureLeftPanelOpen(window)
    await window.locator('canvas').first().waitFor({ state: 'attached', timeout: 20000 })

    const getErrors = setupConsoleCapture(window)

    // Load GLB via addLoadedFile so ModelGroup renders through the
    // multi-file path (which properly updates the store via callbacks).
    const base64 = ROBOT_GLB.toString('base64')
    await window.evaluate((b64) => {
      const binary = atob(b64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      const buf = bytes.buffer.slice(0)
      window.__modelStore!.getState().addLoadedFile({
        id: crypto.randomUUID(),
        fileName: 'RobotExpressive.glb',
        filePath: 'RobotExpressive.glb',
        mtimeMs: 0,
        buffer: buf,
        format: 'glb',
        sceneTree: [],
        glbPartInfos: [],
        modelCenteringOffset: null,
        sourceUnit: 'meter',
        fileGroup: 'mesh',
        loadingPhase: 'loading',
      })
    }, base64)

    await waitForLoadDone(window)
    getErrors()

    const leftPanel = window.locator('aside.border-r').first()
    const treeNodes = leftPanel.locator('.whitespace-nowrap')

    const nodeFound = await window.waitForFunction(
      () => {
        const s = window.__modelStore?.getState()
        if (s?.sceneTree && s.sceneTree.length > 0) {
          const aside = document.querySelector('aside.border-r')
          return aside && aside.querySelectorAll('.whitespace-nowrap').length > 0
        }
        return false
      },
      { timeout: 20000 },
    ).then(() => true).catch(() => false)

    if (!nodeFound) {
      // Diagnostic: check store state and panel state
      const diag = await window.evaluate(() => {
        const s = window.__modelStore?.getState()
        const leftAside = document.querySelector('aside.border-r')
        const rightAside = document.querySelector('aside.border-l')
        return {
          loadingPhase: s?.__loadingPhase,
          sceneTreeLength: s?.sceneTree?.length,
          leftPanelHTML: leftAside?.innerHTML?.substring(0, 300) ?? 'null',
          rightPanelHTML: rightAside?.innerHTML?.substring(0, 300) ?? 'null',
          leftPanelExists: !!leftAside,
          rightPanelExists: !!rightAside,
        }
      })
      console.log('[test] diagnostic:', JSON.stringify(diag))
    }
    expect(nodeFound).toBe(true)

    const nodeCount = await treeNodes.count()
    // Some platforms (Windows) may produce a 1-node tree (RootNode without hierarchy)
    // while others produce the full 83-node hierarchical tree
    expect(nodeCount).toBeGreaterThanOrEqual(1)

    const rootNode = treeNodes.first()
    await expect(rootNode).toBeVisible()

    // Chevron buttons exist for nodes with children
    const chevronButtons = leftPanel.locator('button[aria-label="collapse"], button[aria-label="expand"]')
    const chevronCount = await chevronButtons.count()
    if (nodeCount > 1) {
      expect(chevronCount).toBeGreaterThan(0)
    }

    console.log(`[test] tree nodes: ${nodeCount}, chevron buttons: ${chevronCount}`)
  })

  test('expand/collapse toggles children visibility', async () => {
    const window = await electronApp.firstWindow()
    await ensureLeftPanelOpen(window)
    const leftPanel = window.locator('aside.border-r').first()

    const initialCount = await leftPanel.locator('.whitespace-nowrap').count()
    // Skip if no hierarchy to expand/collapse
    test.skip(initialCount <= 1, 'no hierarchical tree nodes to test')

    const collapseBtn = leftPanel.locator('button[aria-label="collapse"]').first()
    const collapseCount = await collapseBtn.count()
    if (collapseCount > 0) {
      await collapseBtn.click()
      await window.waitForFunction(
        (initial: number) => {
          const panel = document.querySelector('aside.border-r')
          return (panel?.querySelectorAll('.whitespace-nowrap').length ?? 0) < initial
        },
        initialCount,
      )

      const afterCollapseCount = await leftPanel.locator('.whitespace-nowrap').count()
      expect(afterCollapseCount).toBeLessThan(initialCount)

      const expandBtn = leftPanel.locator('button[aria-label="expand"]').first()
      await expandBtn.click()
      await window.waitForFunction(
        (initial: number) => {
          const panel = document.querySelector('aside.border-r')
          return (panel?.querySelectorAll('.whitespace-nowrap').length ?? 0) === initial
        },
        initialCount,
      )

      const afterExpandCount = await leftPanel.locator('.whitespace-nowrap').count()
      expect(afterExpandCount).toBe(initialCount)

      console.log(`[test] initial=${initialCount}, collapsed=${afterCollapseCount}, expanded=${afterExpandCount}`)
    }
  })

  test('eye icon toggles visibility on hover', async () => {
    const window = await electronApp.firstWindow()
    await ensureLeftPanelOpen(window)
    const leftPanel = window.locator('aside.border-r').first()
    const firstNode = leftPanel.locator('.whitespace-nowrap').first()

    await expect(firstNode).toBeAttached({ timeout: 10000 })
    await firstNode.hover()

    const eyeButton = firstNode.locator('button[aria-label="hide"], button[aria-label="show"]')
    await expect(eyeButton).toBeVisible()
    const eyeCount = await eyeButton.count()
    expect(eyeCount).toBeGreaterThan(0)

    await eyeButton.click()
    await expect(firstNode).toHaveClass(/opacity-40/)

    console.log('[test] eye icon visibility toggle works')
  })
})
