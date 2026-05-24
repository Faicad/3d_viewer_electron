import { test, expect, ElectronApplication, _electron, Page } from '@playwright/test'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getElectronPath } from './utils'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SPHERE_GLB = readFileSync(path.join(__dirname, 'fixtures', 'sphere.glb'))

function trackErrors(page: Page) {
  const pageErrors: string[] = []
  page.on('pageerror', (err) => pageErrors.push(String(err)))
  return {
    async assertNoErrors() {
      const appErrors = await page.evaluate(() =>
        (window as any).__errors.map((e: Error) => `${e.message}\n${e.stack}`),
      )
      const all = [...pageErrors, ...appErrors]
      expect(all, `Unexpected errors:\n${all.join('\n')}`).toEqual([])
    },
  }
}

async function waitForLoadDone(page: Page, timeout = 60000) {
  await page.waitForFunction(
    () => (window as any).__modelStore?.getState().__loadingPhase === 'done',
    { timeout },
  )
}

test.describe('Cross Section — Sphere Shape Verification', () => {
  let electronApp: ElectronApplication
  let page: Page

  test.beforeAll(async () => {
    electronApp = await _electron.launch({
      executablePath: getElectronPath(),
      args: ['--no-sandbox', '--ozone-platform-hint=x11'],
      env: { ...process.env, E2E: '1' },
    })
    page = await electronApp.firstWindow()

    await page.locator('input[type="file"]').setInputFiles({
      name: 'sphere.glb',
      mimeType: 'model/gltf-binary',
      buffer: SPHERE_GLB,
    })
    await waitForLoadDone(page)
  })

  test.afterAll(async () => {
    await electronApp.close()
  })

  test('cross-section caps of a sphere are circular, not rectangular', async () => {
    const { assertNoErrors } = trackErrors(page)

    // Open panel → click toolbar button
    const csButton = page.getByLabel('剖面显示')
    await csButton.click()
    await page.locator('text=剖面显示').first().waitFor({ state: 'visible', timeout: 5000 })
    await new Promise((r) => setTimeout(r, 300))

    // Turn OFF showClipPlane so the helper quad doesn't interfere with cap pixel counting
    const checkboxes = page.locator('input[type="checkbox"]')
    const showCb = checkboxes.nth(0)
    if (await showCb.isChecked()) await showCb.uncheck()
    await new Promise((r) => setTimeout(r, 200))

    // Move ONLY X slider to 50% — single plane through sphere center.
    // Y and Z stay at edges (0% and 100%) so they don't clip the cap.
    const sliders = page.locator('input[type="range"]')
    await sliders.nth(0).fill('50')  // X → 50%, center of sphere
    await sliders.nth(1).fill('0')   // Y → 0%, at edge
    await sliders.nth(2).fill('100') // Z → 100%, at edge
    await new Promise((r) => setTimeout(r, 800))

    // Analyze pixel colors and shape within the model's projected bbox
    const result = await page.evaluate(() => {
      const r3f = (window as any).__r3f_dev
      if (!r3f?.gl || !r3f?.camera || !r3f?.scene) return { error: 'no r3f' }
      const gl = r3f.gl; const camera = r3f.camera; const scene = r3f.scene
      const canvas = gl.domElement as HTMLCanvasElement

      // Count crossSection meshes
      let csMeshCount = 0
      scene.traverse((obj: any) => {
        if (obj.userData?._crossSectionInternal) {
          csMeshCount++
        }
      })
      const cw = canvas.width, ch = canvas.height

      const bboxArr = (window as any).__engineStore?.getState().modelBbox as number[] | null
      if (!bboxArr || bboxArr.length !== 6) return { error: 'no bbox' }

      // Project 3D bbox to screen space (plain JS, no THREE)
      const vm = camera.matrixWorldInverse.elements as Float32Array
      const pm = camera.projectionMatrix.elements as Float32Array
      function proj(wx: number, wy: number, wz: number): [number, number] {
        const vx = vm[0]*wx+vm[4]*wy+vm[8]*wz+vm[12]
        const vy = vm[1]*wx+vm[5]*wy+vm[9]*wz+vm[13]
        const vz = vm[2]*wx+vm[6]*wy+vm[10]*wz+vm[14]
        const vw = vm[3]*wx+vm[7]*wy+vm[11]*wz+vm[15]
        const px = pm[0]*vx+pm[4]*vy+pm[8]*vz+pm[12]*vw
        const py = pm[1]*vx+pm[5]*vy+pm[9]*vz+pm[13]*vw
        const pw = pm[3]*vx+pm[7]*vy+pm[11]*vz+pm[15]*vw
        if (Math.abs(pw) < 1e-8) return [-999, -999]
        return [(px/pw)*0.5*cw + 0.5*cw, (-py/pw)*0.5*ch + 0.5*ch]
      }
      const [mnX, mnY, mnZ, mxX, mxY, mxZ] = bboxArr
      const corners: [number, number, number][] = [
        [mnX,mnY,mnZ],[mnX,mnY,mxZ],[mnX,mxY,mnZ],[mnX,mxY,mxZ],
        [mxX,mnY,mnZ],[mxX,mnY,mxZ],[mxX,mxY,mnZ],[mxX,mxY,mxZ]]
      let sxMin = Infinity, syMin = Infinity, sxMax = -Infinity, syMax = -Infinity
      for (const c of corners) {
        const [sx, sy] = proj(c[0], c[1], c[2])
        sxMin = Math.min(sxMin, sx); syMin = Math.min(syMin, sy)
        sxMax = Math.max(sxMax, sx); syMax = Math.max(syMax, sy)
      }
      const bxMin = Math.max(0, Math.floor(sxMin))
      const byMin = Math.max(0, Math.floor(syMin))
      const bxMax = Math.min(cw - 1, Math.ceil(sxMax))
      const byMax = Math.min(ch - 1, Math.ceil(syMax))
      if (bxMax <= bxMin || byMax <= byMin) return { error: 'bbox too small' }

      // Copy WebGL canvas → 2D for pixel readback
      const tmp = document.createElement('canvas')
      tmp.width = cw; tmp.height = ch
      const ctx = tmp.getContext('2d')
      if (!ctx) return { error: 'no 2d ctx' }
      ctx.drawImage(canvas, 0, 0)
      const img = ctx.getImageData(0, 0, cw, ch)
      const d = img.data

      // For each cap color: track bounding box and pixel count
      // (walking every pixel once at step=1 is reasonably fast for readback)
      interface ColorInfo { count: number; minX: number; maxX: number; minY: number; maxY: number }
      const red: ColorInfo   = { count: 0, minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
      const green: ColorInfo = { count: 0, minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
      const blue: ColorInfo  = { count: 0, minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }

      for (let y = byMin; y <= byMax; y++) {
        const base = y * cw * 4
        for (let x = bxMin; x <= bxMax; x++) {
          const i = base + x * 4
          const r = d[i], g = d[i + 1], b_ = d[i + 2]

          // PBR cap materials have lighting variation; use dominant-channel detection
          const maxC = Math.max(r, g, b_)
          if (r === maxC && r > g * 1.3 && r > b_ * 1.3 && r > 100) {
            red.count++; if (x < red.minX) red.minX = x; if (x > red.maxX) red.maxX = x; if (y < red.minY) red.minY = y; if (y > red.maxY) red.maxY = y
          } else if (g === maxC && g > r * 1.3 && g > b_ * 1.3 && g > 100) {
            green.count++; if (x < green.minX) green.minX = x; if (x > green.maxX) green.maxX = x; if (y < green.minY) green.minY = y; if (y > green.maxY) green.maxY = y
          } else if (b_ === maxC && b_ > r * 1.3 && b_ > g * 1.3 && b_ > 100) {
            blue.count++; if (x < blue.minX) blue.minX = x; if (x > blue.maxX) blue.maxX = x; if (y < blue.minY) blue.minY = y; if (y > blue.maxY) blue.maxY = y
          }
        }
      }

      // Stencil debug info
      const glCtx = (gl as any).getContext?.() as WebGL2RenderingContext | null
      let gpuRenderer = ''
      if (glCtx) {
        gpuRenderer = glCtx.getParameter(glCtx.RENDERER) || ''
      }

      return {
        gpuRenderer, csMeshCount,
        red:   { count: red.count, w: red.maxX - red.minX + 1, h: red.maxY - red.minY + 1 },
        green: { count: green.count, w: green.maxX - green.minX + 1, h: green.maxY - green.minY + 1 },
        blue:  { count: blue.count, w: blue.maxX - blue.minX + 1, h: blue.maxY - blue.minY + 1 },
      }
    })

    expect(result.error).toBeUndefined()
    console.log('GPU:', result.gpuRenderer, 'csMeshCount:', result.csMeshCount)
    expect(result.csMeshCount, 'crossSection meshes must exist in scene').toBeGreaterThan(0)

    // With only the X plane cutting through the sphere center, the red cap
    // should be a full circle in the YZ plane. The fill ratio of a circle
    // inside its bounding rectangle is pi/4 ~ 78.5%.
    // A broken cap (rectangular) would show fill ~ 100%.
    // Allow 50-95% to account for projection skew and lighting variation.
    const { count, w, h } = result.red
    expect(w, 'red cap bbox width must be > 0').toBeGreaterThan(0)
    expect(h, 'red cap bbox height must be > 0').toBeGreaterThan(0)
    const ratio = (count / (w * h)) * 100
    console.log(`red (single X plane): ${count}px in ${w}x${h} bbox, fill=${ratio.toFixed(1)}%`)

    // Must be less than 95% (proves NOT a rectangle or full quad)
    expect(ratio, `fill=${ratio.toFixed(1)}% <= 95% -> NOT rectangular`).toBeLessThanOrEqual(95)
    // Must be at least 50% (proves solid circle, not scattered noise)
    expect(ratio, `fill=${ratio.toFixed(1)}% ≥ 50% → solid circle`).toBeGreaterThanOrEqual(50)

    await assertNoErrors()
  })
})
