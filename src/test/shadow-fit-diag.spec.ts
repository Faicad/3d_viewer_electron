import { test, _electron } from '@playwright/test'
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
  let minB = 255, darkCount = 0
  const threshold = bgBrightness * 0.7
  const all = []
  for (let x = Math.floor(w * 0.25); x < w * 0.75; x += 2) {
    for (let y = Math.floor(h * 0.3); y < h; y += 2) {
      const px = ctx.getImageData(x, y, 1, 1).data
      const b = (px[0] + px[1] + px[2]) / 3
      all.push(b)
      if (b < minB) minB = b
      if (b < threshold) darkCount++
    }
  }
  const hist = [0,0,0,0,0]
  for (const b of all) { if (b < 50) hist[0]++; else if (b < 100) hist[1]++; else if (b < 150) hist[2]++; else if (b < 200) hist[3]++; else hist[4]++ }
  return { bgBrightness, minBrightness: minB, darkCount, sampleCount: all.length, brightnessHistogram: hist }
})()`

test('camera fit kills shadow on small models', async () => {
  test.setTimeout(90000)
  const app = await _electron.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-gpu-sandbox'] })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.locator('canvas').first().waitFor({ state: 'attached', timeout: 15000 })

  // Wait for engine store to be ready
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
  await page.waitForTimeout(2000) // camera-fit animation

  // --- After camera fit ---
  const afterFit = await page.evaluate(() => {
    const cam = (window as any).__r3f_dev.camera
    const result: any = { cameraPos: [cam.position.x, cam.position.y, cam.position.z] }
    const es = (window as any).__engineStore
    result.modelBbox = es.getState().modelBbox
    let sf: any = null
    ;(window as any).__r3f_dev.scene.traverse((o: any) => { if (o.isDirectionalLight) sf = { left: o.shadow.camera.left, right: o.shadow.camera.right, top: o.shadow.camera.top, bottom: o.shadow.camera.bottom } })
    result.shadowFrustum = sf
    return result
  })
  console.log('AFTER FIT:', JSON.stringify(afterFit))

  await page.screenshot({ path: path.join(__dirname, '..', '..', 'diag-fit.png') })
  const fitPixels = await page.evaluate(SAMPLE_FN)
  console.log('FIT PIXELS:', JSON.stringify(fitPixels))

  // --- Move camera far away ---
  await page.evaluate(() => {
    const cam = (window as any).__r3f_dev.camera
    cam.position.set(5, -5, 3)
    cam.lookAt(0, 0, 0)
    cam.updateProjectionMatrix()
  })
  await page.waitForTimeout(600)

  await page.screenshot({ path: path.join(__dirname, '..', '..', 'diag-far.png') })
  const farPixels = await page.evaluate(SAMPLE_FN)
  console.log('FAR PIXELS:', JSON.stringify(farPixels))

  console.log(`\nFit: ${fitPixels.darkCount}/${fitPixels.sampleCount} dark, min=${fitPixels.minBrightness.toFixed(0)}, hist=${JSON.stringify(fitPixels.brightnessHistogram)}`)
  console.log(`Far: ${farPixels.darkCount}/${farPixels.sampleCount} dark, min=${farPixels.minBrightness.toFixed(0)}, hist=${JSON.stringify(farPixels.brightnessHistogram)}`)

  await app.close()
})
