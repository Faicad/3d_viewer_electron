import { test, expect, _electron, ElectronApplication, Page } from '@playwright/test'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getElectronPath } from './utils'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_BUFFER = readFileSync(path.join(__dirname, 'fixtures', 'box_boss.glb'))

async function waitForLoadDone(page: Page, timeout = 30000) {
  await page.waitForFunction(
    () => (window as any).__modelStore?.getState().__loadingPhase === 'done',
    { timeout },
  )
}

function trackErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[console] ${msg.text()}`)
  })
  return {
    async assertNoErrors() {
      const winErrors: Array<{ message: string }> =
        await page.evaluate(() => (window as any).__errors?.slice() ?? [])
      for (const e of winErrors) errors.push(`[global] ${e.message}`)
      await page.evaluate(() => { (window as any).__errors = [] })
      if (errors.length > 0) throw new Error(`Unexpected errors:\n${errors.join('\n')}`)
    },
  }
}

test.describe.serial('Object Selection E2E', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async () => {
    app = await _electron.launch({
      executablePath: getElectronPath(),
      args: ['--no-sandbox', '--in-process-gpu', '--disable-gpu-sandbox'],
      env: { ...process.env, E2E: '1' },
    })
    page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.locator('canvas').first().waitFor({ state: 'attached', timeout: 20000 })

    await page.locator('input[type="file"]').setInputFiles({
      name: 'box_boss.glb',
      mimeType: 'model/gltf-binary',
      buffer: FIXTURE_BUFFER,
    })
    await waitForLoadDone(page)
    await page.waitForTimeout(500)

    await page.evaluate(() => {
      (window as any).__toolStore?.getState().setSelectionMode('object')
    })
    await page.waitForTimeout(200)
  })

  test.afterAll(async () => {
    if (app) await app.close()
  })

  async function getHighlights() {
    return page.evaluate(() => {
      const dev = (window as any).__r3f_dev as any
      if (!dev?.scene) return []
      const r: any[] = []
      dev.scene.traverse((obj: any) => {
        if (!obj.isMesh) return
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
        for (const m of mats) {
          if (m?.type === 'MeshBasicMaterial' && m.transparent && m.opacity > 0 && m.opacity < 1) {
            r.push({ color: '#' + m.color.getHex().toString(16).padStart(6, '0'), opacity: m.opacity })
          }
        }
      })
      return r
    })
  }

  async function hasCornerLines() {
    return page.evaluate(() => {
      const dev = (window as any).__r3f_dev as any
      if (!dev?.scene) return false
      let found = false
      dev.scene.traverse((obj: any) => {
        if (!obj.isLineSegments) return
        const m = obj.material
        if (m?.type === 'LineBasicMaterial' && m.color?.getHex() === 0xffffff && obj.renderOrder === 6) {
          found = true
        }
      })
      return found
    })
  }

  async function canvasClick(cx: number, cy: number) {
    const c = page.locator('canvas').first()
    const b = await c.boundingBox()
    expect(b).not.toBeNull()
    await c.click({ position: { x: b!.width * cx, y: b!.height * cy }, force: true })
    await page.waitForTimeout(400)
  }

  test('1. model loads without errors', async () => {
    const g = trackErrors(page)
    await g.assertNoErrors()
  })

  test('2. click model → white low-opacity selection highlight', async () => {
    const g = trackErrors(page)
    await canvasClick(0.5, 0.5)

    const hl = await getHighlights()
    expect(hl.length).toBeGreaterThan(0)

    const sel = hl.find((h: any) => h.color === '#ffffff' && h.opacity < 0.2)
    expect(sel, 'white low-opacity selection: ' + JSON.stringify(hl)).toBeDefined()
    await g.assertNoErrors()
  })

  test('3. selected object → bounding box corner lines appear', async () => {
    const g = trackErrors(page)
    await canvasClick(0.5, 0.5)
    expect(await hasCornerLines()).toBe(true)
    await g.assertNoErrors()
  })

  test('4. re-click selected object does not crash', async () => {
    const g = trackErrors(page)
    await canvasClick(0.5, 0.5)
    expect(await hasCornerLines()).toBe(true)
    await canvasClick(0.5, 0.5)
    expect(await hasCornerLines()).toBe(true)
    await g.assertNoErrors()
  })

  test('5. drag on selected object does not crash', async () => {
    const g = trackErrors(page)
    await canvasClick(0.5, 0.5)

    const c = page.locator('canvas').first()
    const b = await c.boundingBox()
    expect(b).not.toBeNull()
    const cx = b!.x + b!.width / 2
    const cy = b!.y + b!.height / 2

    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx + 60, cy, { steps: 5 })
    await page.mouse.up()
    await page.waitForTimeout(300)

    await g.assertNoErrors()
  })
})
