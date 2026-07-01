/**
 * E2E test: FCStd file loading and thumbnail generation.
 *
 * Bug: FCStd files have an embedded thumbnail inside the ZIP (thumbnails/Thumbnail.png),
 * but it's not extracted and shown in the file list. After opening the file, the
 * thumbnail should also be generated from the 3D render result.
 */
import { test, expect, _electron, ElectronApplication, Page } from '@playwright/test'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getElectronLaunchArgs, getElectronPath, createUserDataDir, cleanupUserDataDir } from './utils'
import { isSoftwareGpu } from './gpu-utils'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FCSTD_FIXTURE = readFileSync(path.join(__dirname, 'fixtures', 'ArchDetail.FCStd'))

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

async function waitForLoadDone(page: Page, timeout = 120000) {
  await page.waitForFunction(
    () => window.__modelStore?.getState().__loadingPhase === 'done',
    { timeout },
  )
}

test.describe('3D Viewer Electron - FCStd Loading', () => {
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
      try { await electronApp.close() } catch { /* may hang on CI */ }
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

  test('FCStd file generates a thumbnail after loading', async () => {
    const window = await electronApp.firstWindow()
    test.skip(isSoftwareGpu(), 'WebGL2 thumbnail generation fails on CI / software GPU')
    const { assertNoErrors } = trackErrors(window)

    await window.locator('input[type="file"]').setInputFiles({
      name: 'ArchDetail.FCStd',
      mimeType: 'application/x-freecad',
      buffer: FCSTD_FIXTURE,
    })

    await waitForLoadDone(window, 120000)

    // Verify file is loaded as GLB with parts
    const file = await window.evaluate(() => {
      const files = window.__modelStore.getState().loadedFiles
      return files[files.length - 1]
    })
    expect(file.fileName).toContain('.FCStd')
    expect(file.format).toBe('glb')
    expect(file.glbPartInfos.length).toBeGreaterThan(0)

    // Bug: after loading, a thumbnail should exist in the cache
    // The thumbnail may be generated from the 3D render (if no embedded thumbnail)
    // or extracted from the ZIP (if embedded thumbnail exists)
    const hasThumb = await window.evaluate(
      ({ filePath, mtimeMs }: { filePath: string; mtimeMs?: number }) =>
        window.__getThumbnail(filePath, mtimeMs ?? Date.now()),
      file,
    )
    // For now this is expected to fail — the bug is that no thumbnail is generated
    expect(hasThumb).toBe(true)

    console.log('[test] FCStd file loaded:', JSON.stringify({
      fileName: file.fileName,
      format: file.format,
      partCount: file.glbPartInfos.length,
      thumbnailGenerated: hasThumb,
    }))

    await assertNoErrors()
  })
})
