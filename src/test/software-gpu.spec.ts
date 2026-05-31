/**
 * Integration test: verify window.__isSoftwareGpu correctly reflects the
 * rendering backend.
 *
 * Two independent tests — one for hardware GPU, one for software GPU.
 * Each hardcodes its own launch args and assertions.  Environment variables
 * do NOT influence the test behavior.
 *
 * Run only the hardware test:
 *   npx playwright test src/test/software-gpu.spec.ts --grep "hardware"
 *
 * Run only the software test:
 *   npx playwright test src/test/software-gpu.spec.ts --grep "software"
 */
import { test, _electron, expect } from '@playwright/test'
import { getElectronPath, killElectronApp } from './utils'
import { isSoftwareGpu } from './gpu-utils'

// ---------------------------------------------------------------------------
// Common setup helper
// ---------------------------------------------------------------------------
async function setupAndCheck(
  app: Awaited<ReturnType<typeof _electron.launch>>,
  expectedSw: boolean,
  label: string,
) {
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded', { timeout: 60000 })
  await page.locator('canvas').first().waitFor({ state: 'attached', timeout: 120000 })

  // Wait for Three.js to mount (this is where __isSoftwareGpu gets set)
  await page.waitForFunction(() => (window as any).__isSoftwareGpu !== undefined, { timeout: 30000 })

  const detected = await isSoftwareGpu(page)
  console.log(`[gpu-check] ${label}: __isSoftwareGpu = ${detected}`)

  expect(
    detected,
    `${label}: expected __isSoftwareGpu === ${expectedSw}, got ${detected}`,
  ).toBe(expectedSw)

  killElectronApp(app)
}

// ---------------------------------------------------------------------------
// Test 1: hardware GPU (no SwiftShader flag)
// ---------------------------------------------------------------------------
test('hardware GPU → __isSoftwareGpu is false', async () => {
  test.setTimeout(60000)

  const app = await _electron.launch({
    executablePath: getElectronPath(),
    args: ['--no-sandbox'],
    env: { ...process.env, E2E: '1' },
  })

  await setupAndCheck(app, false, 'hardware')
})

// ---------------------------------------------------------------------------
// Test 2: software GPU (forced via --use-angle=swiftshader)
// ---------------------------------------------------------------------------
test('--use-angle=swiftshader → __isSoftwareGpu is true', async () => {
  test.setTimeout(180000)

  const app = await _electron.launch({
    executablePath: getElectronPath(),
    args: ['--no-sandbox', '--use-angle=swiftshader'],
    env: { ...process.env, E2E: '1' },
  })

  await setupAndCheck(app, true, 'swiftshader')
})
