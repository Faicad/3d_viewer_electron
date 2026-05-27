/**
 * E2E test: MaterialEditor layout when switching parts via scene tree context menu.
 *
 * Loads AnisotropyBarnLamp.glb, opens material editor via right-click on a part
 * in the scene tree, then switches to a second part. Verifies that after the
 * switch, the alpha mode buttons (不透明/遮罩/混合) are still visible and no
 * horizontal overflow occurs.
 */
import { test, expect, _electron, type ElectronApplication, type Page } from '@playwright/test'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getElectronPath } from './utils'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const GLB_BUFFER = readFileSync(path.join(__dirname, 'fixtures', 'AnisotropyBarnLamp.glb'))

function trackErrors(page: Page) {
  const pageErrors: string[] = []
  page.on('pageerror', (err) => pageErrors.push(String(err)))
  return {
    async assertNoErrors() {
      const appErrors = await page.evaluate(() =>
        window.__errors.map((e: Error) => `${e.message}\n${e.stack}`),
      )
      const all = [...pageErrors, ...appErrors]
      expect(all, `Unexpected errors detected:\n${all.join('\n')}`).toEqual([])
    },
  }
}

async function waitForLoadDone(page: Page, timeout = 30000) {
  await page.waitForFunction(
    () => window.__modelStore?.getState().__loadingPhase === 'done',
    { timeout },
  )
}

/** Open material editor for the part at the given index in the scene tree. */
async function openEditorForPart(page: Page, partIndex: number) {
  const partNodes = page.locator('[data-testid="scene-tree-part"]')
  await partNodes.nth(partIndex).click({ button: 'right' })
  await page.waitForTimeout(300)

  // Click "Edit Material" in the context menu
  const editBtn = page.locator('.fixed.z-\\[100\\] button').filter({ hasText: /Edit Material|编辑材质/ })
  await editBtn.click()
  await page.waitForTimeout(300)

  // Wait for material editor to appear
  await page.waitForSelector('[class*="overflow-y-auto"]', { timeout: 5000 })
}

test.describe('MaterialEditor part switch layout', () => {
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

  test('alpha mode buttons remain visible after switching parts via scene tree', async () => {
    const page = await electronApp.firstWindow()
    const { assertNoErrors } = trackErrors(page)
    await page.waitForLoadState('domcontentloaded')
    await page.locator('canvas').first().waitFor({ state: 'attached', timeout: 20000 })

    // Load the GLB model via file input (same as user would)
    await page.locator('input[type="file"]').setInputFiles({
      name: 'AnisotropyBarnLamp.glb',
      mimeType: 'model/gltf-binary',
      buffer: GLB_BUFFER,
    })
    await waitForLoadDone(page)

    // Ensure left panel is visible
    const leftPanel = page.locator('aside.border-r').first()
    await leftPanel.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(500)

    // Get part count from store
    const partCount = await page.evaluate(() => {
      const s = window.__modelStore?.getState()
      return s?.loadedFiles[0]?.glbPartInfos?.length ?? 0
    })
    expect(partCount, 'Model must have at least 2 parts').toBeGreaterThanOrEqual(2)

    // ---- Open editor for first part (lamp, has textures) ----
    await openEditorForPart(page, 0)

    // Take screenshot
    await page.screenshot({ path: 'test-results/part-switch-part1.png' })

    // Verify alpha mode buttons are all visible
    const checkButtons = async (label: string) => {
      const result = await page.evaluate(() => {
        const alphaLabels = ['不透明', '遮罩', '混合', 'OPAQUE', 'MASK', 'BLEND']
        const buttons = Array.from(document.querySelectorAll('button'))
          .filter((b) => alphaLabels.includes(b.textContent?.trim() ?? ''))
        if (buttons.length === 0) return { found: false, msg: 'No alpha mode buttons found' }

        const panel = document.querySelector('.fixed.z-50.w-64') as HTMLElement | null
        const panelRect = panel?.getBoundingClientRect()
        const panelRight = panelRect?.right ?? 0

        return {
          found: true,
          buttons: buttons.map((b) => {
            const r = b.getBoundingClientRect()
            return {
              text: b.textContent?.trim(),
              left: Math.round(r.left),
              right: Math.round(r.right),
              withinPanel: panelRect ? r.right <= panelRight + 2 : null, // 2px tolerance for border
            }
          }),
        }
      })

      console.log(`[${label}]`, JSON.stringify(result))
      expect(result.found, `${label}: Alpha mode buttons must exist`).toBe(true)
      if (result.found) {
        for (const btn of result.buttons) {
          expect(btn.withinPanel, `${label}: "${btn.text}" must be within panel bounds`).toBe(true)
        }
      }
    }

    // Check panel position
    const panelPos1 = await page.evaluate(() => {
      const p = document.querySelector('.fixed.z-50.w-64') as HTMLElement | null
      if (!p) return null
      const r = p.getBoundingClientRect()
      return { left: r.left, right: r.right, top: r.top, width: r.width }
    })
    console.log('[panel part1 rect]', JSON.stringify(panelPos1))

    await checkButtons('part1')

    // Check horizontal overflow — target the material editor panel's viewport specifically
    const overflow1 = await page.evaluate(() => {
      const panel = document.querySelector('.fixed.z-50.w-64') as HTMLElement | null
      if (!panel) return { found: false, msg: 'panel not found' }
      const vp = panel.querySelector('[class*="overflow-y-auto"]') as HTMLElement | null
      if (!vp) return { found: false, msg: 'viewport not found in panel' }
      return {
        found: true,
        clientWidth: vp.clientWidth,
        scrollWidth: vp.scrollWidth,
        overflows: vp.scrollWidth > vp.clientWidth,
      }
    })
    expect(overflow1.found, 'Viewport must exist for part1').toBe(true)
    expect(overflow1.overflows, `Part1: viewport must not overflow horizontally (scrollWidth=${overflow1.scrollWidth}, clientWidth=${overflow1.clientWidth})`).toBe(false)

    // ---- Switch to second part ----
    await openEditorForPart(page, 1)

    // Take screenshot
    await page.screenshot({ path: 'test-results/part-switch-part2.png' })

    // Check panel position after switch
    const panelPos2 = await page.evaluate(() => {
      const p = document.querySelector('.fixed.z-50.w-64') as HTMLElement | null
      if (!p) return null
      const r = p.getBoundingClientRect()
      return { left: r.left, right: r.right, top: r.top, width: r.width }
    })
    console.log('[panel part2 rect]', JSON.stringify(panelPos2))

    // Debug panel and scroll div CSS
    const diag2 = await page.evaluate(() => {
      const panel = document.querySelector('.fixed.z-50.w-64') as HTMLElement | null
      if (!panel) return { msg: 'no panel' }
      const scrollDiv = panel.querySelector('[class*="overflow-y-auto"]') as HTMLElement | null
      if (!scrollDiv) return { msg: 'no scroll div' }
      const panelCS = getComputedStyle(panel)
      const sdCS = getComputedStyle(scrollDiv)
      // Check title bar width (another grid item)
      const titleBar = panel.children[0] as HTMLElement | null
      const footer = panel.children[2] as HTMLElement | null
      return {
        panel: {
          width: panelCS.width,
          minWidth: panelCS.minWidth,
          overflow: panelCS.overflow,
        },
        gridTemplateRows: panelCS.gridTemplateRows,
        scrollDiv: { width: sdCS.width, minWidth: sdCS.minWidth },
        titleBarWidth: titleBar?.offsetWidth,
        footerWidth: footer?.offsetWidth,
        scrollDivOffsetWidth: scrollDiv.offsetWidth,
      }
    })
    console.log('[part2 diag]', JSON.stringify(diag2))

    await checkButtons('part2')
    const overflow2 = await page.evaluate(() => {
      const panel = document.querySelector('.fixed.z-50.w-64') as HTMLElement | null
      if (!panel) return { found: false, msg: 'panel not found' }
      const vp = panel.querySelector('[class*="overflow-y-auto"]') as HTMLElement | null
      if (!vp) return { found: false, msg: 'viewport not found' }
      return {
        found: true,
        clientWidth: vp.clientWidth,
        scrollWidth: vp.scrollWidth,
        overflows: vp.scrollWidth > vp.clientWidth,
      }
    })
    expect(overflow2.found, 'Viewport must exist for part2').toBe(true)
    expect(overflow2.overflows, `Part2: viewport must not overflow horizontally`).toBe(false)

    // Verify panel width is constant
    const widths = await page.evaluate(() => {
      const panel = document.querySelector('.fixed.z-50.w-64') as HTMLElement | null
      if (!panel) return { panelWidth: 0, panelScrollWidth: 0, viewportWidth: 0 }
      const vp = panel.querySelector('[class*="overflow-y-auto"]') as HTMLElement | null
      return {
        panelWidth: panel.offsetWidth,
        panelScrollWidth: panel.scrollWidth,
        viewportWidth: vp?.clientWidth ?? 0,
      }
    })
    expect(widths.panelWidth, 'Panel must be 256px (w-64)').toBe(256)
    expect(widths.panelScrollWidth, 'Must not have horizontal scroll').toBeLessThanOrEqual(256)

    console.log(`Panel: ${widths.panelWidth}px, viewport: ${widths.viewportWidth}px`)

    await assertNoErrors()
  })
})
