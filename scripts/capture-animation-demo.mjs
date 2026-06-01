/**
 * Auto-generates MP4/WebM animation demo videos for docs pages.
 *
 * Flow:
 *   1. Launch Electron app via Playwright
 *   2. Load an animated GLB model
 *   3. Click toolbar "Play Animation" button → opens AnimationPlayerDialog
 *      (which has its own R3F Canvas dedicated to animation playback)
 *   4. For each animation clip: time-step through frames, capture PNGs
 *   5. Encode frame sequences → WebM (VP9) + MP4 (H.264) via ffmpeg
 *
 * Prerequisites:
 *   - npm run build:unpacked   (builds the Electron app)
 *   - ffmpeg on PATH
 *
 * Output: pages/public/screenshots/animations/*.webm + *.mp4
 *
 * Usage: node scripts/capture-animation-demo.mjs
 */

import { _electron } from '@playwright/test'
import { execSync } from 'child_process'
import { readFileSync, mkdirSync, rmSync, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT = path.resolve(ROOT, 'pages', 'public', 'screenshots', 'animations')
const FIXTURES = path.resolve(ROOT, 'src', 'test', 'fixtures')
const TEMP = path.resolve(ROOT, '.temp-animation-frames')
const FPS = 15
const MAX_DURATION = 10 // seconds per clip

async function main() {
  // ── Resolve executable path ────────────────────────────────────
  const exeName = process.platform === 'win32' ? '3D_Viewer.exe'
    : process.platform === 'darwin' ? '3D_Viewer.app/Contents/MacOS/3D_Viewer'
    : '3d_viewer_electron'
  const executablePath = path.join(ROOT, 'dist', 'win-unpacked', exeName)

  if (!existsSync(executablePath)) {
    console.error(`❌ Electron executable not found: ${executablePath}`)
    console.error('   Run "npm run build:unpacked" first.')
    process.exit(1)
  }

  // ── 1. Launch Electron app ─────────────────────────────────────
  console.log('Launching Electron app...')
  const electronApp = await _electron.launch({
    executablePath,
    args: ['--no-sandbox'],
    env: { ...process.env, E2E: '1' },
  })

  const page = await electronApp.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.locator('canvas').first().waitFor({ state: 'attached', timeout: 30000 })
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.waitForTimeout(2000)

  // Close right panel so the toolbar button is easier to find
  const toggleBtn = page.locator('button:has(svg.lucide-panel-right-close)').first()
  if (await toggleBtn.isVisible().catch(() => false)) {
    await toggleBtn.click()
    await page.waitForTimeout(400)
  }

  // ── 2. Load animated model ─────────────────────────────────────
  const FIXTURE = 'RobotExpressive.glb'
  console.log(`Loading ${FIXTURE}...`)

  await page.evaluate(() => window.__modelStore?.getState().reset())
  const buf = readFileSync(path.join(FIXTURES, FIXTURE))
  await page.locator('input[type="file"]').setInputFiles({
    name: FIXTURE,
    mimeType: 'model/gltf-binary',
    buffer: buf,
  })
  await page.waitForFunction(
    () => window.__modelStore?.getState().__loadingPhase === 'done',
    { timeout: 60000 },
  )
  await page.waitForTimeout(1500)

  // ── 3. Extract animation info ──────────────────────────────────
  const animInfo = await page.evaluate(() => {
    const files = window.__modelStore?.getState().loadedFiles
    if (!files?.length) return []
    const anims = files[0].animations
    if (!anims?.length) return []
    return anims.map(a => ({ name: a.name, duration: a.duration }))
  })

  if (!animInfo.length) {
    console.error('❌ No animations found in loaded model')
    await electronApp.close()
    process.exit(1)
  }
  console.log(`Found ${animInfo.length} animation clips:`)
  for (const c of animInfo) console.log(`  • "${c.name}" (${c.duration.toFixed(1)}s)`)

  // ── 4. Open animation dialog via toolbar button ─────────────────
  // The dialog creates its OWN R3F Canvas and AnimationPlayerInternal,
  // which is where the animation actually renders.
  const playBtn = page.locator('[data-testid="toolbar-animation-player"]')
  await playBtn.waitFor({ state: 'visible', timeout: 5000 })
  await playBtn.click()

  // Wait for the dialog to appear
  const dialog = page.locator('[role="dialog"]')
  await dialog.waitFor({ state: 'visible', timeout: 5000 })
  await page.waitForTimeout(500) // let Canvas mount + mixer initialize

  // Verify animation is playing in the store
  const isPlaying = await page.evaluate(() =>
    window.__animationStore?.getState().isPlaying,
  )
  console.log(`Animation playing: ${isPlaying}`)

  // ── 5. Capture each clip, frame by frame ────────────────────────
  mkdirSync(OUT, { recursive: true })
  mkdirSync(TEMP, { recursive: true })

  for (let ci = 0; ci < animInfo.length; ci++) {
    const clip = animInfo[ci]
    const clipDuration = Math.min(clip.duration, MAX_DURATION)
    const frameCount = Math.ceil(clipDuration * FPS)
    const safeName = clip.name.replace(/[^a-zA-Z0-9_-]/g, '_') || `clip_${ci}`
    const frameDir = path.join(TEMP, safeName)
    mkdirSync(frameDir, { recursive: true })

    console.log(`\nCapturing "${clip.name}" → ${frameCount} frames @ ${FPS}fps...`)

    // Select clip via the <select> dropdown in ControlBar.
    // The option label format is: "{name} ({duration}s)"
    const optionLabel = `${clip.name} (${clip.duration.toFixed(1)}s)`
    await dialog.locator('select').first().selectOption({ label: optionLabel })
    await page.waitForTimeout(400) // React re-render + mixer build + action start

    // Time-stepping: seek to exact animation times, then capture.
    // seek() sets isPlaying=false, AnimationPlayerInternal's effect
    // calls mixer.setTime(time), and the next GPU render reflects it.
    for (let i = 0; i < frameCount; i++) {
      const t = i / FPS
      await page.evaluate((time) => {
        window.__animationStore?.getState().seek(time)
      }, t)
      // Allow: Zustand → React re-render → useEffect → mixer.setTime → GPU render
      await page.waitForTimeout(120)

      const framePath = path.join(frameDir, `frame_${String(i).padStart(5, '0')}.png`)
      await page.screenshot({ path: framePath, type: 'png' })
    }

    // ── Encode with ffmpeg ──────────────────────────────────────
    const outWebm = path.join(OUT, `${safeName}.webm`)
    const outMp4 = path.join(OUT, `${safeName}.mp4`)

    try {
      execSync(
        `ffmpeg -y -framerate ${FPS} -i "${path.join(frameDir, 'frame_%05d.png')}" ` +
        `-c:v libvpx-vp9 -crf 30 -b:v 0 -pix_fmt yuva420p "${outWebm}"`,
        { stdio: 'pipe', timeout: 120000 },
      )
      console.log(`  ✅ ${safeName}.webm`)
    } catch (e) {
      console.error(`  ❌ webm encode failed: ${e.stderr?.toString() || e.message}`)
    }

    try {
      execSync(
        `ffmpeg -y -framerate ${FPS} -i "${path.join(frameDir, 'frame_%05d.png')}" ` +
        `-c:v libx264 -crf 23 -preset fast -pix_fmt yuv420p "${outMp4}"`,
        { stdio: 'pipe', timeout: 120000 },
      )
      console.log(`  ✅ ${safeName}.mp4`)
    } catch (e) {
      console.error(`  ❌ mp4 encode failed: ${e.stderr?.toString() || e.message}`)
    }

    // Cleanup temp frames
    rmSync(frameDir, { recursive: true })
  }

  // ── 6. Cleanup ─────────────────────────────────────────────────
  try { rmSync(TEMP, { recursive: true, force: true }) } catch {}
  await electronApp.close()
  console.log('\n🎉 Done! Videos saved to pages/public/screenshots/animations/')
}

main().catch((err) => {
  console.error('❌', err)
  process.exit(1)
})
