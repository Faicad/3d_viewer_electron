import { test, _electron, expect } from '@playwright/test'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { getElectronPath } from './utils'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const EXE = getElectronPath()

const SAMPLE_FN = `(() => {
  const c = document.querySelector('canvas')
  const w = c.width, h = c.height
  const os = document.createElement('canvas'); os.width = w; os.height = h
  os.getContext('2d').drawImage(c, 0, 0)
  const ctx = os.getContext('2d')
  const ref = ctx.getImageData(10, 10, 1, 1).data
  const bgBrightness = (ref[0] + ref[1] + ref[2]) / 3
  let darkCount = 0
  const threshold = bgBrightness * 0.7
  const all = []
  for (let x = Math.floor(w * 0.25); x < w * 0.75; x += 2) {
    for (let y = Math.floor(h * 0.5); y < h; y += 2) {
      const px = ctx.getImageData(x, y, 1, 1).data
      const b = (px[0] + px[1] + px[2]) / 3
      all.push(b)
      if (b < threshold) darkCount++
    }
  }
  const hist = [0,0,0,0,0]
  for (const b of all) { if (b < 50) hist[0]++; else if (b < 100) hist[1]++; else if (b < 150) hist[2]++; else if (b < 200) hist[3]++; else hist[4]++ }
  return { bgBrightness, darkCount, sampleCount: all.length, brightnessHistogram: hist }
})()`

test('shadow visible on small model after camera auto-fit', async () => {
  test.setTimeout(90000)
  const app = await _electron.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-gpu-sandbox'] })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.locator('canvas').first().waitFor({ state: 'attached', timeout: 15000 })

  await page.waitForFunction(() => !!(window as any).__engineStore, { timeout: 10000 })

  // Maximize shadow visibility
  await page.evaluate(() => {
    const es = (window as any).__engineStore
    es.getState().setShadowOpacity(0.9)
    es.getState().setEnvBackground('grey')
  })

  const GLB = readFileSync(path.join(__dirname, 'fixtures', 'box_boss.glb'))
  await page.locator('input[type="file"]').setInputFiles({ name: 'b.glb', mimeType: 'model/gltf-binary', buffer: GLB })
  await page.waitForFunction(() => (window as any).__modelStore?.getState().__loadingPhase === 'done', { timeout: 15000 }).catch(() => {})

  // Wait for camera fit animation to complete (max 1.5s animation + render settle)
  await page.waitForFunction(() => {
    const cam = (window as any).__r3f_dev?.camera
    if (!cam) return false
    // Camera close to model means fit animation finished
    return cam.position.length() < 1
  }, { timeout: 5000 })

  // Verify shadow frustum is tight (not the old static near=0.5/far=500)
  const shadowInfo = await page.evaluate(() => {
    const es = (window as any).__engineStore
    const result: any = { modelBbox: es.getState().modelBbox }
    ;(window as any).__r3f_dev.scene.traverse((o: any) => {
      if (o.isDirectionalLight) {
        result.shadowFrustum = {
          left: o.shadow.camera.left,
          right: o.shadow.camera.right,
          top: o.shadow.camera.top,
          bottom: o.shadow.camera.bottom,
          near: o.shadow.camera.near,
          far: o.shadow.camera.far,
        }
      }
    })
    return result
  })

  console.log('SHADOW FRUSTUM:', JSON.stringify(shadowInfo))

  // far/near ratio must be < 50 (fix verification)
  if (shadowInfo.shadowFrustum) {
    const ratio = shadowInfo.shadowFrustum.far / shadowInfo.shadowFrustum.near
    expect(ratio).toBeLessThan(50)
  }

  // Take screenshot for visual inspection
  await page.screenshot({ path: path.join(__dirname, '..', '..', 'diag-fit.png') })

  // Sample pixels: shadows should be visible (dark pixels below model)
  const fitPixels = await page.evaluate(SAMPLE_FN)
  console.log(`Fit: ${fitPixels.darkCount}/${fitPixels.sampleCount} dark, hist=${JSON.stringify(fitPixels.brightnessHistogram)}`)

  // Assert: shadows must be visible (dark pixels exist)
  expect(fitPixels.darkCount, 'shadow pixels must exist after camera fit').toBeGreaterThan(100)
  // Bin 0 (brightness < 50) must have some very dark pixels (shadow core)
  expect(fitPixels.brightnessHistogram[0], 'must have very dark shadow pixels').toBeGreaterThan(10)

  await app.close()
})
