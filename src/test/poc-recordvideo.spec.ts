// Phase 0 POC: Verify recordVideo works with _electron.launch() at 25fps
import { test, expect, _electron } from '@playwright/test'
import { spawnSync } from 'child_process'
import { mkdirSync, existsSync, readdirSync, rmSync, statSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getElectronPath } from './utils'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..', '..')
const EXE_PATH = getElectronPath()
const RECORD_DIR = path.join(PROJECT_ROOT, 'test-results', 'poc-recordvideo')

test.describe('Phase 0: recordVideo POC', () => {
  test('recordVideo produces 25fps webm from Electron', async () => {
    // Clean output dir
    if (existsSync(RECORD_DIR)) {
      rmSync(RECORD_DIR, { recursive: true, force: true })
    }
    mkdirSync(RECORD_DIR, { recursive: true })

    console.log('Exe:', EXE_PATH)
    console.log('Output dir:', RECORD_DIR)

    const electronApp = await _electron.launch({
      executablePath: EXE_PATH,
      args: ['--no-sandbox', '--disable-gpu-shader-disk-cache'],
      env: { ...process.env, E2E: '1' },
      recordVideo: {
        dir: RECORD_DIR,
        size: { width: 1280, height: 720 },
      },
    })
    console.log('Electron launched')

    const page = await electronApp.firstWindow()
    await page.waitForSelector('canvas', { timeout: 20000 })
    console.log('Canvas found')

    await page.waitForFunction(
      () => typeof (window as any).__modelStore?.getState === 'function',
      { timeout: 10000 },
    )
    console.log('__modelStore available')

    // Record 5 seconds
    await page.waitForTimeout(5000)
    console.log('Recorded 5 seconds')

    // Close to finalize video
    await electronApp.close()
    console.log('Electron closed')

    // Find output webm
    const files = readdirSync(RECORD_DIR)
    console.log('Files in output dir:', files)
    const webm = files.find(f => f.endsWith('.webm'))
    expect(webm).toBeTruthy()
    const webmPath = path.join(RECORD_DIR, webm!)
    const size = statSync(webmPath).size
    console.log(`Video: ${webm} (${(size / 1024).toFixed(1)} KB)`)
    expect(size).toBeGreaterThan(1000) // must not be empty

    // Check frame rate with ffprobe
    const result = spawnSync('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=avg_frame_rate',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      webmPath,
    ], { encoding: 'utf8' })

    if (result.status === 0) {
      const fpsStr = result.stdout.trim()
      console.log('avg_frame_rate:', fpsStr)
      const [num, den] = fpsStr.split('/').map(Number)
      const fps = num / den
      console.log(`FPS: ${fps.toFixed(2)}`)
      expect(fps).toBeGreaterThanOrEqual(24)
      expect(fps).toBeLessThanOrEqual(26)
    } else {
      console.log('ffprobe not available, skipping fps check')
      console.log('stderr:', result.stderr)
    }
  })
})
