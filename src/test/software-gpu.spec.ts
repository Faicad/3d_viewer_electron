/**
 * Integration test: verify window.__isSoftwareGpu correctly reflects the
 * rendering backend.
 *
 * The renderer (ViewportContainer.tsx) computes window.__isSoftwareGpu
 * during Three.js initialization.  This single test adapts to the
 * E2E_NO_GPU environment variable:
 *
 *   npx playwright test src/test/software-gpu.spec.ts           # hardware GPU
 *   E2E_NO_GPU=1 npx playwright test src/test/software-gpu.spec.ts  # software GPU
 *
 * Run both to validate both code paths.
 */
import { test, _electron, expect } from '@playwright/test'
import { getElectronPath, getElectronLaunchArgs, killElectronApp } from './utils'
import { isSoftwareGpu } from './gpu-utils'

test('window.__isSoftwareGpu matches GPU mode', async () => {
  const expectSoftware = process.env.E2E_NO_GPU === '1'
  const label = expectSoftware ? 'software' : 'hardware'

  test.setTimeout(expectSoftware ? 180000 : 60000)

  console.log(`[gpu-check] mode: ${label}`)
  const app = await _electron.launch({
    executablePath: getElectronPath(),
    args: getElectronLaunchArgs(), // E2E_NO_GPU=1 → --use-angle=swiftshader
    env: { ...process.env, E2E: '1' },
  })

  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded', { timeout: expectSoftware ? 60000 : 15000 })
  await page.locator('canvas').first().waitFor({ state: 'attached', timeout: expectSoftware ? 120000 : 30000 })

  // Wait for Three.js to mount (this is where __isSoftwareGpu gets set)
  await page.waitForFunction(() => (window as any).__isSoftwareGpu !== undefined, { timeout: 30000 })

  const detected = await isSoftwareGpu(page)
  console.log(`[gpu-check] __isSoftwareGpu: ${detected}`)

  expect(
    detected,
    `Expected __isSoftwareGpu === ${expectSoftware} (mode: ${label})`,
  ).toBe(expectSoftware)

  killElectronApp(app)
  console.log(`[gpu-check] ${label} ✅`)
})
