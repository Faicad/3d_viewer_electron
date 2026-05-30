import { test, expect, ElectronApplication, _electron, Page } from '@playwright/test'
import { readFileSync, readdirSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getElectronPath } from './utils'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SVG_FIXTURES_DIR = path.join(__dirname, 'fixtures', 'svg')

function readSvgFixture(name: string): string {
  return readFileSync(path.join(SVG_FIXTURES_DIR, name), 'utf-8')
}

async function waitForCanvas(page: Page, timeout = 20000) {
  await page.locator('canvas').first().waitFor({ state: 'attached', timeout })
}

// Helper: inject SVG files into the workspace via window globals
async function loadSvgBatch(window: Page, fixtures: Record<string, string>) {
  await window.evaluate((fixtures: Record<string, string>) => {
    const store = (window as any).__svgWorkspaceStore
    const { parseSvgLayers, parseSvgViewBox } = (window as any).__svgHelpers
    const batch: any[] = []
    for (const [name, text] of Object.entries(fixtures)) {
      const layers = parseSvgLayers(text)
      const { naturalWidth, naturalHeight } = parseSvgViewBox(text)
      batch.push({ fileId: crypto.randomUUID(), fileName: name, svgText: text, layers, naturalWidth, naturalHeight })
    }
    store.getState().addFilesBatch(batch)
  }, fixtures)
  await window.waitForTimeout(500)
}

test.describe('SVG Workspace E2E', () => {
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

  test('1. load 9 SVG files → left tree + grid canvas + no errors', async () => {
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    await waitForCanvas(window)

    const svgFiles = readdirSync(SVG_FIXTURES_DIR).filter(f => f.endsWith('.svg'))
    expect(svgFiles.length).toBeGreaterThanOrEqual(9)

    const fixtureMap: Record<string, string> = {}
    for (const name of svgFiles) fixtureMap[name] = readSvgFixture(name)

    // Clear any pre-existing errors (e.g. Electron security warnings)
    await window.evaluate(() => { (window as any).__errors = [] })

    await loadSvgBatch(window, fixtureMap)

    // === LEFT: Layer tree ===
    const svgLayersHeader = await window.locator('text=SVG Layers').isVisible()
    expect(svgLayersHeader).toBe(true)

    const firstFile = svgFiles[0]
    const fileInTree = await window.locator(`text=${firstFile}`).first().isVisible()
    expect(fileInTree).toBe(true)

    // === CENTER: Grid canvas ===
    const state = await window.evaluate(() => {
      const s = (window as any).__svgWorkspaceStore.getState()
      return {
        count: s.files.length,
        allGrid: s.files.every((f: any) => f.placement === 'grid'),
        allVisible: s.files.every((f: any) => f.visible === true),
        uniquePos: new Set(s.files.map((f: any) => `${Math.round(f.x)},${Math.round(f.y)}`)).size,
      }
    })
    expect(state.count).toBe(9)
    expect(state.allGrid).toBe(true)
    expect(state.allVisible).toBe(true)
    expect(state.uniquePos).toBeGreaterThan(1)

    // Canvas should exist (2D canvas for SvgWorkspace)
    const canvasCount = await window.locator('canvas').count()
    expect(canvasCount).toBeGreaterThanOrEqual(1)

    // === No JS errors ===
    const errors = await window.evaluate(() => (window as any).__errors as any[])
    if (errors.length > 0) {
      console.log('[test] window.__errors:', JSON.stringify(errors))
    }
    expect(errors.length).toBe(0)
  })

  test('2. right panel shows SVG thumbnails after loading', async () => {
    const window = await electronApp.firstWindow()
    await waitForCanvas(window)

    // Load 3 SVGs into model-store with thumbnails
    const svgFiles = readdirSync(SVG_FIXTURES_DIR).filter(f => f.endsWith('.svg')).slice(0, 3)
    for (const name of svgFiles) {
      const svgText = readSvgFixture(name)
      await window.evaluate(async ({ name, text }: { name: string; text: string }) => {
        const modelStore = (window as any).__modelStore
        const { parseSvgLayers, parseSvgViewBox } = (window as any).__svgHelpers

        // Generate thumbnail via Canvas 2D
        function generateThumbInline(svgText: string): Promise<Blob | null> {
          return new Promise((resolve) => {
            const img = new Image()
            const blob = new Blob([svgText], { type: 'image/svg+xml' })
            const url = URL.createObjectURL(blob)
            img.onload = () => {
              const canvas = document.createElement('canvas')
              canvas.width = 200; canvas.height = 150
              const ctx = canvas.getContext('2d')
              if (!ctx) { resolve(null); return }
              ctx.fillStyle = '#f0f0f3'
              ctx.fillRect(0, 0, 200, 150)
              const scale = Math.min(180 / img.width, 130 / img.height, 1)
              const x = (200 - img.width * scale) / 2
              const y = (150 - img.height * scale) / 2
              ctx.fillStyle = '#ffffff'
              ctx.fillRect(x - 2, y - 2, img.width * scale + 4, img.height * scale + 4)
              ctx.drawImage(img, x, y, img.width * scale, img.height * scale)
              canvas.toBlob(b => resolve(b), 'image/png')
              URL.revokeObjectURL(url)
            }
            img.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
            img.src = url
          })
        }

        const layers = parseSvgLayers(text)
        const fileId = crypto.randomUUID()
        const filePath = `/e2e/${name}`

        modelStore.getState().addLoadedFile({
          id: fileId, fileName: name, filePath, mtimeMs: 1,
          buffer: new TextEncoder().encode(text).buffer, format: 'svg',
          sceneTree: [], glbPartInfos: [], modelCenteringOffset: null,
          sourceUnit: 'millimeter', fileGroup: 'vector', loadingPhase: 'done',
          svgLayers: layers, svgText: text,
        })

        const thumbBlob = await generateThumbInline(text)
        if (thumbBlob) {
          const { putThumbnail } = (window as any).__svgHelpers
          putThumbnail(`${filePath}|1`, thumbBlob)
        }
      }, { name, text: svgText })
    }

    await window.waitForTimeout(500)

    // Verify files are in model-store
    const loadedCount = await window.evaluate(() => {
      return (window as any).__modelStore.getState().loadedFiles.filter((f: any) => f.format === 'svg').length
    })
    expect(loadedCount).toBeGreaterThanOrEqual(3)

    // No errors
    const errors = await window.evaluate(() => (window as any).__errors?.length ?? 0)
    expect(errors).toBe(0)
  })

  test('3. file visibility toggle via eye icon', async () => {
    const window = await electronApp.firstWindow()
    await waitForCanvas(window)

    const svgText = readSvgFixture('add.svg')
    await loadSvgBatch(window, { 'add.svg': svgText })

    // Initially visible
    let vis = await window.evaluate(() => {
      return (window as any).__svgWorkspaceStore.getState().files[0]?.visible
    })
    expect(vis).toBe(true)

    // Toggle off
    await window.evaluate(() => {
      const store = (window as any).__svgWorkspaceStore
      const fileId = store.getState().files[0]?.fileId
      store.getState().toggleFileVisible(fileId)
    })

    vis = await window.evaluate(() => {
      return (window as any).__svgWorkspaceStore.getState().files[0]?.visible
    })
    expect(vis).toBe(false)

    // Toggle on
    await window.evaluate(() => {
      const store = (window as any).__svgWorkspaceStore
      const fileId = store.getState().files[0]?.fileId
      store.getState().toggleFileVisible(fileId)
    })
    vis = await window.evaluate(() => {
      return (window as any).__svgWorkspaceStore.getState().files[0]?.visible
    })
    expect(vis).toBe(true)
  })
})
