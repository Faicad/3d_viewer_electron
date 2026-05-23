/**
 * E2E test for selection highlight visual artifacts.
 *
 * Reproduces the bug where the selection highlight overlay uses depthTest +
 * polygonOffset to render slightly in front of the model mesh, causing
 * z-fighting that manifests as white dots/stripes from the model's specular
 * PBR highlights poking through. During camera rotation the z-fighting
 * pattern flickers because polygon offset is slope-dependent and the depth
 * buffer has limited precision.
 *
 * The fix: use depthTest=false on the highlight material. A selection
 * highlight should always be visible on the selected object; rendering
 * on top without depth testing is the correct behavior and eliminates
 * z-fighting entirely.
 */
import { test, expect, _electron, ElectronApplication, Page } from '@playwright/test'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getElectronPath } from './utils'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'box_fillet.glb')
const GLB_BUFFER = readFileSync(FIXTURE_PATH)

async function waitForLoadDone(page: Page, timeout = 30000) {
  await page.waitForFunction(
    () => window.__modelStore?.getState().__loadingPhase === 'done',
    { timeout },
  )
}

test.describe('Selection Highlight Artifacts', () => {
  let app: ElectronApplication

  test.beforeAll(async () => {
    app = await _electron.launch({
      executablePath: getElectronPath(),
      args: ['--no-sandbox', '--ozone-platform-hint=x11'],
      env: { ...process.env, E2E: '1' },
    })
  })

  test.afterAll(async () => {
    if (app) await app.close()
  })

  test('highlight does not use depthTest, preventing z-fighting with the model', async () => {
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.locator('canvas').first().waitFor({ state: 'attached', timeout: 20000 })

    const renderErrors: string[] = []
    page.on('pageerror', (err) => renderErrors.push(err.message))

    // Load box_fillet.glb
    await page.locator('input[type="file"]').setInputFiles({
      name: 'box_fillet.glb',
      mimeType: 'model/gltf-binary',
      buffer: GLB_BUFFER,
    })
    await waitForLoadDone(page)

    // Click center of canvas to select the model (object mode)
    const canvas = page.locator('canvas').first()
    const box = await canvas.boundingBox()
    expect(box).not.toBeNull()
    await canvas.click({ position: { x: box!.width / 2, y: box!.height / 2 } })

    // Wait for the highlight mesh to appear in the scene
    await page.waitForTimeout(500)

    // Verify highlight material properties
    const materialInfo = await page.evaluate(() => {
      const dev = (window as any).__r3f_dev
      if (!dev?.scene) return { error: 'no __r3f_dev.scene' }

      const highlights: any[] = []
      const models: any[] = []

      dev.scene.traverse((obj: any) => {
        if (!obj.isMesh) return
        const mat = obj.material
        if (!mat) return

        const materials = Array.isArray(mat) ? mat : [mat]
        for (const m of materials) {
          if (m.type === 'MeshBasicMaterial' && m.transparent && m.opacity > 0 && m.opacity < 1) {
            highlights.push({
              type: m.type,
              depthTest: m.depthTest,
              depthWrite: m.depthWrite,
              depthFunc: m.depthFunc,
              polygonOffset: m.polygonOffset,
              polygonOffsetFactor: m.polygonOffsetFactor,
              polygonOffsetUnits: m.polygonOffsetUnits,
              transparent: m.transparent,
              opacity: m.opacity,
            })
          } else if (m.type === 'MeshPhysicalMaterial' || m.type === 'MeshStandardMaterial') {
            models.push({
              type: m.type,
              depthTest: m.depthTest,
              depthWrite: m.depthWrite,
              polygonOffset: m.polygonOffset,
              polygonOffsetFactor: m.polygonOffsetFactor,
              polygonOffsetUnits: m.polygonOffsetUnits,
            })
          }
        }
      })

      return { highlights, models }
    })

    // A highlight mesh must exist
    expect(materialInfo.highlights.length).toBeGreaterThan(0)

    // The fix: highlight material must NOT use depthTest — this is the key
    // property that prevents z-fighting. Without depthTest, the highlight
    // always renders on top, regardless of polygon offset or depth buffer
    // precision.
    for (const h of materialInfo.highlights) {
      expect(
        h.depthTest,
        `Highlight depthTest should be false to prevent z-fighting, got depthTest=${h.depthTest}`,
      ).toBe(false)
    }

    // Highlight must not write to depth buffer (so it doesn't affect SSAO or
    // subsequent rendering of other objects)
    for (const h of materialInfo.highlights) {
      expect(h.depthWrite).toBe(false)
    }

    // Simulate camera rotation by directly modifying camera position
    // (avoids needing to interact with OrbitControls in test)
    await page.evaluate(() => {
      const dev = (window as any).__r3f_dev as any
      if (!dev?.camera) return
      const cam = dev.camera
      const pos = cam.position.clone()
      const angle = 0.5
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      cam.position.set(
        pos.x * cos - pos.z * sin,
        pos.y,
        pos.x * sin + pos.z * cos,
      )
      cam.lookAt(0, 0, 0)
    })

    // Let multiple frames render after camera change
    await page.waitForTimeout(500)

    // Rotate back
    await page.evaluate(() => {
      const dev = (window as any).__r3f_dev as any
      if (!dev?.camera) return
      const cam = dev.camera
      const pos = cam.position.clone()
      const angle = -0.5
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      cam.position.set(
        pos.x * cos - pos.z * sin,
        pos.y,
        pos.x * sin + pos.z * cos,
      )
      cam.lookAt(0, 0, 0)
    })

    await page.waitForTimeout(500)

    // No rendering errors should have occurred
    expect(renderErrors).toEqual([])
  })
})
