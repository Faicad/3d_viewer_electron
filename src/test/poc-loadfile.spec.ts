// Phase 1 verification: loadFile command works via __executeCommand
import { test, expect, _electron } from '@playwright/test'
import { getElectronLaunchArgs, getElectronPath, createUserDataDir, cleanupUserDataDir } from './utils'
import { isSoftwareGpu } from './gpu-utils'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEST_GLB = path.join(__dirname, 'fixtures', 'test-box.glb')

test.describe('Phase 1: loadFile command', () => {
  test('loads a local GLB file via __executeCommand', async () => {
    test.skip(isSoftwareGpu(), 'WebGL not available on software GPU')
    const userDataDir = createUserDataDir()
    const electronApp = await _electron.launch({
      executablePath: getElectronPath(),
      args: getElectronLaunchArgs(),
      env: { ...process.env, E2E: '1' },
      userDataDir,
    })
    const page = await electronApp.firstWindow()
    await page.waitForSelector('canvas', { timeout: 20000 })

    // Call loadFile via __executeCommand
    const result = await page.evaluate(async (filePath) => {
      return (window as any).__executeCommand('loadFile', { filePath })
    }, TEST_GLB)

    console.log('loadFile result status:', result?.status)
    expect(result).toBeTruthy()
    expect(result.status).toBe('success')
    expect(result.data.fileName).toBe('test-box.glb')
    console.log('Loaded:', result.data.fileName, 'format:', result.data.format)

    // Wait for loading to complete
    await page.waitForFunction(
      () => (window as any).__modelStore?.getState().__loadingPhase === 'done',
      { timeout: 30000 },
    )

    const state = await page.evaluate(() => (window as any).__modelStore.getState())
    expect(state.loadedFiles.length).toBeGreaterThan(0)
    console.log('Model loaded successfully, parts:', state.glbPartInfos?.length)

    // Verify right-panel FileList is populated (folderFiles set by loadFile)
    expect(state.folderFiles.length).toBeGreaterThan(0)
    expect(state.currentFolderPath).toBeTruthy()
    console.log('FileList populated:', state.folderFiles.length, 'files in', state.currentFolderPath)

    await electronApp.close()
    cleanupUserDataDir(userDataDir)
  })
})
