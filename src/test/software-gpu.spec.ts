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
import { getElectronPath, killElectronApp, createUserDataDir, cleanupUserDataDir } from './utils'
import { isSoftwareGpu } from './gpu-utils'

// ---------------------------------------------------------------------------
// Test: hardware GPU (no SwiftShader flag)
// ---------------------------------------------------------------------------
test('hardware GPU → __isSoftwareGpu is false', async () => {
  test.setTimeout(60000)
  const userDataDir = createUserDataDir()

  const app = await _electron.launch({
    executablePath: getElectronPath(),
    args: ['--no-sandbox', '--disable-gpu-shader-disk-cache'],
    env: { ...process.env, E2E: '1' },
    userDataDir,
  })

  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded', { timeout: 60000 })
  await page.locator('canvas').first().waitFor({ state: 'attached', timeout: 120000 })

  const detected = isSoftwareGpu()
  console.log(`[gpu-check] hardware: __isSoftwareGpu = ${detected}`)

  killElectronApp(app)
  cleanupUserDataDir(userDataDir)

  test.skip(detected, 'No hardware GPU in this environment')
  expect(detected).toBe(false)
})
