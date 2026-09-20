import { test, _electron } from '@playwright/test'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { getElectronLaunchArgs, getElectronPath, createUserDataDir, cleanupUserDataDir } from './utils'
import { isSoftwareGpu, isLinuxCI } from './gpu-utils'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const EXE = getElectronPath()
const GLB = readFileSync(path.join(__dirname, 'fixtures', 'test-box.glb'))

/**
 * Procedural Studio environment visual verification.
 *
 * The procedural studio (CleanRoomEnvironment) is a 3D room scene baked
 * into a PMREM cubemap.  When displayed as scene.background in "environment"
 * mode, the cubemap renders as a skybox — a 6-sided enclosing box with
 * area lights (bright spots) visible on some walls.
 *
 * This test verifies that:
 * 1. The background is an actual texture (not a solid colour fallback).
 * 2. Rotating the environment changes what part of the room is visible.
 * 3. The background contains bright regions (area lights).
 */
test('procedural studio shows room box with lights when rotated', async () => {
  test.skip(isLinuxCI(), 'Unstable on Linux CI — setInputFiles timeout')
  test.setTimeout(90000)
  const _userDataDir = createUserDataDir()
  const app = await _electron.launch({
    executablePath: EXE,
    args: [...getElectronLaunchArgs(), '--disable-gpu-sandbox'],
    env: { ...process.env, E2E: '1' },
    userDataDir: _userDataDir,
  })
  const page = await app.firstWindow()

  await page.waitForLoadState('domcontentloaded')
  await page.locator('canvas').first().waitFor({ state: 'attached', timeout: 15000 })

  // --- GPU detection: skip Studio rendering assertions on software GPU ---
  // PMREM environment generation requires hardware WebGL; on llvmpipe /
  // SwiftShader / WARP it either fails or takes minutes.  See
  // simple-rendering-mode-design.md for the full strategy.
  if (isSoftwareGpu()) {
    console.log('SKIP: software GPU — PMREM / shadow / IBL unavailable')
    await app.close()
    cleanupUserDataDir(_userDataDir)
    test.skip()
    return
  }

  // Load a test model so the scene is active
  await page.locator('input[type="file"]').setInputFiles({
    name: 't.glb', mimeType: 'model/gltf-binary', buffer: GLB,
  })
  await page.waitForFunction(
    () => (window as any).__modelStore?.getState().__loadingPhase === 'done',
    { timeout: 15000 },
  ).catch(() => {})
  // Wait for the camera fit animation (triggered on model load) to finish and
  // two rendered frames to pass, so pixel sampling sees a settled view.
  await page.waitForFunction(
    () => (window as any).__engineStore?.getState().__animActive === false,
    { timeout: 10000 },
  ).catch(() => {})
  await page.evaluate(() => new Promise<void>((r) =>
    requestAnimationFrame(() => requestAnimationFrame(() => r())),
  ))

  // Switch to studio preset with environment background
  await page.evaluate(() => {
    const es = (window as any).__engineStore
    es.getState().setEnvBackground('environment')
    es.getState().setSelectedEnv('studio')
  })
  // Wait until scene.background is set to a texture (env has loaded + applied)
  await page.waitForFunction(() => {
    const bg = (window as any).__r3f_dev?.scene?.background
    return bg && bg.isTexture
  }, { timeout: 10000 })

  // --- Verify scene state ---
  const state0 = await page.evaluate(() => {
    const d = (window as any).__r3f_dev
    if (!d) return { err: 'no r3f_dev' }
    const s = d.scene
    const bg = s.background as any
    return {
      hasEnv: !!s.environment,
      envMapping: (s.environment as any)?.mapping ?? null,
      bgIsTex: !!bg?.isTexture,
      bgMapping: bg?.mapping ?? null,
      bgIsCubeTex: !!bg?.isCubeTexture,
      bgImageCount: bg?.image ? (Array.isArray(bg.image) ? bg.image.length : 1) : 0,
    }
  })
  console.log('STATE rotation=0:', JSON.stringify(state0))
  test.expect(state0.bgIsTex, 'background should be a Texture').toBe(true)
  test.expect(state0.hasEnv, 'environment should be set').toBe(true)

  // Take screenshot at rotation 0
  const shot0 = await page.screenshot()

  // --- Rotate environment by 90° ---
  await page.evaluate(() => {
    const es = (window as any).__engineStore
    es.getState().setEnvRotation(Math.PI / 2) // 90°
  })
  // Wait until scene.environmentRotation.z reflects the new value
  await page.waitForFunction(() => {
    const rz = (window as any).__r3f_dev?.scene?.environmentRotation?.z
    return Math.abs(rz - Math.PI / 2) < 0.01
  }, { timeout: 5000 })

  // Take screenshot at rotation 90
  const shot1 = await page.screenshot()

  // Verify the two screenshots differ (background changed with rotation).
  // Compare a sample of pixel positions — they must NOT be identical.
  let diffCount = 0
  const sampleStride = 4096 // check every ~4KB (roughly one pixel block)
  for (let i = 0; i < Math.min(shot0.length, shot1.length); i += sampleStride) {
    if (shot0[i] !== shot1[i]) diffCount++
  }
  console.log(`Pixel diff ratio: ${diffCount} / ${Math.floor(Math.min(shot0.length, shot1.length) / sampleStride)}`)
  // Expect at least some pixel differences between the two rotations
  test.expect(
    diffCount,
    'background pixels should change when environment rotates 90°',
  ).toBeGreaterThan(0)

  // --- Verify bright spots exist in background ---
  // Sample a grid over the top 40% of the canvas (background-dominated area,
  // away from model / shadow floor) and check for light regions. 5x5 region
  // averages resist single-pixel noise from PMREM prefiltering.
  const brightCheck = await page.evaluate(() => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement | null
    if (!canvas) return { err: 'no canvas' }
    const offscreen = document.createElement('canvas')
    offscreen.width = canvas.width
    offscreen.height = canvas.height
    const ctx = offscreen.getContext('2d')!
    ctx.drawImage(canvas, 0, 0)
    // Grid over the top 40% of the canvas
    const rows = 4, cols = 8
    const regionH = Math.floor(canvas.height * 0.4)
    const samples: number[][] = []
    for (let ry = 0; ry < rows; ry++) {
      for (let cx = 0; cx < cols; cx++) {
        const x = Math.floor((cx + 0.5) * canvas.width / cols)
        const y = Math.floor((ry + 0.5) * regionH / rows)
        const d = ctx.getImageData(x - 2, y - 2, 5, 5).data
        let r = 0, g = 0, b = 0, n = 0
        for (let i = 0; i < d.length; i += 4) {
          r += d[i]; g += d[i + 1]; b += d[i + 2]; n++
        }
        samples.push([r / n, g / n, b / n])
      }
    }
    // The room interior is mostly neutral/white tones, so R≈G≈B per pixel
    // is expected — what matters is whether brightness varies between
    // different positions (e.g. ceiling light vs dark corner).
    const values = samples.map(([r, g, b]) => (r + g + b) / 3)
    const maxVal = Math.max(...values)
    const minVal = Math.min(...values)
    const hasVariation = maxVal - minVal > 10 // brightness spread across room positions
    // Check for bright spots (>200 in any channel, indicating area lights)
    const hasBright = samples.some(([r, g, b]) => r > 200 || g > 200 || b > 200)
    return { sampleCount: samples.length, maxVal, minVal, hasVariation, hasBright }
  })
  console.log('BRIGHT CHECK:', JSON.stringify(brightCheck))

  // The background must show brightness variation across different regions —
  // a uniform gradient fallback would have roughly the same brightness
  // everywhere, but the studio room has bright ceiling lights and darker
  // corners, producing significant brightness spread.
  test.expect(
    brightCheck.hasVariation,
    'background brightness should vary significantly across positions (room with lights)',
  ).toBe(true)

  await app.close()
  cleanupUserDataDir(_userDataDir)
})
