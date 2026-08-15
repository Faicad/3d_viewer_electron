/**
 * E2E test: Blender (.blend) file loading and rendering.
 *
 * .blend files need a real Blender CLI on the host to convert to GLB, so this
 * spec first probes `blendFindExe` and skips on machines without Blender
 * (e.g. CI). The file is opened through the OS file-association path
 * (`open-external-file` IPC) because .blend requires a real disk path.
 */
import { test, expect, _electron, ElectronApplication, Page } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'
import { getElectronLaunchArgs, getElectronPath, createUserDataDir, cleanupUserDataDir } from './utils'
import { isSoftwareGpu } from './gpu-utils'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BLEND_FIXTURE = path.join(__dirname, 'fixtures', 'test-cube.blend')

function trackErrors(page: Page) {
  const pageErrors: string[] = []
  page.on('pageerror', (err) => pageErrors.push(String(err)))
  page.on('console', (msg) => {
    if (msg.type() === 'error') pageErrors.push(`[console.error] ${msg.text()}`)
  })
  return {
    getPageErrors: () => pageErrors,
    async assertNoErrors() {
      const appErrors = await page.evaluate(() =>
        window.__errors.map((e) => `${e.message}\n${e.stack}`),
      )
      const all = [...pageErrors, ...appErrors]
      expect(all, `Unexpected errors detected:\n${all.join('\n')}`).toEqual([])
    },
  }
}

async function waitForLoadDone(page: Page, timeout = 120000, pageErrors: string[] = []) {
  const deadline = Date.now() + timeout
  let last: unknown = null
  while (Date.now() < deadline) {
    last = await page.evaluate(() => {
      const s = window.__modelStore?.getState()
      return {
        phase: s?.__loadingPhase,
        loaded: s?.loadedFiles?.length ?? 0,
        errors: (window.__errors ?? []).map((e) => `${e.message}\n${e.stack}`),
        toasts: [...document.querySelectorAll('[data-sonner-toast]')]
          .map((el) => el?.textContent?.trim())
          .filter(Boolean),
      }
    })
    const state = last as { phase?: string; loaded: number; errors: string[]; toasts: string[] }
    if (state.phase === 'done') return
    if (state.phase === 'error') {
      throw new Error(`Loading failed (phase=error):\n${JSON.stringify(state, null, 2)}`)
    }
    if (state.errors.length > 0) {
      throw new Error(`Renderer errors detected:\n${state.errors.join('\n---\n')}`)
    }
    if (state.toasts.length > 0) {
      const globals = await page.evaluate(() => ({
        modelStore: typeof window.__modelStore,
        engineStore: typeof window.__engineStore,
        uiStore: typeof window.__uiStore,
        r3fDev: typeof window.__r3f_dev,
        errors: (window.__errors ?? []).map((e) => `${e.message}\n${e.stack}`),
      }))
      throw new Error(
        `UI failure toast detected:\n${JSON.stringify(state.toasts, null, 2)}\n` +
          `globals: ${JSON.stringify(globals, null, 2)}\n` +
          `console/page errors:\n${pageErrors.join('\n')}`,
      )
    }
    await page.waitForTimeout(1000)
  }
  throw new Error(`Timeout waiting for load done. Last state:\n${JSON.stringify(last, null, 2)}`)
}

test.describe('3D Viewer Electron - Blender (.blend) Loading', () => {
  let electronApp: ElectronApplication
  let _userDataDir: string
  let blenderAvailable = false

  test.beforeAll(async () => {
    _userDataDir = createUserDataDir()
    electronApp = await _electron.launch({
      executablePath: getElectronPath(),
      args: getElectronLaunchArgs(),
      env: { ...process.env, E2E: '1' },
      userDataDir: _userDataDir,
    })
    const page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.locator('canvas').first().waitFor({ state: 'attached', timeout: 20000 })
    blenderAvailable = await page.evaluate(() => window.electronAPI.blendFindExe())
  })

  test.afterAll(async () => {
    if (electronApp) {
      try { await electronApp.close() } catch { /* may hang on CI */ }
    }
    cleanupUserDataDir(_userDataDir)
  })

  test('loads test-cube.blend via Blender conversion and renders mesh', async () => {
    test.setTimeout(180000)
    const window = await electronApp.firstWindow()
    test.skip(!blenderAvailable, 'Blender executable not found on this machine — cannot convert .blend')
    test.skip(isSoftwareGpu(), 'blend loading may time out on software GPU')
    const { assertNoErrors, getPageErrors } = trackErrors(window)

    // Simulate opening the file via OS file association (needs a real disk path
    // for the Blender CLI to read the file)
    await electronApp.evaluate(({ BrowserWindow }, filePath) => {
      const win = BrowserWindow.getAllWindows()[0]
      win.webContents.send('open-external-file', filePath)
    }, BLEND_FIXTURE)

    await waitForLoadDone(window, 120000, getPageErrors())
    await assertNoErrors()

    // Scene must contain rendered meshes
    const sceneHasContent = await window.evaluate(() => {
      const dev = window.__r3f_dev
      if (!dev?.scene) return false
      let count = 0
      dev.scene.traverse((obj: any) => {
        if (obj?.isMesh) count++
      })
      return count > 0
    })
    expect(sceneHasContent).toBe(true)

    // File must be listed in the file panel with its name
    await expect(window.locator('text=test-cube.blend').first()).toBeAttached()

    // Scene tree must show a file node
    const treeHasFile = await window.evaluate(() => {
      const files = window.__modelStore?.getState().loadedFiles ?? []
      return files.some((f: any) => f.fileName === 'test-cube.blend')
    })
    expect(treeHasFile).toBe(true)
  })
})