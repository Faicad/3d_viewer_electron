/**
 * Sequential file loading via the "Open File" dialog button.
 *
 * Verifies that loading a file, then opening another via the toolbar
 * "Open File" dialog correctly resets state and loads the new file.
 * The native OS file dialog cannot be automated in Playwright, so we
 * simulate the same code path: reset() + load via file input.
 */
import { test, expect, ElectronApplication, _electron, Page } from '@playwright/test'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getElectronLaunchArgs, getElectronPath, createUserDataDir, cleanupUserDataDir } from './utils'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES_DIR = path.join(__dirname, 'fixtures')
const BOX_BOSS_GLB = readFileSync(path.join(FIXTURES_DIR, 'box_boss.glb'))
const VISE_3MF = readFileSync(path.join(FIXTURES_DIR, 'vise', 'vise.3mf'))

function trackErrors(page: Page) {
  const pageErrors: string[] = []
  page.on('pageerror', (err) => pageErrors.push(String(err)))
  return {
    async assertNoErrors() {
      const appErrors = await page.evaluate(() =>
        window.__errors.map((e: any) => `${e.message}\n${e.stack}`),
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

test.describe('Sequential load via Open File dialog', () => {
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
    if (electronApp) await electronApp.close()
    cleanupUserDataDir(_userDataDir)
  })

  test('app starts and renders canvas', async () => {
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    await window.locator('canvas').first().waitFor({ state: 'attached', timeout: 20000 })
    expect(await window.locator('canvas').count()).toBeGreaterThan(0)
  })

  test('1) load box_boss.glb and confirm rendering', async () => {
    test.setTimeout(30000)
    const window = await electronApp.firstWindow()
    const { assertNoErrors } = trackErrors(window)
    await window.locator('canvas').first().waitFor({ state: 'attached', timeout: 20000 })

    // Ensure clean state
    await window.evaluate(() => window.__modelStore?.getState().reset())

    await window.locator('input[type="file"]').setInputFiles({
      name: 'box_boss.glb',
      mimeType: 'model/gltf-binary',
      buffer: BOX_BOSS_GLB,
    })

    await waitForLoadDone(window)
    await assertNoErrors()

    // Verify meshes in scene
    const meshCount = await window.evaluate(() => {
      const dev = window.__r3f_dev
      if (!dev?.scene) return 0
      let count = 0
      dev.scene.traverse((obj: any) => { if (obj?.isMesh) count++ })
      return count
    })
    console.log('[test] box_boss.glb mesh count:', meshCount)
    expect(meshCount).toBeGreaterThan(0)

    // Verify it's in loadedFiles
    const loadedCount = await window.evaluate(() =>
      window.__modelStore!.getState().loadedFiles.length,
    )
    expect(loadedCount).toBe(1)
  })

  test('2) load vise.3mf (simulates "Open File" dialog reset + load)', async () => {
    test.setTimeout(60000)
    const window = await electronApp.firstWindow()
    const { assertNoErrors } = trackErrors(window)
    await window.locator('canvas').first().waitFor({ state: 'attached', timeout: 20000 })

    // The "Open File" dialog (handleOpenFile) always calls reset() before
    // loading, which clears previous models and re-shows the file input.
    await window.evaluate(() => {
      window.__modelStore?.getState().reset()
      window.__svgWorkspaceStore?.setState({ files: [], selectedFileId: null })
    })

    // Load vise.3mf — this is the same code path as after the dialog returns
    await window.locator('input[type="file"]').setInputFiles({
      name: 'vise.3mf',
      mimeType: 'application/octet-stream',
      buffer: VISE_3MF,
    })

    await waitForLoadDone(window, 50000)
    await assertNoErrors()

    // After the dialog flow, only vise.3mf should be loaded (dialog resets first)
    const state = await window.evaluate(() => {
      const files = window.__modelStore!.getState().loadedFiles
      return {
        count: files.length,
        names: files.map((f: any) => f.fileName),
      }
    })
    console.log('[test] after dialog load:', JSON.stringify(state))

    expect(state.count).toBe(1)
    expect(state.names[0].toLowerCase()).toContain('vise')

    // Verify meshes are in the scene
    const meshCount = await window.evaluate(() => {
      const dev = window.__r3f_dev
      if (!dev?.scene) return 0
      let count = 0
      dev.scene.traverse((obj: any) => { if (obj?.isMesh) count++ })
      return count
    })
    console.log('[test] vise.3mf mesh count:', meshCount)
    expect(meshCount).toBeGreaterThan(0)
  })
})
