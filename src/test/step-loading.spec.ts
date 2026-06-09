import { test, expect, _electron, ElectronApplication, Page } from '@playwright/test'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getElectronLaunchArgs, getElectronPath, createUserDataDir, cleanupUserDataDir } from './utils'
import { isSoftwareGpu, isLinuxCI } from './gpu-utils'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEST_STEP = readFileSync(path.join(__dirname, 'fixtures', 'test-model.step'))

/** Collect page errors and return an assertion helper that fails on any error. */
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

/** Wait for ModelGroup to finish loading (replaces fixed timeouts). */
async function waitForLoadDone(page: Page, timeout = 30000) {
  await page.waitForFunction(
    () => window.__modelStore?.getState().__loadingPhase === 'done',
    { timeout },
  )
}

test.describe('3D Viewer Electron - STEP Loading', () => {
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

    const canvasCount = await window.locator('canvas').count()
    console.log('[test] canvas count:', canvasCount)
    expect(canvasCount).toBeGreaterThan(0)
    await assertNoErrors()
  })

  test('loads STEP file, converts to GLB, renders mesh with topology', async () => {
    const window = await electronApp.firstWindow()
    test.skip(isSoftwareGpu(), 'WebGL2 thumbnail generation fails on CI / software GPU')
    const { assertNoErrors } = trackErrors(window)

    // Capture console messages for debugging
    const consoleMessages: string[] = []
    window.on('console', (msg) => {
      consoleMessages.push(`[${msg.type()}] ${msg.text()}`)
    })

    // Load STEP file via file input
    await window.locator('input[type="file"]').setInputFiles({
      name: 'test-model.step',
      mimeType: 'application/octet-stream',
      buffer: TEST_STEP,
    })

    await waitForLoadDone(window, 60000)
    await assertNoErrors()

    // Diagnostic: dump relevant console messages
    const relevant = consoleMessages.filter(m =>
      m.includes('[ModelGroup]') ||
      m.includes('STEP') ||
      m.includes('occt') ||
      m.includes('wasm') ||
      m.includes('Error') ||
      m.includes('error')
    )
    console.log('[test] console messages (relevant):', relevant)

    // Verify STEP→GLB conversion succeeded (faceIds built = topology mapped)
    const hasFaceIds = await window.evaluate(() => window.__sceneHasFaceIds())
    expect(hasFaceIds).toBe(true)

    // Verify 3D meshes exist in the THREE.js scene
    const sceneHasMeshes = await window.evaluate(() => {
      const dev = window.__r3f_dev
      if (!dev?.scene) return false
      let meshCount = 0
      dev.scene.traverse((obj: any) => {
        if (obj?.isMesh) meshCount++
      })
      return meshCount > 0
    })
    console.log('[test] scene has meshes:', sceneHasMeshes)
    expect(sceneHasMeshes).toBe(true)

    // Verify selectorRuntime (topology extension parsed correctly)
    const topologyInfo = await window.evaluate(() => {
      const rt = window.__r3f_dev?.selectorRuntime
      if (!rt) return null
      return {
        faces: rt.faces?.length,
        occurrences: rt.occurrenceIdByRowIndex?.size,
        edges: rt.edges?.length,
      }
    })
    console.log('[test] topology info:', topologyInfo)
    expect(topologyInfo).not.toBeNull()
    expect(topologyInfo!.faces).toBeGreaterThan(0)
  })

  test('clicks STEP file in file list panel and renders model', async () => {
    test.skip(isLinuxCI(), 'Unstable on Linux CI / SwiftShader')
    test.setTimeout(60000)
    const window = await electronApp.firstWindow()
    const { assertNoErrors } = trackErrors(window)
    await window.waitForLoadState('domcontentloaded')

    // Start each test with a clean cache so stale IndexedDB entries
    // from previous runs don't affect the conversion result.
    await window.evaluate(() => window.__clearStepCache())
    await window.evaluate(() => window.__modelStore?.getState().reset())

    // Populate file list panel with fixture files
    const hasFiles = await window.evaluate(async (fixturesPath: string) => {
      const result = await window.electronAPI.readDirectory(fixturesPath)
      if (!result.success || !result.files) return false
      window.__modelStore.getState().setFolderFiles(fixturesPath, result.files)
      return true
    }, path.resolve(__dirname, 'fixtures'))
    expect(hasFiles).toBe(true)

    // Wait for the file list entry to appear in the DOM
    const stepEntry = window.locator('div[data-index]').filter({ hasText: /test-model\.step$/ })
    await expect(stepEntry).toBeAttached()

    await stepEntry.click()

    await waitForLoadDone(window, 50000)

    // After loadingPhase becomes 'done', ModelGroup's glbMeshes state update
    // and the subsequent React re-render (which attaches faceIds and meshes to
    // the scene) may not have completed yet. Wait for actual meshes in the
    // THREE.js scene to ensure all render-cycle side effects are done.
    await window.waitForFunction(() => {
      const dev = window.__r3f_dev
      if (!dev?.scene) return false
      let meshCount = 0
      dev.scene.traverse((obj: any) => { if (obj?.isMesh) meshCount++ })
      return meshCount > 0
    })

    // Verify faceIds built (proof of successful conversion)
    const hasFaceIds = await window.evaluate(() => window.__sceneHasFaceIds())
    expect(hasFaceIds).toBe(true)

    // Verify topology
    const topologyInfo = await window.evaluate(() => {
      const rt = window.__r3f_dev?.selectorRuntime
      if (!rt) return null
      return {
        faces: rt.faces?.length,
        occurrences: rt.occurrenceIdByRowIndex?.size,
      }
    })
    expect(topologyInfo).not.toBeNull()
    expect(topologyInfo!.faces).toBeGreaterThan(0)
    await assertNoErrors()
  })

  test('caches converted GLB on first load, hits cache on second load', async () => {
    test.skip(isLinuxCI(), 'Unstable on Linux CI / SwiftShader')
    test.setTimeout(90000)
    const window = await electronApp.firstWindow()
    const { assertNoErrors } = trackErrors(window)
    await window.waitForLoadState('domcontentloaded')

    // Reset model and populate file list with fixture files
    await window.evaluate(async (fixturesPath: string) => {
      window.__modelStore.getState().reset()
      const result = await window.electronAPI.readDirectory(fixturesPath)
      if (result.success && result.files) {
        window.__modelStore.getState().setFolderFiles(fixturesPath, result.files)
      }
    }, path.resolve(__dirname, 'fixtures'))

    // Get keycap_v6 file info for cache key lookup
    const keycapInfo = await window.evaluate(() => {
      const files = window.__modelStore.getState().folderFiles
      return files.find((f: any) => f.name === 'keycap_v6.step') ?? null
    })
    expect(keycapInfo).not.toBeNull()

    // Wait for the file list entry to render before clicking
    const entry1 = window.locator('div[data-index]').filter({ hasText: /keycap_v6\.step$/ })
    await expect(entry1).toBeAttached()

    await entry1.click()
    await waitForLoadDone(window, 60000)

    // Verify model rendered
    let sceneOk = await window.evaluate(() => {
      const dev = window.__r3f_dev
      if (!dev?.scene) return false
      let meshCount = 0
      dev.scene.traverse((obj: any) => { if (obj?.isMesh) meshCount++ })
      return meshCount > 0
    })
    expect(sceneOk).toBe(true)

    // Switch to test-model.step, remove keycap_v6, then re-click keycap_v6
    // to force a reload — should hit memory cache (multi-file keeps both loaded)
    const entry2 = window.locator('div[data-index]').filter({ hasText: /test-model\.step$/ })
    await entry2.click()
    await waitForLoadDone(window, 60000)

    // Remove keycap_v6 from loaded files so next click triggers a fresh load
    await window.evaluate(() => {
      const st = window.__modelStore!.getState()
      const keycap = st.loadedFiles.find((f: any) => f.fileName === 'keycap_v6.step')
      if (keycap) st.removeLoadedFile(keycap.id)
    })

    // Verify the converted GLB is still in memory cache after file removal
    const inMemCache = await window.evaluate(
      ({ path, mtimeMs }) => window.__stepMemCacheHas(path, mtimeMs),
      keycapInfo,
    )
    expect(inMemCache).toBe(true)

    const entry3 = window.locator('div[data-index]').filter({ hasText: /keycap_v6\.step$/ })
    await entry3.click()
    await waitForLoadDone(window)

    // Verify model renders from cache
    sceneOk = await window.evaluate(() => {
      const dev = window.__r3f_dev
      if (!dev?.scene) return false
      let meshCount = 0
      dev.scene.traverse((obj: any) => { if (obj?.isMesh) meshCount++ })
      return meshCount > 0
    })
    expect(sceneOk).toBe(true)
    await assertNoErrors()
  })

  test('STEP file defaults showHeatbed=false (only 3MF defaults to true)', async () => {
    test.skip(isLinuxCI(), 'Unstable on Linux CI / SwiftShader')
    const window = await electronApp.firstWindow()
    const { assertNoErrors } = trackErrors(window)
    await window.waitForLoadState('domcontentloaded')

    // Clear state from previous tests — reset model store and
    // clear the _heatbedExplicitlySet flag so initShowHeatbed can set the default
    await window.evaluate(() => {
      window.__modelStore?.getState().reset()
      const es = (window as any).__engineStore
      if (es) {
        es.setState({ showHeatbed: false, _heatbedExplicitlySet: false })
      }
    })

    // Reload page to ensure clean React tree with the drop overlay visible
    await window.evaluate(() => { window.location.reload() })
    await window.waitForLoadState('domcontentloaded')

    // Load STEP file via file input
    await window.locator('input[type="file"]').setInputFiles({
      name: 'keycap_v6.step',
      mimeType: 'application/octet-stream',
      buffer: readFileSync(path.join(__dirname, 'fixtures', 'keycap_v6.step')),
    })

    await waitForLoadDone(window, 60000)

    // Wait for model mesh to finish loading
    await window.waitForFunction(() => {
      const dev = (window as any).__r3f_dev
      if (!dev?.scene) return false
      let modelMeshCount = 0
      dev.scene.traverse((obj: any) => {
        if (obj.isMesh) {
          const pn = obj.parent?.name || ''
          if (!['Heatbed', 'shadowFloor'].includes(pn)) modelMeshCount++
        }
      })
      return modelMeshCount > 0
    }, { timeout: 10000 })

    const state = await window.evaluate(() => {
      const es = window.__engineStore
      const dev = window.__r3f_dev as any
      let heatbedGroup: any = null
      let modelMeshCount = 0
      dev.scene.traverse((obj: any) => {
        if (obj.name === 'Heatbed') {
          heatbedGroup = { visible: obj.visible }
        }
        if (obj.isMesh) {
          const pn = obj.parent?.name || ''
          if (!['Heatbed', 'shadowFloor', 'topology-pick-overlay', 'point-pick-points'].includes(pn)) {
            modelMeshCount++
          }
        }
      })
      return {
        showHeatbed: es?.getState().showHeatbed,
        heatbedGroup,
        modelMeshCount,
      }
    })

    console.log('[test] heatbed:', JSON.stringify(state))

    // STEP files must default showHeatbed to false (only 3MF defaults to true)
    expect(state.showHeatbed, 'showHeatbed must be false for STEP files').toBe(false)

    // Heatbed group exists in scene (always added) but must be hidden
    expect(state.heatbedGroup, 'Heatbed group must exist but be hidden').toEqual({ visible: false })

    // Model meshes must still load successfully
    expect(state.modelMeshCount, 'Model meshes must exist').toBeGreaterThan(0)

    await assertNoErrors()
  })

  test('native GLB file defaults showHeatbed=false', async () => {
    test.skip(isLinuxCI(), 'Unstable on Linux CI / SwiftShader')
    const window = await electronApp.firstWindow()
    const { assertNoErrors } = trackErrors(window)
    await window.waitForLoadState('domcontentloaded')

    // Clear state
    await window.evaluate(() => {
      window.__modelStore?.getState().reset()
      window.__engineStore?.getState().setShowHeatbed(false)
    })

    // Load a native GLB file (not from STEP/CAD — no STEP_T extension)
    const glbBuf = readFileSync(path.join(__dirname, 'fixtures', 'RobotExpressive.glb'))
    await window.locator('input[type="file"]').setInputFiles({
      name: 'test-box.glb',
      mimeType: 'model/gltf-binary',
      buffer: glbBuf,
    })
    await waitForLoadDone(window)

    const state = await window.evaluate(() => {
      const es = window.__engineStore
      const ms = window.__modelStore?.getState()
      return {
        showHeatbed: es?.getState().showHeatbed,
        modelFormat: ms?.modelFormat,
        modelBufferLen: ms?.modelBuffer?.byteLength,
      }
    })

    console.log('[test] GLB state:', JSON.stringify(state))

    // Native (non-CAD) GLB files must NOT default to showHeatbed
    expect(state.showHeatbed, 'Native GLB files must default showHeatbed=false').toBe(false)
    await assertNoErrors()
  })

  test('heatbed toggle: non-3MF file toggles heatbed on/off via toolbar button', async () => {
    test.skip(isLinuxCI(), 'Unstable on Linux CI / SwiftShader')
    const window = await electronApp.firstWindow()
    const { assertNoErrors } = trackErrors(window)
    await window.waitForLoadState('domcontentloaded')

    // Fully reset state so initShowHeatbed can apply format defaults
    await window.evaluate(() => {
      window.__modelStore?.getState().reset()
      const es = (window as any).__engineStore
      if (es) {
        es.setState({ showHeatbed: false, _heatbedExplicitlySet: false })
      }
    })

    // Load a native GLB file (non-3MF — should default to heatbed off)
    const glbBuf = readFileSync(path.join(__dirname, 'fixtures', 'RobotExpressive.glb'))
    await window.locator('input[type="file"]').setInputFiles({
      name: 'test-box.glb',
      mimeType: 'model/gltf-binary',
      buffer: glbBuf,
    })
    await waitForLoadDone(window)

    // 1. Verify initial state: showHeatbed=false, heatbed is in scene but hidden
    const initial = await window.evaluate(() => {
      const es = window.__engineStore
      const dev = (window as any).__r3f_dev
      let heatbedGroup: any = null
      if (dev?.scene) {
        dev.scene.traverse((obj: any) => {
          if (obj.name === 'Heatbed') heatbedGroup = { visible: obj.visible }
        })
      }
      return {
        showHeatbed: es?.getState().showHeatbed,
        heatbedGroup,
      }
    })
    console.log('[test] initial:', JSON.stringify(initial))
    expect(initial.showHeatbed, 'GLB must default showHeatbed=false').toBe(false)
    expect(initial.heatbedGroup, 'Heatbed group must exist but be hidden initially').toEqual({ visible: false })

    // Helper: poll scene until heatbed visibility matches expected
    async function waitForHeatbedVisible(expectedVisible: boolean): Promise<{ showHeatbed: boolean; heatbedGroup: any }> {
      const handle = await window.waitForFunction((expVis) => {
        const es = (window as any).__engineStore
        const dev = (window as any).__r3f_dev
        let heatbedGroup: any = null
        if (dev?.scene) {
          dev.scene.traverse((obj: any) => {
            if (obj.name === 'Heatbed') heatbedGroup = { visible: obj.visible }
          })
        }
        const showHeatbed = es?.getState().showHeatbed
        if (heatbedGroup != null && heatbedGroup.visible === expVis && showHeatbed === expVis) {
          return { showHeatbed, heatbedGroup }
        }
        return false
      }, expectedVisible, { timeout: 5000 })
      return (await handle.jsonValue()) as any
    }

    // 2. Toggle heatbed ON via toolbar button
    await window.locator('[data-testid="toolbar-heatbed"]').click()
    const toggledOn = await waitForHeatbedVisible(true)
    console.log('[test] toggledOn:', JSON.stringify(toggledOn))
    expect(toggledOn.showHeatbed, 'showHeatbed must be true after toggle on').toBe(true)
    expect(toggledOn.heatbedGroup, 'Heatbed group must exist in scene after toggle on').not.toBeNull()
    expect(toggledOn.heatbedGroup!.visible, 'Heatbed must be visible after toggle on').toBe(true)

    // 3. Toggle heatbed OFF
    await window.locator('[data-testid="toolbar-heatbed"]').click()
    const toggledOff = await waitForHeatbedVisible(false)
    console.log('[test] toggledOff:', JSON.stringify(toggledOff))
    expect(toggledOff.showHeatbed, 'showHeatbed must be false after toggle off').toBe(false)
    expect(toggledOff.heatbedGroup, 'Heatbed group must exist but be hidden after toggle off').toEqual({ visible: false })

    // 4. Toggle heatbed ON again (round-trip)
    await window.locator('[data-testid="toolbar-heatbed"]').click()
    const toggledOnAgain = await waitForHeatbedVisible(true)
    console.log('[test] toggledOnAgain:', JSON.stringify(toggledOnAgain))
    expect(toggledOnAgain.showHeatbed, 'showHeatbed must be true after second toggle on').toBe(true)
    expect(toggledOnAgain.heatbedGroup, 'Heatbed group must exist in scene after second toggle on').not.toBeNull()
    expect(toggledOnAgain.heatbedGroup!.visible, 'Heatbed must be visible after second toggle on').toBe(true)

    await assertNoErrors()
  })

  test('shows loading overlay during STEP conversion and hides after', async () => {
    const window = await electronApp.firstWindow()
    const { assertNoErrors } = trackErrors(window)
    await window.waitForLoadState('domcontentloaded')

    // Overlay is conditionally rendered — not in DOM when loadingState.isVisible=false
    const overlay = window.locator('[data-testid="loading-overlay"]')
    await expect(overlay).not.toBeAttached()

    // Toggle on via store → React re-renders → overlay appears
    await window.evaluate(() => window.__modelStore.getState().showProgress('Loading test...', 50))
    await expect(overlay).toBeAttached()
    await expect(overlay).toBeVisible()
    console.log('[test] overlay visible after showProgress()')

    // Toggle off → React unmounts overlay
    await window.evaluate(() => window.__modelStore.getState().hideProgress())
    await expect(overlay).not.toBeAttached()
    console.log('[test] overlay unmounted after hideProgress()')
    await assertNoErrors()
  })
})
