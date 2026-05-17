import { test, expect, _electron, ElectronApplication } from '@playwright/test'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..', '..')
const TEST_STEP = readFileSync(path.join(__dirname, 'fixtures', 'test-model.step'))

test.describe('Ficad Web Electron - STEP Loading', () => {
  let electronApp: ElectronApplication

  test.beforeAll(async () => {
    const exePath = path.join(PROJECT_ROOT, 'dist', 'win-unpacked', 'Ficad Web.exe')
    electronApp = await _electron.launch({
      executablePath: exePath,
    })
  })

  test.afterAll(async () => {
    if (electronApp) {
      await electronApp.close()
    }
  })

  test('app starts and renders canvas', async () => {
    const window = await electronApp.firstWindow()
    await window.waitForTimeout(3000)

    const canvasCount = await window.locator('canvas').count()
    console.log('[test] canvas count:', canvasCount)
    expect(canvasCount).toBeGreaterThan(0)
  })

  test('loads STEP file, converts to GLB, renders mesh with topology', async () => {
    const window = await electronApp.firstWindow()
    await window.waitForTimeout(2000)

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

    // Wait for STEP → GLB conversion (WASM load + OCCT processing + GLB build + React render)
    await window.waitForTimeout(15000)

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
    const hasFaceIds = consoleMessages.some(m => m.includes('[ModelGroup] faceIds built:'))
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
    const window = await electronApp.firstWindow()
    await window.waitForTimeout(2000)

    // Populate file list panel with fixture files
    const hasFiles = await window.evaluate(async (fixturesPath: string) => {
      const result = await window.electronAPI.readDirectory(fixturesPath)
      if (!result.success || !result.files) return false
      window.__modelStore.getState().setFolderFiles(fixturesPath, result.files)
      return true
    }, path.resolve(__dirname, 'fixtures'))
    expect(hasFiles).toBe(true)

    await window.waitForTimeout(1000)

    // Collect console messages
    const consoleMessages: string[] = []
    window.on('console', (msg) => {
      consoleMessages.push(`[${msg.type()}] ${msg.text()}`)
    })

    // Find and click the test-model.step entry in the file list
    const stepEntry = window.locator('div[data-index]').filter({ hasText: 'test-model.step' })
    const entryCount = await stepEntry.count()
    console.log('[test] step file entries found:', entryCount)
    expect(entryCount).toBe(1)

    await stepEntry.click()

    // Wait for STEP → GLB conversion and render
    await window.waitForTimeout(15000)

    const relevant = consoleMessages.filter(m =>
      m.includes('[ModelGroup]') ||
      m.includes('STEP') ||
      m.includes('Load failed') ||
      m.includes('Error') ||
      m.includes('error')
    )
    console.log('[test] console messages (file-list click):', relevant)

    // Verify faceIds built (proof of successful conversion)
    const hasFaceIds = consoleMessages.some(m => m.includes('[ModelGroup] faceIds built:'))
    expect(hasFaceIds).toBe(true)

    // Verify 3D meshes rendered
    const sceneHasMeshes = await window.evaluate(() => {
      const dev = window.__r3f_dev
      if (!dev?.scene) return false
      let meshCount = 0
      dev.scene.traverse((obj: any) => {
        if (obj?.isMesh) meshCount++
      })
      return meshCount > 0
    })
    console.log('[test] scene has meshes (file-list click):', sceneHasMeshes)
    expect(sceneHasMeshes).toBe(true)

    // Verify topology
    const topologyInfo = await window.evaluate(() => {
      const rt = window.__r3f_dev?.selectorRuntime
      if (!rt) return null
      return {
        faces: rt.faces?.length,
        occurrences: rt.occurrenceIdByRowIndex?.size,
      }
    })
    console.log('[test] topology (file-list click):', topologyInfo)
    expect(topologyInfo).not.toBeNull()
    expect(topologyInfo!.faces).toBeGreaterThan(0)
  })
})
