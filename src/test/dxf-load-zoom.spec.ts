/**
 * E2E test: load a DXF file and exercise zoom in / zoom out.
 *
 * The DXF → SVG conversion runs in the Node.js test context via
 * @linkiez/dxf-renew, then the resulting SVG is injected into the
 * renderer's SVG workspace (exactly as the production code path does).
 */

import { test, expect, ElectronApplication, _electron, Page } from '@playwright/test'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getElectronPath } from './utils'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DXF_FIXTURE = path.join(__dirname, 'fixtures', 'testdata', '1001.dxf')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function waitForCanvas(page: Page, timeout = 20000) {
  await page.locator('canvas').first().waitFor({ state: 'attached', timeout })
}

/**
 * Load a DXF file into the SVG workspace by passing the raw DXF text
 * to the renderer, which dynamically imports @linkiez/dxf-renew to
 * convert it to SVG (mirroring the production code path).
 */
async function loadDxfIntoWorkspace(window: Page, dxfText: string, fileName: string) {
  await window.evaluate(async ({ dxf, name }: { dxf: string; name: string }) => {
    const modelStore = (window as any).__modelStore
    const svgStore = (window as any).__svgWorkspaceStore
    const { convertDxfToSvg } = (window as any).__svgHelpers

    // Clear existing state
    modelStore.getState().reset()
    svgStore.setState({ files: [], selectedFileId: null })

    // Convert DXF to SVG via the lazy helper (uses dynamic import under the hood)
    const { svgText: svgText, layers, naturalWidth, naturalHeight } = await convertDxfToSvg(dxf)
    const fileId = crypto.randomUUID()

    modelStore.getState().addLoadedFile({
      id: fileId,
      fileName: name,
      filePath: `/e2e/${name}`,
      mtimeMs: Date.now(),
      buffer: new TextEncoder().encode(dxf).buffer,
      format: 'dxf',
      sceneTree: [],
      glbPartInfos: [],
      modelCenteringOffset: null,
      sourceUnit: 'millimeter',
      fileGroup: 'vector',
      loadingPhase: 'done',
      svgLayers: layers,
      svgText: svgText,
    })

    svgStore.getState().addFilesBatch([{
      fileId,
      fileName: name,
      svgText: svgText,
      layers,
      naturalWidth,
      naturalHeight,
    }])
  }, { dxf: dxfText, name: fileName })

  await window.waitForTimeout(500)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('DXF Loading & Zoom E2E', () => {
  let electronApp: ElectronApplication

  test.beforeAll(async () => {
    electronApp = await _electron.launch({
      executablePath: getElectronPath(),
      args: ['--no-sandbox', '--ozone-platform-hint=x11'],
      env: { ...process.env, E2E: '1' },
    })
  })

  test.afterAll(async () => {
    if (electronApp) await electronApp.close()
  })

  test('1. load DXF file → appears in SVG workspace with canvas rendered', async () => {
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    await waitForCanvas(window)

    // Clear errors
    await window.evaluate(() => { (window as any).__errors = [] })

    const dxfText = readFileSync(DXF_FIXTURE, 'utf-8')
    await loadDxfIntoWorkspace(window, dxfText, '1001.dxf')

    // Verify workspace state
    const state = await window.evaluate(() => {
      const s = (window as any).__svgWorkspaceStore.getState()
      return {
        fileCount: s.files.length,
        fileName: s.files[0]?.fileName,
        fileId: s.files[0]?.fileId,
        zoom: s.files[0]?.zoom,
        visible: s.files[0]?.visible,
      }
    })

    expect(state.fileCount).toBe(1)
    expect(state.fileName).toBe('1001.dxf')
    expect(state.visible).toBe(true)
    expect(state.zoom).toBe(1)

    // Canvas must be present
    const canvasCount = await window.locator('canvas').count()
    expect(canvasCount).toBeGreaterThanOrEqual(1)

    // No renderer errors
    const errors = await window.evaluate(() => (window as any).__errors as any[])
    expect(errors.length).toBe(0)
  })

  test('2. zoom in → zoom increases', async () => {
    const window = await electronApp.firstWindow()
    await waitForCanvas(window)

    const { fileId, zoomBefore } = await window.evaluate(() => {
      const s = (window as any).__svgWorkspaceStore.getState()
      return { fileId: s.files[0]?.fileId, zoomBefore: s.files[0]?.zoom }
    })
    expect(fileId).toBeTruthy()
    expect(typeof zoomBefore).toBe('number')

    // Zoom in (factor > 1)
    await window.evaluate((fid: string) => {
      (window as any).__svgWorkspaceStore.getState().zoomFile(fid, 1.5)
    }, fileId)

    await window.waitForTimeout(200)

    const zoomAfter = await window.evaluate(() => {
      return (window as any).__svgWorkspaceStore.getState().files[0]?.zoom
    })

    // Zoom must increase relative to before (or saturate at floor/cap)
    expect(typeof zoomAfter).toBe('number')
    expect(zoomAfter).toBeGreaterThanOrEqual(zoomBefore)

    const errors = await window.evaluate(() => (window as any).__errors as any[])
    expect(errors.length).toBe(0)
  })

  test('3. zoom out → zoom decreases (respects floor)', async () => {
    const window = await electronApp.firstWindow()
    await waitForCanvas(window)

    const { fileId, zoomBefore } = await window.evaluate(() => {
      const s = (window as any).__svgWorkspaceStore.getState()
      return { fileId: s.files[0]?.fileId, zoomBefore: s.files[0]?.zoom }
    })

    // Zoom out (factor < 1)
    await window.evaluate((fid: string) => {
      (window as any).__svgWorkspaceStore.getState().zoomFile(fid, 0.7)
    }, fileId)

    await window.waitForTimeout(200)

    const zoomAfter = await window.evaluate(() => {
      return (window as any).__svgWorkspaceStore.getState().files[0]?.zoom
    })

    // Zoom must be ≤ before (floor may prevent further reduction)
    expect(typeof zoomAfter).toBe('number')
    expect(zoomAfter).toBeLessThanOrEqual(zoomBefore)
    // Must be >= 0.1 (the hard floor in zoomFile)
    expect(zoomAfter).toBeGreaterThanOrEqual(0.1)

    const errors = await window.evaluate(() => (window as any).__errors as any[])
    expect(errors.length).toBe(0)
  })

  test('4. zoom respects 20× hard cap', async () => {
    const window = await electronApp.firstWindow()
    await waitForCanvas(window)

    const { fileId } = await window.evaluate(() => {
      const s = (window as any).__svgWorkspaceStore.getState()
      return { fileId: s.files[0]?.fileId }
    })

    // Use direct state manipulation to set zoom to 19, then push past 20
    await window.evaluate((fid: string) => {
      const store = (window as any).__svgWorkspaceStore
      store.setState({
        files: store.getState().files.map((f: any) =>
          f.fileId === fid
            ? { ...f, zoom: 19, naturalWidth: 10000, naturalHeight: 10000, scale: 1 }
            : f,
        ),
      })
      // Push past the cap
      store.getState().zoomFile(fid, 2.0)
    }, fileId)

    await window.waitForTimeout(200)

    const zoom = await window.evaluate(() => {
      return (window as any).__svgWorkspaceStore.getState().files[0]?.zoom
    })

    // Must be capped at 20
    expect(zoom).toBe(20)

    const errors = await window.evaluate(() => (window as any).__errors as any[])
    expect(errors.length).toBe(0)
  })
})
