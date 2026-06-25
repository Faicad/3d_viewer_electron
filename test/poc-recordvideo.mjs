// Phase 0 POC: Verify Playwright _electron.launch() supports recordVideo
// and that the output achieves stable 25fps.
//
// Usage: node test/poc-recordvideo.mjs

import { _electron as electron } from 'playwright'
import { spawnSync } from 'child_process'
import { mkdirSync, existsSync, unlinkSync, statSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')
const EXE_PATH = path.join(PROJECT_ROOT, 'dist', 'win-unpacked', '3D_Viewer.exe')
const RECORD_DIR = path.join(__dirname, 'poc-output')

// Clean output dir
if (existsSync(RECORD_DIR)) {
  for (const f of ['poc.webm'].map(n => path.join(RECORD_DIR, n))) {
    if (existsSync(f)) unlinkSync(f)
  }
}
mkdirSync(RECORD_DIR, { recursive: true })

console.log('=== Phase 0: recordVideo POC ===')
console.log('  Exe:', EXE_PATH)
console.log('  Output dir:', RECORD_DIR)

// ---- Test 1: Basic recordVideo ----
console.log('\n--- Test 1: recordVideo on _electron.launch() ---')

let app
try {
  app = await electron.launch({
    executablePath: EXE_PATH,
    args: ['--no-sandbox', '--disable-gpu-shader-disk-cache'],
    env: { ...process.env, E2E: '1' },
    recordVideo: {
      dir: RECORD_DIR,
      size: { width: 1280, height: 720 },
    },
  })
  console.log('  ✅ Electron launched')

  const page = await app.firstWindow()
  console.log('  ✅ Got firstWindow')

  // Wait for canvas to render
  await page.waitForSelector('canvas', { timeout: 20000 })
  console.log('  ✅ Canvas found')

  // Wait for model store to be ready
  await page.waitForFunction(
    () => typeof window.__modelStore?.getState === 'function',
    { timeout: 10000 }
  )
  console.log('  ✅ __modelStore available')

  // Wait 5 seconds to record some frames
  await page.waitForTimeout(5000)
  console.log('  ✅ Recorded 5 seconds')

  // Close Electron (this should finalize the video)
  await app.close()
  console.log('  ✅ Electron closed')

  // Check for video file
  const webmPath = path.join(RECORD_DIR, 'poc.webm')
  if (existsSync(webmPath)) {
    const size = statSync(webmPath).size
    console.log(`  ✅ Video file found: ${webmPath} (${(size / 1024).toFixed(1)} KB)`)
  } else {
    // Playwright names video files with a UUID
    const files = (await import('fs')).readdirSync(RECORD_DIR)
    console.log(`  Files in ${RECORD_DIR}:`, files)
    const webmFile = files.find(f => f.endsWith('.webm'))
    if (webmFile) {
      console.log(`  ✅ Found video: ${webmFile}`)
    } else {
      console.error('  ❌ No .webm file found!')
    }
  }
} catch (err) {
  console.error('  ❌ Failed:', err.message)
  if (app) {
    try { await app.close() } catch {}
  }
}

// ---- Test 2: Check frame rate with ffprobe ----
console.log('\n--- Test 2: Frame rate check via ffprobe ---')
const files = existsSync(RECORD_DIR) ? (await import('fs')).readdirSync(RECORD_DIR) : []
const webmFile = files.find(f => f.endsWith('.webm'))
if (webmFile) {
  const webmPath = path.join(RECORD_DIR, webmFile)
  const result = spawnSync('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=avg_frame_rate,r_frame_rate,duration,nb_frames',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    webmPath,
  ], { encoding: 'utf8' })

  if (result.status === 0) {
    const lines = result.stdout.trim().split('\n')
    console.log('  ffprobe output:', lines)
    const fpsLine = lines.find(l => l.includes('/'))
    if (fpsLine) {
      const [num, den] = fpsLine.split('/').map(Number)
      const fps = num / den
      console.log(`  Calculated FPS: ${fps.toFixed(2)} (${num}/${den})`)
      if (fps >= 24.5 && fps <= 25.5) {
        console.log('  ✅ FPS is within expected range (25fps)')
      } else {
        console.log('  ⚠️  FPS outside expected range')
      }
    }
  } else {
    console.log('  ffprobe stderr:', result.stderr)
    console.log('  (ffprobe may not be available — install ffmpeg)')
  }
} else {
  console.log('  ❌ No video to analyze')
}

console.log('\n=== POC Complete ===')
