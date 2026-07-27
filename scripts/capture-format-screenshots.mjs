import { _electron } from '@playwright/test'
import { readFileSync } from 'fs'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { FORMATS } from './format-data.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT = path.resolve(ROOT, 'pages', 'public', 'screenshots', 'formats')
const FIXTURES = path.resolve(ROOT, 'src', 'test', 'fixtures')

fs.mkdirSync(OUT, { recursive: true })

async function capture(name, page, fn, fullPage = true) {
  if (fn) await fn()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage })
  console.log(`  ✅ ${name}.png`)
}

async function loadFile(page, fileName, mimeType) {
  await page.evaluate(() => {
    window.__modelStore?.getState().reset()
  })
  const buf = readFileSync(path.join(FIXTURES, fileName))
  await page.locator('input[type="file"]').setInputFiles({
    name: fileName,
    mimeType,
    buffer: buf,
  })

  // ── Wait for loading to complete ──────────────────────────────────
  // For 3D formats: model store __loadingPhase becomes 'done'
  // For SVG/DXF (2D) formats: svgWorkspaceStore.files becomes non-empty
  await page.waitForFunction(
    () => {
      const modelDone = window.__modelStore?.getState().__loadingPhase === 'done'
      const svgLoading = window.__svgWorkspaceStore?.getState().files.length > 0
      return modelDone || svgLoading
    },
    { timeout: 30000 },
  )

  // Additional stabilization time for rendering
  await page.waitForTimeout(2000)
}

async function main() {
  const targetFormats = process.argv.slice(2)
  const formatsWithFixtures = targetFormats.length > 0
    ? FORMATS.filter(f => f.fixture && targetFormats.includes(f.id))
    : FORMATS.filter(f => f.fixture)

  if (formatsWithFixtures.length === 0) {
    console.log('No matching formats to capture.')
    return
  }

  console.log(`Capturing screenshots for ${formatsWithFixtures.length} format(s): ${formatsWithFixtures.map(f => f.id).join(', ')}`)

  // Close file list panel for better screenshots
  const electronApp = await _electron.launch({
    executablePath: path.join(ROOT, 'dist', 'win-unpacked', '3D_Viewer.exe'),
    args: ['--no-sandbox'],
    env: { ...process.env, E2E: '1' },
  })

  const page = await electronApp.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.locator('canvas').first().waitFor({ state: 'attached', timeout: 30000 })
  await page.waitForTimeout(2000)

  // Try to close right panel for cleaner screenshots
  const toggleBtn = page.locator('button:has(svg.lucide-panel-right-close)').first()
  if (await toggleBtn.isVisible().catch(() => false)) {
    await toggleBtn.click()
    await page.waitForTimeout(400)
  }

  for (const f of formatsWithFixtures) {
    console.log(`  Loading ${f.id} (${f.fixture})...`)
    try {
      await loadFile(page, f.fixture, f.mimeType)
      await capture(f.id, page)
    } catch (err) {
      console.log(`  ❌ ${f.id}: ${err.message}`)
    }
  }

  await electronApp.close()
  console.log('🎉 All format screenshots captured!')
}

main().catch((err) => {
  console.error('❌ Failed:', err)
  process.exit(1)
})
