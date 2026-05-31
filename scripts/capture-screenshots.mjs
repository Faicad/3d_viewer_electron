import { _electron } from '@playwright/test'
import { readFileSync } from 'fs'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT = path.resolve(ROOT, 'pages', 'public', 'screenshots')
const FIXTURES = path.resolve(ROOT, 'src', 'test', 'fixtures')

fs.mkdirSync(OUT, { recursive: true })

async function capture(name, page, fn) {
  if (fn) await fn()
  await page.waitForTimeout(1000)
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false })
  console.log(`✅ ${name}.png`)
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
  await page.waitForFunction(
    () => window.__modelStore?.getState().__loadingPhase === 'done',
    { timeout: 30000 },
  )
  await page.waitForTimeout(1500)
}

async function main() {
  const electronApp = await _electron.launch({
    executablePath: path.join(ROOT, 'dist', 'win-unpacked', '3D_Viewer.exe'),
    args: ['--no-sandbox'],
    env: { ...process.env, E2E: '1' },
  })

  const page = await electronApp.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.locator('canvas').first().waitFor({ state: 'attached', timeout: 30000 })
  await page.waitForTimeout(2000)

  // 1. Empty state
  await capture('main-window', page)

  // 2. Load AnisotropyBarnLamp.glb — a beautiful PBR model with metal/roughness
  await loadFile(page, 'AnisotropyBarnLamp.glb', 'model/gltf-binary')
  await capture('model-loaded', page)
  await capture('scene-tree', page)
  await capture('file-list', page)

  // 3. Settings dialog
  const settingsIcon = page.locator('svg.lucide-settings').first()
  if (await settingsIcon.isVisible().catch(() => false)) {
    await settingsIcon.click()
    await page.waitForTimeout(600)
    await capture('settings-panel', page)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  }

  // 4. Full viewport
  const togglePanel = page.locator('button:has(svg.lucide-panel-right-close), button:has(svg.lucide-panel-right-open)').first()
  if (await togglePanel.isVisible().catch(() => false)) {
    await togglePanel.click()
    await page.waitForTimeout(400)
  }
  await capture('viewport-fullscreen', page)

  await electronApp.close()
  console.log('🎉 Done!')
}

main().catch((err) => {
  console.error('❌ Failed:', err)
  process.exit(1)
})
