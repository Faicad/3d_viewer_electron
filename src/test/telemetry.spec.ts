import { test, expect, ElectronApplication, _electron, type Page } from '@playwright/test'
import { getElectronLaunchArgs, getElectronPath, createUserDataDir, cleanupUserDataDir } from './utils'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const POSTHOG_URL = 'https://us.i.posthog.com/batch/'

/** Pass-through spy: capture PostHog batches but let requests reach real PostHog. */
async function spyPostHog(page: Page): Promise<{ batches: any[][]; stop: () => void }> {
  const batches: any[][] = []
  await page.route(POSTHOG_URL, (route) => {
    try {
      const body = JSON.parse(route.request().postData() || '{}')
      if (body.batch) batches.push(body.batch)
    } catch { /* ignore parse errors */ }
    route.continue()
  })
  return {
    batches,
    stop: () => page.unroute(POSTHOG_URL),
  }
}

/** Flatten a 2D batch array into individual event properties for easy assertion. */
function allEvents(batches: any[][]): Record<string, unknown>[] {
  return batches.flat()
}

test.describe('Telemetry', () => {
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
    if (electronApp) {
      try { await electronApp.close() } catch { /* may hang */ }
    }
    cleanupUserDataDir(_userDataDir)
  })

  test('sends app_start event with correct PostHog format', async () => {
    const window = await electronApp.firstWindow()
    // Spy must be registered BEFORE the JS bundle executes so it catches
    // the app_start flush before the PostHog request leaves the process.
    const collector = await spyPostHog(window)
    await window.waitForLoadState('domcontentloaded')
    await window.locator('canvas').first().waitFor({ state: 'attached', timeout: 20000 })

    // Wait for app_start to flush (1s debounce)
    await window.waitForTimeout(2000)

    const events = allEvents(collector.batches)
    const appStart = events.find((e: any) => e.event === 'app_start')
    expect(appStart, 'app_start event should be sent').toBeTruthy()

    // Verify PostHog event format
    expect(appStart).toHaveProperty('event')
    expect(appStart).toHaveProperty('distinct_id')
    expect(appStart).toHaveProperty('properties')
    expect(appStart).toHaveProperty('timestamp')
    expect(appStart.properties).toHaveProperty('$ip', null)
    expect(appStart.properties).toHaveProperty('data_region', 'us')
    expect(appStart.properties).toHaveProperty('deployment_mode', 'electron')
    expect(appStart.properties).toHaveProperty('locale')
    expect(appStart.properties).toHaveProperty('screen')
    expect(appStart.properties).toHaveProperty('timezone')
    expect(appStart.properties).toHaveProperty('app_version')

    // Verify distinct_id is a UUID
    expect(appStart.distinct_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    )

    // Verify timestamp is ISO 8601
    expect(appStart.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)

    collector.stop()
  })

  test('does not send events when telemetry is turned off', async () => {
    const window = await electronApp.firstWindow()
    // Spy must be registered immediately to catch any early flush.
    const collector = await spyPostHog(window)
    await window.waitForLoadState('domcontentloaded')

    // Disable telemetry via localStorage (what the Settings toggle does)
    await window.evaluate(() => {
      localStorage.setItem('3d_viewer_electron-ty:optedOut', '1')
    })

    // Wait for any in-flight events (e.g. app_start) to flush before counting.
    await window.waitForTimeout(3000)
    const countBefore = collector.batches.reduce((s, b) => s + b.length, 0)
    await window.waitForTimeout(3000)
    const countAfter = collector.batches.reduce((s, b) => s + b.length, 0)
    expect(countAfter, 'no new events after opt-out').toBe(countBefore)

    // Re-enable
    await window.evaluate(() => {
      localStorage.removeItem('3d_viewer_electron-ty:optedOut')
    })

    collector.stop()
  })

  test('tracks loadModel command events', async () => {
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    await window.locator('canvas').first().waitFor({ state: 'attached', timeout: 20000 })

    const collector = await spyPostHog(window)

    // Trigger loadModel via postMessage with invalid data to get file_load_error
    await window.evaluate(() => {
      window.postMessage({
        type: '3d-viewer',
        id: 'test-load-1',
        command: 'loadModel',
        params: {
          url: 'data:application/octet-stream;base64,' + btoa(
            String.fromCharCode(...Array.from(new Uint8Array(0)))
          ),
        },
      }, '*')
    })

    await window.waitForTimeout(3000)

    const events = allEvents(collector.batches)
    const loadStart = events.find((e: any) => e.event === 'file_load_start')
    const loadError = events.find((e: any) => e.event === 'file_load_error')

    expect(loadStart, 'file_load_start should be sent').toBeTruthy()
    expect(loadStart.properties).toHaveProperty('format')
    expect(loadError, 'file_load_error should be sent for invalid data').toBeTruthy()
    expect(loadError.properties).toHaveProperty('error')
    expect(loadError.properties).toHaveProperty('format')
    expect(loadError.properties).toHaveProperty('duration_ms')

    collector.stop()
  })
})
