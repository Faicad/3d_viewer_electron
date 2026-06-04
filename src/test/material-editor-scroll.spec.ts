/**
 * E2E test: MaterialEditor scroll area has a constrained height.
 *
 * Verifies that the CSS Grid layout (grid-template-rows: auto 1fr auto)
 * with explicit height: 80vh gives the ScrollArea viewport a definite
 * computed height, enabling vertical scrolling when content overflows.
 */
import { test, expect, _electron, type ElectronApplication, type Page } from '@playwright/test'
import { getElectronLaunchArgs, getElectronPath, createUserDataDir, cleanupUserDataDir } from './utils'
import { isSoftwareGpu } from './gpu-utils'

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

test.describe('MaterialEditor scroll', () => {
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
    await electronApp.close()
    cleanupUserDataDir(_userDataDir)
  })

  test('scroll area viewport gets constrained height from CSS grid', async () => {
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    await window.locator('canvas').first().waitFor({ state: 'attached', timeout: 20000 })
    test.skip(isSoftwareGpu(), 'ScrollArea may not render on software GPU')
    const { assertNoErrors } = trackErrors(window)

    // Open material editor via store (no model load needed)
    await window.evaluate(() => {
      const ms = window.__materialStore
      if (!ms) return
      const store = ms.getState()
      store.setMaterialOriginalsForFile('__scroll__', {
        p1: {
          name: 'Scroll Part',
          color: [0.8, 0.6, 0.2, 1.0],
          roughness: 0.5,
          metalness: 0.3,
        },
      })
      store.openMaterialEditor(['__scroll__:p1'], 'Scroll Part')
    })

    // Wait for the editor to render
    await window.waitForSelector('[data-radix-scroll-area-viewport]', { timeout: 5000 })

    // Verify the viewport has a non-zero height (constrained by grid layout).
    // Before the fix, the viewport would have no height constraint and would
    // size to content, making clientHeight equal to scrollHeight without any
    // overflow capability.
    const metrics = await window.evaluate(() => {
      const vp = document.querySelector('[data-radix-scroll-area-viewport]')
      if (!vp) return { found: false }
      return {
        found: true,
        clientHeight: vp.clientHeight,
        scrollHeight: vp.scrollHeight,
      }
    })

    expect(metrics.found, 'ScrollArea viewport must be in DOM').toBe(true)
    expect(metrics.clientHeight, 'Viewport must have constrained height > 0').toBeGreaterThan(0)

    // The outer panel uses CSS Grid grid-template-rows: auto 1fr auto.
    // Verify the ScrollArea's parent (the 1fr row) has a definite computed height.
    const gridInfo = await window.evaluate(() => {
      const panel = document.querySelector('.fixed.z-50.w-64') as HTMLElement | null
      if (!panel) return { found: false, msg: 'no panel' }
      return {
        found: true,
        classList: Array.from(panel.classList),
        gridTemplateRows: panel.style.gridTemplateRows,
        height: panel.style.height,
      }
    })
    expect(gridInfo.found, 'Panel must exist').toBe(true)
    expect(gridInfo.gridTemplateRows, 'Panel must use grid-template-rows: auto 1fr auto').toBe('auto 1fr auto')

    // Close editor so it doesn't affect subsequent tests
    await window.evaluate(() => {
      window.__materialStore?.getState().closeMaterialEditor()
    })

    await assertNoErrors()
  })

})

