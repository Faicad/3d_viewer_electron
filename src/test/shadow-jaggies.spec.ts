import { test, _electron, expect } from '@playwright/test'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { getElectronPath } from './utils'
import { isSoftwareGpu } from './gpu-utils'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const EXE = getElectronPath()
const GLB = readFileSync(path.join(__dirname, 'fixtures', 'box_fillet.glb'))

test('shadow should not have severe aliasing on box_fillet.glb', async () => {
  test.setTimeout(90000)
  const app = await _electron.launch({
    executablePath: EXE,
    args: ['--no-sandbox', '--ozone-platform-hint=x11'],
    env: { ...process.env, E2E: '1' },
  })
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

  // Load box_fillet.glb
  await page.locator('input[type="file"]').setInputFiles({
    name: 'box_fillet.glb',
    mimeType: 'model/gltf-binary',
    buffer: GLB,
  })
  await page.waitForFunction(
    () => (window as any).__modelStore?.getState().__loadingPhase === 'done',
    { timeout: 15000 },
  ).catch(() => {})

  // Wait for camera auto-fit animation to start then finish
  await page.waitForFunction(() => {
    const es = (window as any).__engineStore
    return es?.getState().__animActive === true
  }, { timeout: 10000 }).catch(() => {})
  await page.waitForFunction(() => {
    const es = (window as any).__engineStore
    return es?.getState().__animActive === false
  }, { timeout: 15000 }).catch(() => {})

  // Collect shadow diagnostic info
  const diag = await page.evaluate(() => {
    const d = (window as any).__r3f_dev as any
    if (!d) return { err: 'no __r3f_dev' }
    const es = (window as any).__engineStore
    const result: any = {}

    result.modelBbox = es.getState().modelBbox
    result.shadowMapSize = null
    result.shadowFrustum = null

    d.scene.traverse((o: any) => {
      if (o.isDirectionalLight) {
        result.shadowMapSize = [o.shadow?.mapSize?.width, o.shadow?.mapSize?.height]
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

  console.log('BOX FILLET SHADOW DIAG:', JSON.stringify(diag, null, 2))

  // On software GPU shadow maps are disabled — skip the remaining assertions.
  // See simple-rendering-mode-design.md.
  if (await isSoftwareGpu(page)) {
    console.log('SKIP: software GPU — shadow map assertions unavailable')
    await app.close()
    return
  }

  // Assertions
  expect(diag.modelBbox, 'model must have bbox').toBeTruthy()
  expect(diag.shadowMapSize, 'shadow map must be set').toBeTruthy()
  expect(diag.shadowFrustum, 'shadow frustum must be set').toBeTruthy()

  const mapW = diag.shadowMapSize[0]
  expect(mapW, 'shadow map should be ≥ 2048 for quality').toBeGreaterThanOrEqual(2048)

  const frustum = diag.shadowFrustum
  const frustumWidth = frustum.right - frustum.left
  const texelsPerUnit = mapW / frustumWidth
  console.log(`Shadow map: ${mapW}px, frustum width: ${frustumWidth.toFixed(1)}, texels/unit: ${texelsPerUnit.toFixed(1)}`)

  // Must have ≥ 6 texels per world unit to avoid visible jaggies (was ~1-3 before fix)
  expect(texelsPerUnit, `texel density ${texelsPerUnit.toFixed(1)} < 6`).toBeGreaterThanOrEqual(6)

  // far/near ratio must be tight
  const ratio = frustum.far / frustum.near
  expect(ratio, `far/near ratio ${ratio.toFixed(1)} ≥ 50`).toBeLessThan(50)

  // Take screenshot for visual inspection
  await page.screenshot({ path: path.join(__dirname, '..', '..', 'diag-box-fillet.png') })

  await app.close()
})
