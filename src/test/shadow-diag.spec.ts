import { test, _electron } from '@playwright/test'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { getElectronPath } from './utils'
import { isSoftwareGpu } from './gpu-utils'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const EXE = getElectronPath()
const GLB = readFileSync(path.join(__dirname, 'fixtures', 'box_boss.glb'))

test('shadow visibility diagnostic', async () => {
  test.setTimeout(90000)
  const app = await _electron.launch({
    executablePath: EXE,
    args: ['--no-sandbox', '--disable-gpu-sandbox'],
    env: { ...process.env, E2E: '1' },
  })
  const page = await app.firstWindow()

  await page.waitForLoadState('domcontentloaded')
  await page.locator('canvas').first().waitFor({ state: 'attached', timeout: 15000 })

  // Load model
  await page.locator('input[type="file"]').setInputFiles({
    name: 'box_boss.glb', mimeType: 'model/gltf-binary', buffer: GLB,
  })
  await page.waitForFunction(
    () => (window as any).__modelStore?.getState().__loadingPhase === 'done',
    { timeout: 15000 },
  ).catch(() => {})

  // Wait for camera auto-fit to settle
  await page.waitForFunction(() => {
    const es = (window as any).__engineStore
    if (!es) return false
    return es.getState().__animActive === false || es.getState().__animActive === undefined
  }, { timeout: 10000 }).catch(() => {})

  // Increase shadow opacity for better visibility
  await page.evaluate(() => {
    const es = (window as any).__engineStore
    es.getState().setShadowOpacity(0.9)
    es.getState().setEnvBackground('grey')
  })

  // Wait a frame for shadow to render
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)))

  // --- Full shadow diagnostic ---
  const diag = await page.evaluate(() => {
    const d = (window as any).__r3f_dev as any
    if (!d) return { err: 'no __r3f_dev' }
    const scene: THREE.Scene = d.scene
    const gl: THREE.WebGLRenderer = d.gl
    const result: any = {}

    // 1. Renderer shadow settings
    result.shadowMapEnabled = gl.shadowMap?.enabled
    result.shadowMapType = gl.shadowMap?.type

    // 2. Find the directional light
    const dirLights: any[] = []
    scene.traverse((obj: any) => {
      if (obj.isDirectionalLight) {
        dirLights.push({
          uuid: obj.uuid,
          position: [obj.position.x, obj.position.y, obj.position.z],
          intensity: obj.intensity,
          castShadow: obj.castShadow,
          up: [obj.up.x, obj.up.y, obj.up.z],
          shadow: {
            mapSize: [obj.shadow?.mapSize?.width, obj.shadow?.mapSize?.height],
            cameraNear: obj.shadow?.camera?.near,
            cameraFar: obj.shadow?.camera?.far,
            cameraLeft: obj.shadow?.camera?.left,
            cameraRight: obj.shadow?.camera?.right,
            cameraTop: obj.shadow?.camera?.top,
            cameraBottom: obj.shadow?.camera?.bottom,
            bias: obj.shadow?.bias,
          },
        })
      }
    })
    result.directionalLights = dirLights

    // 3. Find shadow floor
    const shadowFloors: any[] = []
    scene.traverse((obj: any) => {
      if (obj.name === 'shadowFloor') {
        obj.traverse((child: any) => {
          shadowFloors.push({
            type: child.type || child.constructor?.name,
            name: child.name,
            visible: child.visible,
            isMesh: child.isMesh,
            receiveShadow: child.receiveShadow,
            castShadow: child.castShadow,
            position: [child.position.x, child.position.y, child.position.z],
            rotation: [child.rotation.x, child.rotation.y, child.rotation.z],
            scale: [child.scale?.x, child.scale?.y, child.scale?.z],
            materialType: child.material?.type,
            materialOpacity: child.material?.opacity,
            materialDepthWrite: child.material?.depthWrite,
            materialTransparent: child.material?.transparent,
            geometryType: child.geometry?.type,
          })
        })
      }
    })
    result.shadowFloors = shadowFloors

    // 4. Model bbox from store
    const es = (window as any).__engineStore
    if (es) {
      result.modelBbox = es.getState().modelBbox
      result.shadowFloorEnabled = es.getState().shadowFloorEnabled
      result.shadowOpacity = es.getState().shadowOpacity
      result.envRotation = es.getState().envRotation
      result.selectedEnv = es.getState().selectedEnv
      result.envBackground = es.getState().envBackground
      result.sceneUp = es.getState().scene?.up
    }

    // 5. Scene-level properties
    result.hasEnv = !!scene.environment
    result.sceneUp = [scene.up.x, scene.up.y, scene.up.z]
    result.sceneEnvIntensity = scene.environmentIntensity
    result.sceneEnvRotation = [scene.environmentRotation?.x, scene.environmentRotation?.y, scene.environmentRotation?.z]
    result.sceneBgRotation = [scene.backgroundRotation?.x, scene.backgroundRotation?.y, scene.backgroundRotation?.z]

    // 6. Find meshes with castShadow/receiveShadow
    const shadowMeshes: any[] = []
    let totalCastShadow = 0
    let totalReceiveShadow = 0
    scene.traverse((obj: any) => {
      if (obj.isMesh && obj.name !== 'shadowFloor') {
        if (obj.castShadow) totalCastShadow++
        if (obj.receiveShadow) totalReceiveShadow++
        if (shadowMeshes.length < 3) {
          shadowMeshes.push({
            name: obj.name,
            castShadow: obj.castShadow,
            receiveShadow: obj.receiveShadow,
            position: [obj.position.x, obj.position.y, obj.position.z],
          })
        }
      }
    })
    result.totalCastShadow = totalCastShadow
    result.totalReceiveShadow = totalReceiveShadow
    result.sampleShadowMeshes = shadowMeshes

    return result
  })

  console.log('SHADOW DIAG:', JSON.stringify(diag, null, 2))

  // Take screenshot for visual inspection
  await page.screenshot({ path: path.join(__dirname, '..', '..', 'diag.png') })

  // --- Pixel-level shadow check (dense sampling, matches shadow-fit approach) ---
  const pixelCheck = await page.evaluate(() => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement | null
    if (!canvas) return { err: 'no canvas' }

    const w = canvas.width
    const h = canvas.height
    const offscreen = document.createElement('canvas')
    offscreen.width = w
    offscreen.height = h
    const ctx = offscreen.getContext('2d')!
    ctx.drawImage(canvas, 0, 0)

    // Background reference: sample corners
    const cornerPixels: number[] = []
    for (const [cx, cy] of [[10, 10], [w - 10, 10], [10, h - 10], [w - 10, h - 10]]) {
      const px = ctx.getImageData(cx, cy, 1, 1).data
      cornerPixels.push((px[0] + px[1] + px[2]) / 3)
    }
    const bgBrightness = cornerPixels.reduce((a, b) => a + b, 0) / cornerPixels.length
    const threshold = bgBrightness * 0.7

    // Dense sampling over the lower-center region
    let darkCount = 0
    const all: number[] = []
    for (let x = Math.floor(w * 0.25); x < w * 0.75; x += 2) {
      for (let y = Math.floor(h * 0.5); y < h; y += 2) {
        const px = ctx.getImageData(x, y, 1, 1).data
        const b = (px[0] + px[1] + px[2]) / 3
        all.push(b)
        if (b < threshold) darkCount++
      }
    }
    let histMin = 255
    const hist = [0, 0, 0, 0, 0]
    for (const b of all) {
      if (b < histMin) histMin = b
      if (b < 50) hist[0]++
      else if (b < 100) hist[1]++
      else if (b < 150) hist[2]++
      else if (b < 200) hist[3]++
      else hist[4]++
    }
    const minBrightness = histMin
    const hasDarkPixels = darkCount > 50

    return { bgBrightness, darkCount, sampleCount: all.length, minBrightness, brightnessHistogram: hist, hasDarkPixels }
  })

  console.log('PIXEL CHECK:', JSON.stringify(pixelCheck, null, 2))

  // Basic assertions
  test.expect(diag.shadowMapEnabled, 'shadowMap should be enabled').toBe(true)
  test.expect(diag.directionalLights.length, 'should have directional light').toBeGreaterThan(0)

  const light = diag.directionalLights[0]
  test.expect(light.castShadow, 'light should castShadow').toBe(true)
  test.expect(light.up, 'light up should be [0,0,1]').toEqual([0, 0, 1])

  // Verify shadow floor exists and is visible.
  // On software GPU (llvmpipe / SwiftShader / WARP) PMREM generation fails,
  // so shadow floor is never configured and shadows don't render.
  // See simple-rendering-mode-design.md.
  if (await isSoftwareGpu(page)) {
    console.log('SKIP: software GPU — shadow floor / pixel assertions unavailable')
    await app.close()
    return
  }

  test.expect(diag.shadowFloors.length, 'shadow floor mesh should exist').toBeGreaterThan(0)

  const floorMesh = diag.shadowFloors.find((f: any) => f.isMesh)
  test.expect(floorMesh, 'shadow floor should have a mesh child').toBeTruthy()
  test.expect(floorMesh.receiveShadow, 'shadow floor should receiveShadow').toBe(true)

  // Verify model meshes cast shadows
  test.expect(diag.totalCastShadow, 'model meshes should castShadow').toBeGreaterThan(0)

  // Verify shadow pixels exist (darker regions below the model)
  console.log(`\nBackground brightness: ${pixelCheck.bgBrightness.toFixed(0)}`)
  console.log(`Dark pixels: ${pixelCheck.darkCount}/${pixelCheck.sampleCount}`)
  console.log(`Min brightness: ${pixelCheck.minBrightness.toFixed(0)}`)
  console.log(`Brightness histogram: ${JSON.stringify(pixelCheck.brightnessHistogram)}`)

  test.expect(pixelCheck.hasDarkPixels, 'should have dark pixels indicating shadows on the ground').toBe(true)

  await app.close()
})
