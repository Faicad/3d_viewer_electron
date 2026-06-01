/**
 * Captures fullscreen animation demo videos for the docs page.
 *
 * Launches the Electron app, loads the animated model, opens the animation
 * dialog, goes fullscreen, then captures each specified clip. The animation
 * fills the entire viewport without dialog chrome.
 *
 * Prerequisites: npm run build:unpacked + ffmpeg on PATH
 * Output: pages/public/screenshots/animations/{name}-fullscreen.webm + .mp4
 *
 * Usage: node scripts/capture-animation-fullscreen-demo.mjs
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
const TEMP = path.resolve(ROOT, '.temp-fs-frames')
const FPS = 15
const MAX_DURATION = 10 // seconds per clip

const CLIPS = ['Walking', 'Idle', 'Running', 'Dance']

async function main() {
  const exeName = process.platform === 'win32' ? '3D_Viewer.exe'
    : process.platform === 'darwin' ? '3D_Viewer.app/Contents/MacOS/3D_Viewer'
    : '3d_viewer_electron'
  const executablePath = path.join(ROOT, 'dist', 'win-unpacked', exeName)
  if (!existsSync(executablePath)) {
    console.error(`❌ Executable not found: ${executablePath}`)
    console.error('   Run "npm run build:unpacked" first.')
    process.exit(1)
  }

  // ── Launch Electron ────────────────────────────────────────────
  console.log('Launching Electron...')
  const electronApp = await _electron.launch({
    executablePath, args: ['--no-sandbox'],
    env: { ...process.env, E2E: '1' },
  })

  const page = await electronApp.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.locator('canvas').first().waitFor({ state: 'attached', timeout: 30000 })
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.waitForTimeout(2000)

  // Close right panel
  const toggleBtn = page.locator('button:has(svg.lucide-panel-right-close)').first()
  if (await toggleBtn.isVisible().catch(() => false)) {
    await toggleBtn.click(); await page.waitForTimeout(400)
  }

  // ── Load model ─────────────────────────────────────────────────
  console.log('Loading RobotExpressive.glb...')
  await page.evaluate(() => window.__modelStore?.getState().reset())
  const buf = readFileSync(path.join(FIXTURES, 'RobotExpressive.glb'))
  await page.locator('input[type="file"]').setInputFiles({
    name: 'RobotExpressive.glb', mimeType: 'model/gltf-binary', buffer: buf,
  })
  await page.waitForFunction(
    () => window.__modelStore?.getState().__loadingPhase === 'done',
    { timeout: 60000 },
  )
  await page.waitForTimeout(1500)

  // ── Open dialog + go fullscreen ────────────────────────────────
  const playBtn = page.locator('[data-testid="toolbar-animation-player"]')
  await playBtn.click()
  const dialog = page.locator('[role="dialog"]')
  await dialog.waitFor({ state: 'visible', timeout: 5000 })
  await page.waitForTimeout(500)

  const maximizeBtn = dialog.locator('button svg.lucide-maximize2').first()
  await maximizeBtn.click()
  await page.waitForTimeout(600)
  console.log('Fullscreen mode active\n')

  // ── Capture each clip ──────────────────────────────────────────
  mkdirSync(OUT, { recursive: true })

  for (const clipName of CLIPS) {
    // Find clip index
    const idx = await page.evaluate((name) => {
      const anims = window.__modelStore?.getState().loadedFiles[0]?.animations
      return anims?.findIndex(a => a.name === name) ?? -1
    }, clipName)
    if (idx < 0) { console.log(`  ⚠️ Clip "${clipName}" not found, skipping`); continue }

    const clipDuration = await page.evaluate((i) => {
      return window.__modelStore?.getState().loadedFiles[0]?.animations[i]?.duration ?? 1
    }, idx)
    const dur = Math.min(clipDuration, MAX_DURATION)
    const frameCount = Math.ceil(dur * FPS)

    // Select clip
    await page.evaluate((i) => {
      window.__animationStore?.getState().selectAnimation(i)
    }, idx)
    await page.waitForTimeout(400)

    // Capture frames
    mkdirSync(TEMP, { recursive: true })
    console.log(`Capturing ${clipName} (${dur.toFixed(1)}s) → ${frameCount} frames...`)
    for (let i = 0; i < frameCount; i++) {
      const t = i / FPS
      await page.evaluate((time) => {
        window.__animationStore?.getState().seek(time)
      }, t)
      await page.waitForTimeout(120)
      await page.screenshot({
        path: path.join(TEMP, `frame_${String(i).padStart(5, '0')}.png`),
        type: 'png',
      })
    }

    // Encode
    const safeName = clipName
    const outWebm = path.join(OUT, `${safeName}-fullscreen.webm`)
    const outMp4 = path.join(OUT, `${safeName}-fullscreen.mp4`)

    try {
      execSync(
        `ffmpeg -y -framerate ${FPS} -i "${path.join(TEMP, 'frame_%05d.png')}" ` +
        `-c:v libvpx-vp9 -crf 30 -b:v 0 -pix_fmt yuva420p "${outWebm}"`,
        { stdio: 'pipe', timeout: 60000 },
      ); console.log(`  ✅ ${safeName}-fullscreen.webm`)
    } catch (e) { console.error(`  ❌ webm: ${e.stderr?.toString() || e.message}`) }

    try {
      execSync(
        `ffmpeg -y -framerate ${FPS} -i "${path.join(TEMP, 'frame_%05d.png')}" ` +
        `-c:v libx264 -crf 23 -preset fast -pix_fmt yuv420p "${outMp4}"`,
        { stdio: 'pipe', timeout: 60000 },
      ); console.log(`  ✅ ${safeName}-fullscreen.mp4`)
    } catch (e) { console.error(`  ❌ mp4: ${e.stderr?.toString() || e.message}`) }

    rmSync(TEMP, { recursive: true })
  }

  // ── Cleanup ────────────────────────────────────────────────────
  await electronApp.close()
  console.log('\n🎉 Done!')
}

main().catch((err) => { console.error('❌', err); process.exit(1) })
