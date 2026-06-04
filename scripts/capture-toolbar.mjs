/**
 * Captures screenshots for the "工具栏" (Toolbar) help documentation.
 *
 * Captures twice per feature:
 *   - zh/  → Chinese locale (for zh docs pages)
 *   - en/  → English locale (for all other language docs pages)
 *
 * Prerequisites:
 *   - npm run build:unpacked
 *
 * Output: pages/public/screenshots/toolbar/{zh,en}/*.png
 *
 * Usage: node scripts/capture-toolbar.mjs
 */

import { _electron } from '@playwright/test'
import { readFileSync, mkdirSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT = path.resolve(ROOT, 'pages', 'public', 'screenshots', 'toolbar')
const FIXTURES = path.resolve(ROOT, 'src', 'test', 'fixtures')
const EXE = path.join(ROOT, 'dist', 'win-unpacked', '3D_Viewer.exe')
const MIME_3MF = 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml'

const SCREENSHOT_NAMES = [
  'open-file-dialog',
  'file-list-after-open',
  'axis-z-up',
  'axis-y-up',
  'perspective-mode',
  'orthographic-mode',
  'material-manager-panel',
  'render-settings-panel',
  'bed-management-panel',
  'history-panel',
  'model-info-panel',
  'sidebar-left-visible',
  'sidebar-left-hidden',
  'sidebar-right-visible',
  'sidebar-right-hidden',
  'cache-management-panel',
  'system-settings-panel',
  'fullscreen-viewport',
]

let screenshotIndex = 0

async function capture(name, page, locale) {
  await page.waitForTimeout(800)
  const filePath = path.join(OUT, locale, `${name}.png`)
  await page.screenshot({ path: filePath, fullPage: false })
  screenshotIndex++
  console.log(`  [${String(screenshotIndex).padStart(2, '0')}] [${locale}] ✅ ${name}.png`)
}

/** Set locale and reload page so i18n reinitializes from localStorage */
async function setLocale(page, locale) {
  await page.evaluate((lang) => {
    localStorage.setItem('lang', lang)
  }, locale)
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  await page.locator('canvas').first().waitFor({ state: 'attached', timeout: 30000 })
  await page.waitForTimeout(2000)
}

/** Load vise.3mf via hidden file input */
async function loadVise(page) {
  await page.evaluate(() => window.__modelStore?.getState().reset())
  const buf = readFileSync(path.join(FIXTURES, 'vise.3mf'))
  await page.locator('input[type="file"]').setInputFiles({
    name: 'vise.3mf',
    mimeType: MIME_3MF,
    buffer: buf,
  })
  await page.waitForFunction(
    () => window.__modelStore?.getState().__loadingPhase === 'done',
    { timeout: 30000 },
  )
  await page.waitForTimeout(1500)
}

/** Ensure both side panels are open */
async function ensureSidePanelsOpen(page) {
  const leftOpen = page.locator('button:has(svg.lucide-panel-left-open)').first()
  if (await leftOpen.isVisible().catch(() => false)) {
    await leftOpen.click({ force: true })
    await page.waitForTimeout(200)
  }
  const rightOpen = page.locator('button:has(svg.lucide-panel-right-open)').first()
  if (await rightOpen.isVisible().catch(() => false)) {
    await rightOpen.click({ force: true })
    await page.waitForTimeout(200)
  }
}

/** Close all floating panels by clicking their toolbar buttons */
async function closeAllFloatingPanels(page) {
  const paletteBtn = page.locator('button:has(svg.lucide-palette)').first()
  const matClose = page.locator('button[aria-label="close material editor"]')
  if (await matClose.isVisible().catch(() => false)) {
    await paletteBtn.click({ force: true })
    await page.waitForTimeout(200)
  }

  const envClose = page.locator('button[aria-label="close environment panel"]')
  if (await envClose.isVisible().catch(() => false)) {
    const sunBtn = page.locator('button:has(svg.lucide-sun)').first()
    await sunBtn.click({ force: true })
    await page.waitForTimeout(200)
  }

  const infoBtn = page.locator('[data-testid="toolbar-model-info"]')
  const infoClose = page.locator('button[aria-label="close model info"]')
  if (await infoClose.isVisible().catch(() => false)) {
    await infoBtn.click({ force: true })
    await page.waitForTimeout(200)
  }
}

/** Reset to default state */
async function cleanState(page) {
  await closeAllFloatingPanels(page)
  await ensureSidePanelsOpen(page)

  // Close history panel if open
  const historyBtn = page.locator('button:has(svg.lucide-clock)').first()
  const histPanel = page.locator('text=历史模型').or(page.locator('text=History'))
  if (await histPanel.isVisible().catch(() => false)) {
    await historyBtn.click({ force: true })
    await page.waitForTimeout(200)
  }

  await page.waitForTimeout(200)
}

/** Capture all 18 screenshots for one locale */
async function captureAll(page, locale) {
  screenshotIndex = 0
  console.log(`\n========== Locale: ${locale} ==========`)

  // -----------------------------------------------------------------------
  // 1. Open File — empty state
  // -----------------------------------------------------------------------
  console.log('\n=== 1. Open File ===')
  // Don't use cleanState here since no model is loaded yet
  await capture('open-file-dialog', page, locale)

  // Load vise.3mf
  console.log('\n=== Loading vise.3mf ===')
  await loadVise(page)
  await capture('file-list-after-open', page, locale)

  // -----------------------------------------------------------------------
  // 2. Axis Switch
  // -----------------------------------------------------------------------
  console.log('\n=== 2. Axis Switch ===')
  await cleanState(page)
  await capture('axis-z-up', page, locale)

  const yBtn = page.locator('button:has(span:text-is("Y↑"))').first()
  await yBtn.click({ force: true })
  await page.waitForTimeout(600)
  await capture('axis-y-up', page, locale)

  const zBtn = page.locator('button:has(span:text-is("Z↑"))').first()
  await zBtn.click({ force: true })
  await page.waitForTimeout(300)

  // -----------------------------------------------------------------------
  // 3. Perspective Mode
  // -----------------------------------------------------------------------
  console.log('\n=== 3. Perspective Mode ===')
  await cleanState(page)
  await capture('perspective-mode', page, locale)

  const orthoBtn = page.locator('button:has(svg.lucide-grid-3x3)').first()
  await orthoBtn.click({ force: true })
  await page.waitForTimeout(600)
  await capture('orthographic-mode', page, locale)

  const perspBtn = page.locator('button:has(svg.lucide-cuboid)').first()
  await perspBtn.click({ force: true })
  await page.waitForTimeout(300)

  // -----------------------------------------------------------------------
  // 4. Material Manager
  // -----------------------------------------------------------------------
  console.log('\n=== 4. Material Manager ===')
  await cleanState(page)
  const paletteBtn = page.locator('button:has(svg.lucide-palette)').first()
  await paletteBtn.click({ force: true })
  await capture('material-manager-panel', page, locale)
  await paletteBtn.click({ force: true })
  await page.waitForTimeout(300)

  // -----------------------------------------------------------------------
  // 5. Render Settings
  // -----------------------------------------------------------------------
  console.log('\n=== 5. Render Settings ===')
  await cleanState(page)
  const sunBtn = page.locator('button:has(svg.lucide-sun)').first()
  await sunBtn.click({ force: true })
  await capture('render-settings-panel', page, locale)
  await sunBtn.click({ force: true })
  await page.waitForTimeout(300)
  const envClose = page.locator('button[aria-label="close environment panel"]')
  if (await envClose.isVisible().catch(() => false)) {
    await envClose.click()
    await page.waitForTimeout(200)
  }

  // -----------------------------------------------------------------------
  // 6. Bed Management
  // -----------------------------------------------------------------------
  console.log('\n=== 6. Bed Management ===')
  await cleanState(page)
  // Close right panel for cleaner bed view
  const rightClose = page.locator('button:has(svg.lucide-panel-right-close)').first()
  if (await rightClose.isVisible().catch(() => false)) {
    await rightClose.click({ force: true })
    await page.waitForTimeout(300)
  }
  const heatbedBtn = page.locator('[data-testid="toolbar-heatbed"]')
  await capture('bed-management-panel', page, locale)
  await heatbedBtn.click({ force: true })
  await page.waitForTimeout(300)
  const rightOpen = page.locator('button:has(svg.lucide-panel-right-open)').first()
  if (await rightOpen.isVisible().catch(() => false)) {
    await rightOpen.click({ force: true })
    await page.waitForTimeout(200)
  }

  // -----------------------------------------------------------------------
  // 7. History
  // -----------------------------------------------------------------------
  console.log('\n=== 7. History ===')
  await cleanState(page)
  const clockBtn = page.locator('button:has(svg.lucide-clock)').first()
  await clockBtn.click({ force: true })
  await capture('history-panel', page, locale)
  await clockBtn.click({ force: true })
  await page.waitForTimeout(300)

  // -----------------------------------------------------------------------
  // 8. Model Info
  // -----------------------------------------------------------------------
  console.log('\n=== 8. Model Info ===')
  await cleanState(page)
  const infoBtn = page.locator('[data-testid="toolbar-model-info"]')
  await infoBtn.click({ force: true })
  await capture('model-info-panel', page, locale)
  await infoBtn.click({ force: true })
  await page.waitForTimeout(300)

  // -----------------------------------------------------------------------
  // 9. Sidebar Control
  // -----------------------------------------------------------------------
  console.log('\n=== 9. Sidebar Control ===')
  await cleanState(page)
  await capture('sidebar-left-visible', page, locale)
  const leftToggle = page.locator('button:has(svg.lucide-panel-left-close)').first()
  await leftToggle.click({ force: true })
  await page.waitForTimeout(400)
  await capture('sidebar-left-hidden', page, locale)
  const leftOpenBtn = page.locator('button:has(svg.lucide-panel-left-open)').first()
  if (await leftOpenBtn.isVisible().catch(() => false)) {
    await leftOpenBtn.click({ force: true })
    await page.waitForTimeout(300)
  }
  await capture('sidebar-right-visible', page, locale)
  const rightToggle = page.locator('button:has(svg.lucide-panel-right-close)').first()
  await rightToggle.click({ force: true })
  await page.waitForTimeout(400)
  await capture('sidebar-right-hidden', page, locale)
  const rightOpenBtn = page.locator('button:has(svg.lucide-panel-right-open)').first()
  if (await rightOpenBtn.isVisible().catch(() => false)) {
    await rightOpenBtn.click({ force: true })
    await page.waitForTimeout(200)
  }

  // -----------------------------------------------------------------------
  // 10. Cache Management
  // -----------------------------------------------------------------------
  console.log('\n=== 10. Cache Management ===')
  await cleanState(page)
  const dbBtn = page.locator('button:has(svg.lucide-database)').first()
  await dbBtn.click({ force: true })
  await capture('cache-management-panel', page, locale)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)

  // -----------------------------------------------------------------------
  // 11. System Settings
  // -----------------------------------------------------------------------
  console.log('\n=== 11. System Settings ===')
  await cleanState(page)
  const settingsBtn = page.locator('button:has(svg.lucide-settings)').first()
  await settingsBtn.click({ force: true })
  await capture('system-settings-panel', page, locale)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)

  // -----------------------------------------------------------------------
  // 12. Fullscreen
  // -----------------------------------------------------------------------
  console.log('\n=== 12. Fullscreen ===')
  await cleanState(page)
  const maxBtn = page.locator('button:has(svg.lucide-maximize)').first()
  await maxBtn.click({ force: true })
  await capture('fullscreen-viewport', page, locale)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Create output directories
  mkdirSync(path.join(OUT, 'zh'), { recursive: true })
  mkdirSync(path.join(OUT, 'en'), { recursive: true })

  console.log('Launching Electron app...')
  const electronApp = await _electron.launch({
    executablePath: EXE,
    args: ['--no-sandbox'],
    env: { ...process.env, E2E: '1' },
  })

  const page = await electronApp.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.locator('canvas').first().waitFor({ state: 'attached', timeout: 30000 })
  // Maximized viewport
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.waitForTimeout(2000)

  // -----------------------------------------------------------------------
  // First pass: Chinese locale
  // -----------------------------------------------------------------------
  await setLocale(page, 'zh')
  await captureAll(page, 'zh')

  // -----------------------------------------------------------------------
  // Second pass: English locale
  // -----------------------------------------------------------------------
  await setLocale(page, 'en')
  await captureAll(page, 'en')

  // -----------------------------------------------------------------------
  // Done
  // -----------------------------------------------------------------------
  await electronApp.close()
  console.log(`\n🎉 All screenshots captured for zh/ and en/`)
}

main().catch((err) => {
  console.error('❌ Failed:', err)
  process.exit(1)
})
