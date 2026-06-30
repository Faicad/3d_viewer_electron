/**
 * E2E test: BREP file loading via file input.
 *
 * BREP shares the same occt-import-js WASM conversion pipeline as STEP.
 * Validates the full asynchronous flow: file input → OCCT ReadBrepFile → GLB → mesh render.
 */
import { test, expect, _electron, ElectronApplication, Page } from '@playwright/test'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getElectronLaunchArgs, getElectronPath, createUserDataDir, cleanupUserDataDir } from './utils'
import { isSoftwareGpu } from './gpu-utils'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BREP_FIXTURE = readFileSync(path.join(__dirname, 'fixtures', 'Motor-c.brep'))

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

async function waitForLoadDone(page: Page, timeout = 60000) {
  await page.waitForFunction(
    () => window.__modelStore?.getState().__loadingPhase === 'done',
    { timeout },
  )
}

test.describe('3D Viewer Electron - BREP Loading', () => {
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
      try { await electronApp.close() } catch { }
    }
    cleanupUserDataDir(_userDataDir)
  })

  test('app starts and renders canvas', async () => {
    const window = await electronApp.firstWindow()
    const { assertNoErrors } = trackErrors(window)
    await window.waitForLoadState('domcontentloaded')
    await window.locator('canvas').first().waitFor({ state: 'attached', timeout: 20000 })
    expect(await window.locator('canvas').count()).toBeGreaterThan(0)
    await assertNoErrors()
  })

  test('loads BREP file, converts to GLB, renders mesh with topology', async () => {
    const window = await electronApp.firstWindow()
    test.skip(isSoftwareGpu(), 'WebGL2 thumbnail generation fails on CI / software GPU')
    const { assertNoErrors } = trackErrors(window)

    const consoleMessages: string[] = []
    window.on('console', (msg) => {
      consoleMessages.push(`[${msg.type()}] ${msg.text()}`)
    })

    await window.locator('input[type="file"]').setInputFiles({
      name: 'Motor-c.brep',
      mimeType: 'application/brep',
      buffer: BREP_FIXTURE,
    })

    await waitForLoadDone(window, 120000)

    // Verify models are loaded
    const fileCount = await window.evaluate(() =>
      window.__modelStore.getState().loadedFiles.length,
    )
    expect(fileCount).toBeGreaterThanOrEqual(1)

    const file = await window.evaluate(() => {
      const files = window.__modelStore.getState().loadedFiles
      return files[files.length - 1]
    })
    expect(file.fileName).toContain('.brep')
    expect(file.format).toBe('glb')
    expect(file.glbPartInfos.length).toBeGreaterThan(0)

    console.log('[test] BREP file loaded:', JSON.stringify({
      fileName: file.fileName,
      format: file.format,
      partCount: file.glbPartInfos.length,
    }))

    await assertNoErrors()
  })

  test('loads BREP via loadModel command and validates model info', async () => {
    const window = await electronApp.firstWindow()
    test.skip(isSoftwareGpu(), 'WebGL2 thumbnail generation fails on CI / software GPU')
    const { assertNoErrors } = trackErrors(window)

    const BREP_DATA_URL = `data:application/brep;base64,${BREP_FIXTURE.toString('base64')}`

    const result = await window.evaluate(async (dataUrl) => {
      const resp = await window.__executeCommand('loadModel', { data: dataUrl })
      await new Promise(r => setTimeout(r, 3000))
      const info = await window.__executeCommand('getModelInfo', {})
      return { loadResult: resp, info }
    }, BREP_DATA_URL)

    expect(result.loadResult.status).toBe('success')
    expect(result.info.data.partCount).toBeGreaterThan(0)
    expect(result.info.data.fileName).toContain('.brep')

    console.log('[test] BREP loadModel result:', JSON.stringify({
      loadStatus: result.loadResult.status,
      fileId: result.loadResult.data?.fileId,
      partCount: result.info.data?.partCount,
    }))

    await assertNoErrors()
  })
})
