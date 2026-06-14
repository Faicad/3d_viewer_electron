/**
 * E2E: lazy material appearance generation populates correct scalar properties.
 *
 * Opening the material editor for a mesh must have its original emissiveIntensity,
 * transmission, etc. available on the first render — not just after a re-render.
 */
import { test, expect, _electron, Page } from '@playwright/test'
import { getElectronLaunchArgs, getElectronPath, createUserDataDir, cleanupUserDataDir } from './utils'
import { isSoftwareGpu } from './gpu-utils'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LAMP_BUFFER = readFileSync(path.join(__dirname, 'fixtures', 'AnisotropyBarnLamp.glb'))

async function waitForLoadDone(page: Page, timeout = 30000) {
  await page.waitForFunction(() => {
    const ms = (window as any).__modelStore
    return ms?.getState()?.__loadingPhase === 'done'
  }, { timeout })
}

test.describe('lazy material appearance', () => {
  test.setTimeout(60000)

  test('filament emissiveIntensity=25 and bulb transmission=1', async () => {
    const _userDataDir = createUserDataDir()
    const app = await _electron.launch({
      executablePath: getElectronPath(),
      args: getElectronLaunchArgs(),
      env: { ...process.env, E2E: '1' },
      userDataDir: _userDataDir,
    })
    const page = await app.firstWindow()
    page.on('console', (msg) => {
      if (msg.text().includes('[ensureAppearance]')) console.log('[browser]', msg.text())
    })
    await page.waitForLoadState('domcontentloaded')
    await page.locator('canvas').first().waitFor({ state: 'attached', timeout: 20000 })

    const _isSwGpu = isSoftwareGpu()
    test.skip(_isSwGpu, 'GLB material tests require hardware GPU')

    // Load AnisotropyBarnLamp.glb
    await page.locator('input[type="file"]').setInputFiles({
      name: 'AnisotropyBarnLamp.glb', mimeType: 'model/gltf-binary', buffer: LAMP_BUFFER,
    })
    await waitForLoadDone(page)

    // Right-click file → 材质管理
    await page.locator('[data-testid="scene-tree-file"]').first().click({ button: 'right' })
    const materialMgmtBtn = page.locator('.fixed.z-\\[100\\] button').filter({ hasText: '材质管理' })
    await materialMgmtBtn.waitFor({ state: 'visible', timeout: 5000 })
    await materialMgmtBtn.click()

    // ── Filament: emissiveIntensity should be 25 ──
    await page.getByRole('cell', { name: 'lamp filament' }).click()

    const filamentData = await page.evaluate(() => {
      const ms = (window as any).__materialStore?.getState()
      const primary = ms?.editingOverrideKey ?? ''
      const orig = ms?.materialOriginals?.[primary]
      return { primary, emissiveIntensity: orig?.emissiveIntensity }
    })
    console.log('[test] filament diag:', JSON.stringify(filamentData))
    expect(filamentData.emissiveIntensity, 'filament emissiveIntensity').toBe(25)

    // Close MaterialEditor
    await page.evaluate(() => { (window as any).__materialStore?.getState()?.closeMaterialEditor() })
    await page.waitForFunction(() => {
      const s = (window as any).__materialStore?.getState()
      return s?.materialEditorVisible === false
    }, { timeout: 5000 })

    // ── Glass: transmission should be 1 ──
    await page.getByRole('cell', { name: 'lamp glass' }).click()

    const bulbData = await page.evaluate(() => {
      const ms = (window as any).__materialStore?.getState()
      const primary = ms?.editingOverrideKey ?? ''
      const orig = ms?.materialOriginals?.[primary]
      return { primary, transmission: orig?.transmission }
    })
    console.log('[test] bulb diag:', JSON.stringify(bulbData))
    expect(bulbData.transmission, 'bulb transmission').toBe(1)

    await app.close()
    cleanupUserDataDir(_userDataDir)
  })
})
