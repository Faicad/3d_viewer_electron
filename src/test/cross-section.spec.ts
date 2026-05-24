import { test, expect, ElectronApplication, _electron, Page } from '@playwright/test'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getElectronPath } from './utils'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEST_GLB = readFileSync(path.join(__dirname, 'fixtures', 'box_boss.glb'))

function trackErrors(page: Page) {
  const pageErrors: string[] = []
  page.on('pageerror', (err) => pageErrors.push(String(err)))
  return {
    async assertNoErrors() {
      const appErrors = await page.evaluate(() =>
        window.__errors.map((e: Error) => `${e.message}\n${e.stack}`),
      )
      const all = [...pageErrors, ...appErrors]
      expect(all, `Unexpected errors:\n${all.join('\n')}`).toEqual([])
    },
  }
}

async function waitForLoadDone(page: Page, timeout = 60000) {
  await page.waitForFunction(
    () => window.__modelStore?.getState().__loadingPhase === 'done',
    { timeout },
  )
}

async function ensurePanel(page: Page, open: boolean) {
  const csButton = page.getByLabel('剖面显示')
  const panel = page.locator('text=剖面显示').first()
  const visible = await panel.isVisible().catch(() => false)
  if (open && !visible) {
    await csButton.click()
    await panel.waitFor({ state: 'visible', timeout: 5000 })
  } else if (!open && visible) {
    await csButton.click()
    await panel.waitFor({ state: 'hidden', timeout: 5000 })
  }
}

test.describe('Cross Section Feature', () => {
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
      name: 'box_boss.glb',
      mimeType: 'model/gltf-binary',
      buffer: TEST_GLB,
    })
    await waitForLoadDone(page)
  })

  test.afterAll(async () => {
    await electronApp.close()
  })

  // ─── Panel UI tests ───────────────────────────────────────────

  test('button exists and opens panel', async () => {
    const { assertNoErrors } = trackErrors(page)

    await ensurePanel(page, false)
    const csButton = page.getByLabel('剖面显示')
    await expect(csButton).toBeVisible()

    await csButton.click()
    await page.locator('text=剖面显示').first().waitFor({ state: 'visible', timeout: 5000 })

    await assertNoErrors()
  })

  test('panel has sliders and checkboxes', async () => {
    const { assertNoErrors } = trackErrors(page)

    await ensurePanel(page, true)

    const sliders = page.locator('input[type="range"]')
    await expect(sliders).toHaveCount(3)

    const checkboxes = page.locator('input[type="checkbox"]')
    await expect(checkboxes).toHaveCount(2)

    await assertNoErrors()
  })

  test('toggling does not cause errors', async () => {
    const { assertNoErrors } = trackErrors(page)

    await ensurePanel(page, false)

    const csButton = page.getByLabel('剖面显示')
    for (let i = 0; i < 3; i++) {
      await csButton.click()
      await new Promise((r) => setTimeout(r, 300))
    }

    await assertNoErrors()
  })

  test('close button and toolbar button are equivalent', async () => {
    await ensurePanel(page, false)

    const csButton = page.getByLabel('剖面显示')
    const panel = page.locator('text=剖面显示').first()

    await csButton.click()
    await panel.waitFor({ state: 'visible', timeout: 5000 })

    await csButton.click()
    await panel.waitFor({ state: 'hidden', timeout: 5000 })

    await csButton.click()
    await panel.waitFor({ state: 'visible', timeout: 5000 })

    const closeButton = page.locator('button[aria-label="close"]')
    await closeButton.click()
    await panel.waitFor({ state: 'hidden', timeout: 5000 })
  })

  // ─── Renderer state tests: clipping planes ────────────────────

  test('gl.clippingPlanes are set when panel opens', async () => {
    const { assertNoErrors } = trackErrors(page)

    await ensurePanel(page, false)
    // Wait for any pending effects to settle
    await new Promise((r) => setTimeout(r, 300))

    // Verify no clipping before opening
    const before = await page.evaluate(() => {
      const gl = window.__r3f_dev?.gl
      if (!gl) return null
      return {
        planesLen: gl.clippingPlanes?.length ?? -1,
        localClip: gl.localClippingEnabled,
      }
    })
    expect(before?.planesLen).toBe(0)
    expect(before?.localClip).toBe(false)

    // Open panel
    await ensurePanel(page, true)
    await new Promise((r) => setTimeout(r, 300))

    const after = await page.evaluate(() => {
      const gl = window.__r3f_dev?.gl
      if (!gl) return null
      return {
        planesLen: gl.clippingPlanes?.length ?? -1,
        localClip: gl.localClippingEnabled,
        numClipPlanes: gl.clippingPlanes?.length ?? 0,
      }
    })
    expect(after?.planesLen).toBe(3)
    expect(after?.localClip).toBe(true)

    await assertNoErrors()
  })

  test('gl.clippingPlanes are cleared when panel closes', async () => {
    const { assertNoErrors } = trackErrors(page)

    await ensurePanel(page, true)
    await new Promise((r) => setTimeout(r, 300))

    await ensurePanel(page, false)
    await new Promise((r) => setTimeout(r, 300))

    const after = await page.evaluate(() => {
      const gl = window.__r3f_dev?.gl
      if (!gl) return null
      return {
        planesLen: gl.clippingPlanes?.length ?? -1,
        localClip: gl.localClippingEnabled,
      }
    })
    expect(after?.planesLen).toBe(0)
    expect(after?.localClip).toBe(false)

    await assertNoErrors()
  })

  test('moving a slider updates clipping plane constant', async () => {
    const { assertNoErrors } = trackErrors(page)

    await ensurePanel(page, true)
    await new Promise((r) => setTimeout(r, 300))

    // Read plane constant before moving slider
    const before = await page.evaluate(() => {
      const gl = window.__r3f_dev?.gl
      const planes = gl?.clippingPlanes ?? []
      return planes.map((p: { constant: number }) => p.constant)
    })
    expect(before.length).toBe(3)

    // Move X slider (first range input) to 50
    const sliders = page.locator('input[type="range"]')
    const xSlider = sliders.nth(0)
    await xSlider.fill('50')
    await new Promise((r) => setTimeout(r, 500))

    const after = await page.evaluate(() => {
      const gl = window.__r3f_dev?.gl
      const planes = gl?.clippingPlanes ?? []
      return planes.map((p: { constant: number }) => p.constant)
    })
    expect(after.length).toBe(3)

    // At least one plane constant should have changed (the X plane)
    const anyChanged = before.some((v: number, i: number) => v !== after[i])
    expect(anyChanged).toBe(true)

    await assertNoErrors()
  })

  // ─── Scene state tests ────────────────────────────────────────

  test('showClipPlane controls only the helper plane, not stencil+cap', async () => {
    const { assertNoErrors } = trackErrors(page)

    // Close and reopen to get a fresh state
    await ensurePanel(page, false)
    await new Promise((r) => setTimeout(r, 300))
    await ensurePanel(page, true)
    await new Promise((r) => setTimeout(r, 300))

    // Move X slider to 50% so the plane intersects model interior
    const sliders = page.locator('input[type="range"]')
    await sliders.nth(0).fill('50')
    await new Promise((r) => setTimeout(r, 500))

    // Ensure showClipPlane is checked
    const checkboxes = page.locator('input[type="checkbox"]')
    const showClipPlaneCheckbox = checkboxes.nth(0)
    if (!(await showClipPlaneCheckbox.isChecked())) await showClipPlaneCheckbox.check()
    await new Promise((r) => setTimeout(r, 300))

    // Count _crossSectionInternal meshes with showClipPlane=true (stencil+cap+helper)
    const countOn = await page.evaluate(() => {
      const r3f = window.__r3f_dev
      if (!r3f?.scene) return -1
      let c = 0
      r3f.scene.traverse((obj: any) => { if (obj.userData?._crossSectionInternal) c++ })
      return c
    })
    expect(countOn).toBeGreaterThan(0)

    // Uncheck showClipPlane — this should hide only the helper plane.
    // Stencil+cap must remain visible (the actual cross-section on the model).
    await showClipPlaneCheckbox.uncheck()
    await new Promise((r) => setTimeout(r, 500))

    const countOff = await page.evaluate(() => {
      const r3f = window.__r3f_dev
      if (!r3f?.scene) return -1
      let c = 0
      r3f.scene.traverse((obj: any) => { if (obj.userData?._crossSectionInternal) c++ })
      return c
    })
    // Stencil+cap should still be present, just the helper plane is gone
    expect(countOff).toBeGreaterThan(0)
    expect(countOff).toBeLessThan(countOn)

    await assertNoErrors()
  })

  test('no WebGL errors when clipping is active with slider movement', async () => {
    const { assertNoErrors } = trackErrors(page)

    await ensurePanel(page, true)
    await new Promise((r) => setTimeout(r, 300))

    // Move all sliders sequentially
    const sliders = page.locator('input[type="range"]')
    for (let i = 0; i < 3; i++) {
      await sliders.nth(i).fill('30')
      await new Promise((r) => setTimeout(r, 400))
      await sliders.nth(i).fill('70')
      await new Promise((r) => setTimeout(r, 400))
    }

    // Reset
    await sliders.nth(0).fill('100')
    await sliders.nth(1).fill('0')
    await sliders.nth(2).fill('100')
    await new Promise((r) => setTimeout(r, 400))

    await assertNoErrors()
  })

  // ─── Visual sanity checks ─────────────────────────────────────

  test('model bbox unchanged when toggling panel', async () => {
    const { assertNoErrors } = trackErrors(page)

    await ensurePanel(page, false)
    await new Promise((r) => setTimeout(r, 300))

    const bboxBefore = await page.evaluate(() => {
      return window.__engineStore?.getState().modelBbox
    })
    expect(bboxBefore).toBeTruthy()

    await ensurePanel(page, true)
    await new Promise((r) => setTimeout(r, 500))

    const bboxAfter = await page.evaluate(() => {
      return window.__engineStore?.getState().modelBbox
    })
    expect(bboxAfter).toEqual(bboxBefore)

    await ensurePanel(page, false)
    await new Promise((r) => setTimeout(r, 300))

    const bboxFinal = await page.evaluate(() => {
      return window.__engineStore?.getState().modelBbox
    })
    expect(bboxFinal).toEqual(bboxBefore)

    await assertNoErrors()
  })

  test('canvas size is preserved after toggling panel', async () => {
    await ensurePanel(page, false)
    await new Promise((r) => setTimeout(r, 300))

    const sizeBefore = await page.evaluate(() => {
      const gl = window.__r3f_dev?.gl
      if (!gl) return null
      return { width: gl.domElement.width, height: gl.domElement.height }
    })
    expect(sizeBefore?.width).toBeGreaterThan(0)

    await ensurePanel(page, true)
    await new Promise((r) => setTimeout(r, 500))

    const sizeAfter = await page.evaluate(() => {
      const gl = window.__r3f_dev?.gl
      if (!gl) return null
      return { width: gl.domElement.width, height: gl.domElement.height }
    })
    expect(sizeAfter).toEqual(sizeBefore)
  })

  test('checking useObjectColor does not cause errors', async () => {
    const { assertNoErrors } = trackErrors(page)

    await ensurePanel(page, true)
    await new Promise((r) => setTimeout(r, 300))

    // Ensure showClipPlane is checked so we have stencil/cap rendering
    const checkboxes = page.locator('input[type="checkbox"]')
    const showClipPlaneCb = checkboxes.nth(0)
    const useObjectColorCb = checkboxes.nth(1)

    // Set up known state
    const isShowClipChecked = await showClipPlaneCb.isChecked()
    if (!isShowClipChecked) await showClipPlaneCb.check()

    // Toggle useObjectColor
    await useObjectColorCb.check()
    await new Promise((r) => setTimeout(r, 300))
    await useObjectColorCb.uncheck()
    await new Promise((r) => setTimeout(r, 300))

    await assertNoErrors()
  })

  // ─── Visual pixel verification ─────────────────────────────────

  test('cross-section caps render visible red/green/blue areas within model bbox', async () => {
    const { assertNoErrors } = trackErrors(page)

    // Fresh state: close and reopen
    await ensurePanel(page, false)
    await new Promise((r) => setTimeout(r, 300))
    await ensurePanel(page, true)
    await new Promise((r) => setTimeout(r, 300))

    // Ensure showClipPlane is checked (caps + stencil enabled)
    const checkboxes = page.locator('input[type="checkbox"]')
    const showClipPlaneCb = checkboxes.nth(0)
    if (!(await showClipPlaneCb.isChecked())) await showClipPlaneCb.check()
    await new Promise((r) => setTimeout(r, 200))

    // Move all three sliders to 50% so each plane cuts through model interior
    const sliders = page.locator('input[type="range"]')
    await sliders.nth(0).fill('50')
    await sliders.nth(1).fill('50')
    await sliders.nth(2).fill('50')
    // Allow several frames for stencil+cap rendering to stabilize
    await new Promise((r) => setTimeout(r, 800))

    // Read pixel colors ONLY within the model's projected screen-space bbox.
    // Uses plain JS (no THREE global) to project the 3D bbox to screen coords.
    const result = await page.evaluate(() => {
      const r3f = window.__r3f_dev as any
      if (!r3f?.gl || !r3f?.camera) return { error: 'no r3f ref' }

      const gl = r3f.gl
      const camera = r3f.camera
      const canvas = gl.domElement as HTMLCanvasElement
      const cw = canvas.width
      const ch = canvas.height

      // Get model bbox from engine store (flat array: [minX,minY,minZ, maxX,maxY,maxZ])
      const bboxArr = (window as any).__engineStore?.getState().modelBbox as number[] | null
      if (!bboxArr || bboxArr.length !== 6) return { error: 'no model bbox' }

      // Helper: project a world-space point to screen coords
      const vm = camera.matrixWorldInverse.elements as Float32Array
      const pm = camera.projectionMatrix.elements as Float32Array

      function project(wx: number, wy: number, wz: number): [number, number] {
        // View transform
        const vx = vm[0]*wx + vm[4]*wy + vm[8]*wz + vm[12]
        const vy = vm[1]*wx + vm[5]*wy + vm[9]*wz + vm[13]
        const vz = vm[2]*wx + vm[6]*wy + vm[10]*wz + vm[14]
        const vw = vm[3]*wx + vm[7]*wy + vm[11]*wz + vm[15]
        // Projection
        const px = pm[0]*vx + pm[4]*vy + pm[8]*vz + pm[12]*vw
        const py = pm[1]*vx + pm[5]*vy + pm[9]*vz + pm[13]*vw
        const pw = pm[3]*vx + pm[7]*vy + pm[11]*vz + pm[15]*vw
        if (Math.abs(pw) < 1e-8) return [-999, -999]
        return [
          (px / pw) * 0.5 * cw + 0.5 * cw,
          (-py / pw) * 0.5 * ch + 0.5 * ch,
        ]
      }

      // Project all 8 bbox corners
      const [mnX, mnY, mnZ, mxX, mxY, mxZ] = bboxArr
      const corners: [number, number, number][] = [
        [mnX, mnY, mnZ], [mnX, mnY, mxZ], [mnX, mxY, mnZ], [mnX, mxY, mxZ],
        [mxX, mnY, mnZ], [mxX, mnY, mxZ], [mxX, mxY, mnZ], [mxX, mxY, mxZ],
      ]
      let sxMin = Infinity, syMin = Infinity, sxMax = -Infinity, syMax = -Infinity
      for (const c of corners) {
        const [sx, sy] = project(c[0], c[1], c[2])
        sxMin = Math.min(sxMin, sx); syMin = Math.min(syMin, sy)
        sxMax = Math.max(sxMax, sx); syMax = Math.max(syMax, sy)
      }

      const bxMin = Math.max(0, Math.floor(sxMin))
      const byMin = Math.max(0, Math.floor(syMin))
      const bxMax = Math.min(cw - 1, Math.ceil(sxMax))
      const byMax = Math.min(ch - 1, Math.ceil(syMax))
      if (bxMax <= bxMin || byMax <= byMin) return { error: `bbox too small` }

      // Copy WebGL canvas → 2D for readback
      const tmp = document.createElement('canvas')
      tmp.width = cw; tmp.height = ch
      const ctx = tmp.getContext('2d')
      if (!ctx) return { error: 'no 2d ctx' }
      ctx.drawImage(canvas, 0, 0)
      const img = ctx.getImageData(0, 0, cw, ch)
      const d = img.data

      let red = 0, green = 0, blue = 0, other = 0
      const step = 2
      for (let y = byMin; y <= byMax; y += step) {
        const base = y * cw * 4
        for (let x = bxMin; x <= bxMax; x += step) {
          const i = base + x * 4
          const r = d[i], g = d[i + 1], b = d[i + 2]

          if (r > 120 && r > g * 1.3 && r > b * 1.3 && g < 200 && b < 200) { red++ }
          else if (g > 120 && g > r * 1.3 && g > b * 1.3 && r < 200 && b < 200) { green++ }
          else if (b > 120 && b > r * 1.3 && b > g * 1.2 && r < 200) { blue++ }
          else { other++ }
        }
      }

      const total = red + green + blue + other
      return {
        red, green, blue, other, total,
        bboxRect: { x: bxMin, y: byMin, w: bxMax - bxMin, h: byMax - byMin },
      }
    })

    expect(result.error).toBeUndefined()
    const { red, green, blue, other, total, bboxRect } = result
    expect(total, 'should have pixels in bbox area').toBeGreaterThan(500)

    // Log for debugging
    console.log(`bbox rect: ${bboxRect.x},${bboxRect.y} ${bboxRect.w}x${bboxRect.h}`)
    console.log(`bbox pixels: red=${red} green=${green} blue=${blue} other=${other} total=${total}`)

    // Each cap color MUST occupy a visually "large area" — at least 2% of the
    // model's projected screen-space bbox. If the cap rendering is broken
    // (Z-fighting producing scattered noise instead of solid caps), each color
    // will be well below this threshold.
    const pctR = (red / total) * 100
    const pctG = (green / total) * 100
    const pctB = (blue / total) * 100

    expect(red, `red cap should be >= 2% of bbox, got ${pctR.toFixed(1)}%`).toBeGreaterThanOrEqual(total * 0.02)
    expect(green, `green cap should be >= 2% of bbox, got ${pctG.toFixed(1)}%`).toBeGreaterThanOrEqual(total * 0.02)
    expect(blue, `blue cap should be >= 2% of bbox, got ${pctB.toFixed(1)}%`).toBeGreaterThanOrEqual(total * 0.02)

    // Collectively, caps should cover at least 10% of the bbox area
    const capPercent = pctR + pctG + pctB
    expect(capPercent, `caps cover ${capPercent.toFixed(1)}% of bbox, expected >= 10%`).toBeGreaterThanOrEqual(10)

    await assertNoErrors()
  })

  test('caps visible when showClipPlane is off (剖面 ≠ clip plane)', async () => {
    const { assertNoErrors } = trackErrors(page)

    // Fresh state
    await ensurePanel(page, false)
    await new Promise((r) => setTimeout(r, 300))
    await ensurePanel(page, true)
    await new Promise((r) => setTimeout(r, 300))

    // Turn OFF showClipPlane — only hide the semi-transparent helper
    const checkboxes = page.locator('input[type="checkbox"]')
    const showClipPlaneCb = checkboxes.nth(0)
    if (await showClipPlaneCb.isChecked()) await showClipPlaneCb.uncheck()
    await new Promise((r) => setTimeout(r, 200))

    // Move all three sliders to 50%
    const sliders = page.locator('input[type="range"]')
    await sliders.nth(0).fill('50')
    await sliders.nth(1).fill('50')
    await sliders.nth(2).fill('50')
    await new Promise((r) => setTimeout(r, 800))

    const result = await page.evaluate(() => {
      const r3f = window.__r3f_dev as any
      if (!r3f?.gl || !r3f?.camera) return { error: 'no r3f ref' }
      const gl = r3f.gl; const camera = r3f.camera
      const canvas = gl.domElement as HTMLCanvasElement
      const cw = canvas.width, ch = canvas.height

      const bboxArr = (window as any).__engineStore?.getState().modelBbox as number[] | null
      if (!bboxArr || bboxArr.length !== 6) return { error: 'no model bbox' }

      const vm = camera.matrixWorldInverse.elements as Float32Array
      const pm = camera.projectionMatrix.elements as Float32Array
      function proj(wx: number, wy: number, wz: number): [number, number] {
        const vx = vm[0]*wx+vm[4]*wy+vm[8]*wz+vm[12], vy = vm[1]*wx+vm[5]*wy+vm[9]*wz+vm[13]
        const vz = vm[2]*wx+vm[6]*wy+vm[10]*wz+vm[14], vw = vm[3]*wx+vm[7]*wy+vm[11]*wz+vm[15]
        const px = pm[0]*vx+pm[4]*vy+pm[8]*vz+pm[12]*vw, py = pm[1]*vx+pm[5]*vy+pm[9]*vz+pm[13]*vw
        const pw = pm[3]*vx+pm[7]*vy+pm[11]*vz+pm[15]*vw
        if (Math.abs(pw) < 1e-8) return [-999, -999]
        return [(px/pw)*0.5*cw + 0.5*cw, (-py/pw)*0.5*ch + 0.5*ch]
      }
      const [mnX, mnY, mnZ, mxX, mxY, mxZ] = bboxArr
      const corners: [number,number,number][] = [
        [mnX,mnY,mnZ],[mnX,mnY,mxZ],[mnX,mxY,mnZ],[mnX,mxY,mxZ],
        [mxX,mnY,mnZ],[mxX,mnY,mxZ],[mxX,mxY,mnZ],[mxX,mxY,mxZ],
      ]
      let sxMin=Infinity,syMin=Infinity,sxMax=-Infinity,syMax=-Infinity
      for (const c of corners) { const [sx,sy]=proj(c[0],c[1],c[2]); sxMin=Math.min(sxMin,sx);syMin=Math.min(syMin,sy);sxMax=Math.max(sxMax,sx);syMax=Math.max(syMax,sy) }
      const bxMin=Math.max(0,Math.floor(sxMin)),byMin=Math.max(0,Math.floor(syMin)),bxMax=Math.min(cw-1,Math.ceil(sxMax)),byMax=Math.min(ch-1,Math.ceil(syMax))
      if (bxMax<=bxMin||byMax<=byMin) return { error:'bbox too small' }

      const tmp=document.createElement('canvas');tmp.width=cw;tmp.height=ch
      const ctx=tmp.getContext('2d');if(!ctx)return{error:'no 2d ctx'}
      ctx.drawImage(canvas,0,0);const img=ctx.getImageData(0,0,cw,ch),d=img.data
      let red=0,green=0,blue=0,other=0
      const step=2
      for (let y=byMin;y<=byMax;y+=step){const base=y*cw*4
        for (let x=bxMin;x<=bxMax;x+=step){const i=base+x*4
          const r=d[i],g=d[i+1],b_=d[i+2]
          if(r>120&&r>g*1.3&&r>b_*1.3&&g<200&&b_<200)red++
          else if(g>120&&g>r*1.3&&g>b_*1.3&&r<200&&b_<200)green++
          else if(b_>120&&b_>r*1.3&&b_>g*1.2&&r<200)blue++
          else other++
        }
      }
      return {red,green,blue,other,total:red+green+blue+other}
    })

    expect(result.error).toBeUndefined()
    const { red, green, blue, total } = result
    expect(total).toBeGreaterThan(500)

    // Caps MUST be visible when showClipPlane is off.
    // Only the semi-transparent helper plane should be hidden.
    expect(red, 'red cap visible with showClipPlane=false').toBeGreaterThanOrEqual(total * 0.02)
    expect(green, 'green cap visible with showClipPlane=false').toBeGreaterThanOrEqual(total * 0.02)
    expect(blue, 'blue cap visible with showClipPlane=false').toBeGreaterThanOrEqual(total * 0.02)
    const capPct = ((red + green + blue) / total) * 100
    expect(capPct, `caps=${capPct.toFixed(1)}% with showClipPlane=false`).toBeGreaterThanOrEqual(10)

    await assertNoErrors()
  })

  // ─── Shape verification: cross-section of a sphere must be CIRCULAR ───

  test('sphere cross-section caps are circular, not rectangular', async () => {
    const { assertNoErrors } = trackErrors(page)

    // Load sphere model
    const SPHERE_GLB = readFileSync(path.join(__dirname, 'fixtures', 'sphere.glb'))
    await page.locator('input[type="file"]').setInputFiles({
      name: 'sphere.glb',
      mimeType: 'model/gltf-binary',
      buffer: SPHERE_GLB,
    })
    await waitForLoadDone(page)
    await new Promise((r) => setTimeout(r, 500))

    // Open panel, ensure showClipPlane is on
    await ensurePanel(page, false)
    await new Promise((r) => setTimeout(r, 300))
    await ensurePanel(page, true)
    await new Promise((r) => setTimeout(r, 300))

    const checkboxes = page.locator('input[type="checkbox"]')
    const showCb = checkboxes.nth(0)
    if (!(await showCb.isChecked())) await showCb.check()
    await new Promise((r) => setTimeout(r, 200))

    // Move all sliders to 50% so each plane cuts through sphere center
    const sliders = page.locator('input[type="range"]')
    await sliders.nth(0).fill('50')
    await sliders.nth(1).fill('50')
    await sliders.nth(2).fill('50')
    await new Promise((r) => setTimeout(r, 800))

    // Read pixels and analyze cap shapes within the model bbox
    const result = await page.evaluate(() => {
      const r3f = window.__r3f_dev as any
      if (!r3f?.gl || !r3f?.camera) return { error: 'no r3f' }
      const gl = r3f.gl; const camera = r3f.camera
      const canvas = gl.domElement as HTMLCanvasElement
      const cw = canvas.width, ch = canvas.height

      const bboxArr = (window as any).__engineStore?.getState().modelBbox as number[] | null
      if (!bboxArr || bboxArr.length !== 6) return { error: 'no bbox' }

      // Project 3D bbox to screen
      const vm = camera.matrixWorldInverse.elements as Float32Array
      const pm = camera.projectionMatrix.elements as Float32Array
      function proj(wx:number,wy:number,wz:number):[number,number]{
        const vx=vm[0]*wx+vm[4]*wy+vm[8]*wz+vm[12],vy=vm[1]*wx+vm[5]*wy+vm[9]*wz+vm[13]
        const vz=vm[2]*wx+vm[6]*wy+vm[10]*wz+vm[14],vw=vm[3]*wx+vm[7]*wy+vm[11]*wz+vm[15]
        const px=pm[0]*vx+pm[4]*vy+pm[8]*vz+pm[12]*vw,py=pm[1]*vx+pm[5]*vy+pm[9]*vz+pm[13]*vw
        const pw=pm[3]*vx+pm[7]*vy+pm[11]*vz+pm[15]*vw
        if(Math.abs(pw)<1e-8)return[-999,-999]
        return[(px/pw)*0.5*cw+0.5*cw,(-py/pw)*0.5*ch+0.5*ch]
      }
      const[mnX,mnY,mnZ,mxX,mxY,mxZ]=bboxArr
      const corners:[number,number,number][]=[
        [mnX,mnY,mnZ],[mnX,mnY,mxZ],[mnX,mxY,mnZ],[mnX,mxY,mxZ],
        [mxX,mnY,mnZ],[mxX,mnY,mxZ],[mxX,mxY,mnZ],[mxX,mxY,mxZ]]
      let sxMin=Infinity,syMin=Infinity,sxMax=-Infinity,syMax=-Infinity
      for(const c of corners){const[sx,sy]=proj(c[0],c[1],c[2]);sxMin=Math.min(sxMin,sx);syMin=Math.min(syMin,sy);sxMax=Math.max(sxMax,sx);syMax=Math.max(syMax,sy)}
      const bxMin=Math.max(0,Math.floor(sxMin)),byMin=Math.max(0,Math.floor(syMin))
      const bxMax=Math.min(cw-1,Math.ceil(sxMax)),byMax=Math.min(ch-1,Math.ceil(syMax))
      if(bxMax<=bxMin||byMax<=byMin)return{error:'bbox too small'}

      // Read canvas pixels
      const tmp=document.createElement('canvas');tmp.width=cw;tmp.height=ch
      const ctx=tmp.getContext('2d');if(!ctx)return{error:'no 2d ctx'}
      ctx.drawImage(canvas,0,0);const img=ctx.getImageData(0,0,cw,ch),d=img.data
      const step=1

      // For each cap color, track bounding box and pixel count
      let rMinX=Infinity,rMaxX=-Infinity,rMinY=Infinity,rMaxY=-Infinity,rCount=0
      let gMinX=Infinity,gMaxX=-Infinity,gMinY=Infinity,gMaxY=-Infinity,gCount=0
      let bMinX=Infinity,bMaxX=-Infinity,bMinY=Infinity,bMaxY=-Infinity,bCount=0

      for(let y=byMin;y<=byMax;y+=step){const base=y*cw*4
        for(let x=bxMin;x<=bxMax;x+=step){const i=base+x*4
          const r=d[i],g=d[i+1],b_=d[i+2]
          if(r>120&&r>g*1.3&&r>b_*1.3&&g<200&&b_<200){
            rCount++; if(x<rMinX)rMinX=x;if(x>rMaxX)rMaxX=x;if(y<rMinY)rMinY=y;if(y>rMaxY)rMaxY=y
          }else if(g>120&&g>r*1.3&&g>b_*1.3&&r<200&&b_<200){
            gCount++; if(x<gMinX)gMinX=x;if(x>gMaxX)gMaxX=x;if(y<gMinY)gMinY=y;if(y>gMaxY)gMaxY=y
          }else if(b_>120&&b_>r*1.3&&b_>g*1.2&&r<200){
            bCount++; if(x<bMinX)bMinX=x;if(x>bMaxX)bMaxX=x;if(y<bMinY)bMinY=y;if(y>bMaxY)bMaxY=y
          }
        }
      }

      return {
        red:   { count: rCount, w: rMaxX-rMinX+1, h: rMaxY-rMinY+1 },
        green: { count: gCount, w: gMaxX-gMinX+1, h: gMaxY-gMinY+1 },
        blue:  { count: bCount, w: bMaxX-bMinX+1, h: bMaxY-bMinY+1 },
      }
    })

    expect(result.error).toBeUndefined()

    // Each cross-section of a sphere is a circle.
    // Fill ratio = colored pixels / bounding-box area ≈ π/4 ≈ 78.5%
    // A rectangular (broken) cap would have fill ratio near 100%.
    // Allow 55%–95% tolerance for rendering noise and projection skew.
    for (const color of ['red', 'green', 'blue'] as const) {
      const { count, w, h } = result[color]
      const bboxArea = w * h
      expect(bboxArea, `${color} cap must have nonzero bbox area`).toBeGreaterThan(0)
      const ratio = (count / bboxArea) * 100
      console.log(`${color}: ${count}px in ${w}x${h} bbox, fill=${ratio.toFixed(1)}%`)
      expect(ratio, `${color} cap fill=${ratio.toFixed(1)}%, must be >=55% (circular), not ~100% (rectangular)`)
        .toBeGreaterThanOrEqual(55)
      expect(ratio, `${color} cap fill=${ratio.toFixed(1)}%, must be <=95% (circular), not ~100% (rectangular)`)
        .toBeLessThanOrEqual(95)
    }

    await assertNoErrors()
  })
})
