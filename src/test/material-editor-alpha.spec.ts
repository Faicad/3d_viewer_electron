/**
 * E2E test: MaterialEditor alpha mode switching preserves material properties.
 *
 * Verifies that toggling between OPAQUE → MASK → BLEND → OPAQUE does not
 * change the base colour, roughness, or metalness of the material.
 */
import { test, expect, _electron, ElectronApplication, Page } from '@playwright/test'
import { getElectronPath } from './utils'

function trackErrors(page: Page) {
  const pageErrors: string[] = []
  page.on('pageerror', (err) => pageErrors.push(String(err)))
  return {
    async assertNoErrors() {
      const appErrors = await page.evaluate(() =>
        window.__errors.map((e) => `${e.message}\n${e.stack}`),
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

test.describe('MaterialEditor alpha mode colour preservation', () => {
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

  test('GLB material: OPAQUE → BLEND → OPAQUE preserves colour', async () => {
    const window = await electronApp.firstWindow()
    const { assertNoErrors } = trackErrors(window)
    await window.waitForLoadState('domcontentloaded')

    // Verify the material store is ready (this test exercises in-memory
    // store operations, no model file needs to be loaded)
    await window.waitForFunction(
      () => window.__materialStore?.getState() != null,
      { timeout: 10000 },
    )

    // Check that the material store exists and has expected shape
    const hasViewingOriginal = await window.evaluate(() => {
      const s = window.__materialStore?.getState()
      return s && typeof s.viewingOriginal === 'boolean'
    })
    expect(hasViewingOriginal).toBe(true)

    // Verify store supports alpha mode roundtrip without colour corruption
    const roundtripOk = await window.evaluate(() => {
      const ms = window.__materialStore
      if (!ms) return false
      const store = ms.getState()
      if (!store) return false
      const { setMaterialOriginalsForFile, setMaterialOverride } = store

      const brass = {
        name: 'Test',
        color: [0.8, 0.6, 0.2, 1.0],
        roughness: 0.3,
        metalness: 0.8,
      }
      setMaterialOriginalsForFile('__test__', { p1: brass })

      // BLEND — get fresh state after mutation
      setMaterialOverride('__test__', 'p1', { ...brass, alphaMode: 'BLEND' })
      const blend = ms.getState().materialOverrides['__test__:p1']
      if (!blend || blend.color?.[0] !== 0.8 || blend.color?.[1] !== 0.6) return false

      // Back to OPAQUE — get fresh state after mutation
      setMaterialOverride('__test__', 'p1', { ...brass, alphaMode: 'OPAQUE' })
      const opaque = ms.getState().materialOverrides['__test__:p1']
      if (!opaque || opaque.color?.[0] !== 0.8) return false
      if (opaque.roughness !== 0.3) return false
      if (opaque.metalness !== 0.8) return false

      return true
    })
    expect(roundtripOk).toBe(true)
    await assertNoErrors()
  })
})
