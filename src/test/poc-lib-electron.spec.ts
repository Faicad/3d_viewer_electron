// Phase 3 integration: test lib-electron.mjs core flow
import { test, expect, _electron } from '@playwright/test'
import { getElectronLaunchArgs, getElectronPath, createUserDataDir, cleanupUserDataDir } from './utils'
import { mkdirSync, existsSync, rmSync, statSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..', '..')
const TEST_GLB = path.join(__dirname, 'fixtures', 'test-box.glb')
const RECORD_DIR = path.join(PROJECT_ROOT, 'test-results', 'poc-lib-electron')

test.describe('Phase 3: lib-electron core flow', () => {
  test('recordVideo + loadFile + waitForModel + pageFn', async () => {
    // Clean output dir
    if (existsSync(RECORD_DIR)) {
      rmSync(RECORD_DIR, { recursive: true, force: true })
    }
    mkdirSync(RECORD_DIR, { recursive: true })

    const userDataDir = createUserDataDir()
    const viewport = { width: 960, height: 540 } // -s (540p) landscape

    // 1. Launch Electron with recordVideo (same as makeMovie does per orientation)
    const electronApp = await _electron.launch({
      executablePath: getElectronPath(),
      args: getElectronLaunchArgs(),
      env: { ...process.env, E2E: '1' },
      userDataDir,
      recordVideo: { dir: RECORD_DIR, size: viewport },
    })
    const page = await electronApp.firstWindow()
    await page.setViewportSize(viewport)
    await page.waitForSelector('canvas', { timeout: 20000 })

    // 2. Load model via __executeCommand (same as recordOne does)
    const loadResult = await page.evaluate(async (filePath) => {
      return (window as any).__executeCommand('loadFile', { filePath })
    }, TEST_GLB)
    console.log('loadFile:', loadResult?.status, loadResult?.data?.fileName)
    expect(loadResult?.status).toBe('success')

    // 3. Wait for model ready (same as startRecording does)
    await page.waitForFunction(
      () => (window as any).__modelStore?.getState().__loadingPhase === 'done',
      { timeout: 30000 },
    )
    console.log('Model loaded, parts:', (await page.evaluate(() => (window as any).__modelStore.getState().glbPartInfos?.length)))

    // 4. Inject TTS timing mock (same as recordOne does before pageFn)
    await page.evaluate(() => {
      ;(window as any).__ttsTiming = { groups: [], ttsTotal: 0 }
      ;(window as any).__ttsGroupIndex = 0
      ;(window as any).__tModelBrowser = performance.now()
    })

    // 5. Run pageFn — simulate a simple recording
    await page.waitForTimeout(3000) // "record" 3 seconds
    console.log('Recorded 3s')

    // 6. Verify right-panel thumbnails populated after loadFile
    const fileListState = await page.evaluate(() => {
      const ms = (window as any).__modelStore.getState()
      return { folderFilesLen: ms.folderFiles.length, currentFolderPath: ms.currentFolderPath }
    })
    console.log('FileList state:', fileListState)
    expect(fileListState.folderFilesLen).toBeGreaterThan(0)
    expect(fileListState.currentFolderPath).toBeTruthy()

    // 7. Get video path
    const videoPath = await page.video()?.path()
    console.log('Video path:', videoPath)

    await electronApp.close()
    cleanupUserDataDir(userDataDir)

    // 8. Verify output
    expect(videoPath).toBeTruthy()
    expect(existsSync(videoPath!)).toBe(true)
    const size = statSync(videoPath!).size
    console.log(`Video size: ${(size / 1024).toFixed(1)} KB`)
    expect(size).toBeGreaterThan(5000) // should have some content

    // Frame rate check (quick)
    const { spawnSync } = await import('child_process')
    const ffprobe = spawnSync('ffprobe', [
      '-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=avg_frame_rate',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      videoPath!,
    ], { encoding: 'utf8' })
    if (ffprobe.status === 0) {
      const [num, den] = ffprobe.stdout.trim().split('/').map(Number)
      console.log(`FPS: ${(num / den).toFixed(2)}`)
    }
  })
})
