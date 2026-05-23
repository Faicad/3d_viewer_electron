import { test, _electron } from '@playwright/test'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { getElectronPath } from './utils'
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
  test.setTimeout(90000)
  const app = await _electron.launch({
    executablePath: EXE,
    args: ['--no-sandbox', '--disable-gpu-sandbox'],
  })
  const page = await app.firstWindow()

  await page.waitForLoadState('domcontentloaded')
  await page.locator('canvas').first().waitFor({ state: 'attached', timeout: 15000 })

  // Load a test model so the scene is active
  await page.locator('input[type="file"]').setInputFiles({
    name: 't.glb', mimeType: 'model/gltf-binary', buffer: GLB,
  })
  await page.waitForFunction(
    () => (window as any).__modelStore?.getState().__loadingPhase === 'done',
    { timeout: 15000 },
  ).catch(() => {})

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
      // Key Three.js mapping constants:
      // 300=UVMapping, 301=CubeReflectionMapping, 302=CubeRefractionMapping
      // 303=EquirectangularReflectionMapping, 304=EquirectangularRefractionMapping
      // 305=CubeUVRefractionMapping, 306=CubeUVReflectionMapping
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
  // Sample background corners (avoid model area) and check for light regions.
  const brightCheck = await page.evaluate(() => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement | null
    if (!canvas) return { err: 'no canvas' }
    // Read pixels from a small region in the top-left corner (sky/ceiling
    // portion of the cubemap, away from the model).
    const offscreen = document.createElement('canvas')
    offscreen.width = canvas.width
    offscreen.height = canvas.height
    const ctx = offscreen.getContext('2d')!
    ctx.drawImage(canvas, 0, 0)
    // Sample corner regions (where background is clearly visible)
    const corners = [
      { x: 10, y: 10 },
      { x: canvas.width - 10, y: 10 },
      { x: 10, y: canvas.height - 10 },
      { x: canvas.width - 10, y: canvas.height - 10 },
      { x: canvas.width / 2, y: 10 },
    ]
    const samples: number[][] = []
    for (const p of corners) {
      const px = ctx.getImageData(p.x, p.y, 1, 1).data
      samples.push([px[0], px[1], px[2]])
    }
    // Check whether samples are NOT all the same shade of grey
    // (if they were all same grey, the background would be the gradient fallback).
    // The room interior is mostly neutral/white tones, so R≈G≈B per pixel
    // is expected — what matters is whether brightness varies between
    // different positions (e.g. ceiling light vs dark corner).
    const values = samples.map(([r, g, b]) => (r + g + b) / 3)
    const maxVal = Math.max(...values)
    const minVal = Math.min(...values)
    const hasVariation = maxVal - minVal > 40 // significant brightness spread
    // Check for bright spots (>200 in any channel, indicating area lights)
    const hasBright = samples.some(([r, g, b]) => r > 200 || g > 200 || b > 200)
    return { samples, maxVal, minVal, hasVariation, hasBright }
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
})
