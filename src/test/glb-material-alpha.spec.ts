/**
 * E2E: clicking BLEND/MASK materials in GLB Extension Panel opens MaterialEditor
 * with the correct alphaMode pre-selected.
 */
import { test, expect, _electron, Page } from '@playwright/test'
import { getElectronLaunchArgs, getElectronPath, createUserDataDir, cleanupUserDataDir } from './utils'
import { isSoftwareGpu } from './gpu-utils'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BATH_DAY_BUFFER = readFileSync(path.join(__dirname, 'fixtures', 'bath_day.glb'))

async function waitForLoadDone(page: Page, timeout = 30000) {
  await page.waitForFunction(() => {
    const ms = (window as any).__modelStore
    return ms?.getState()?.__loadingPhase === 'done'
  }, { timeout })
}

test.describe('alphaMode', () => {
  test.setTimeout(60000)

  test('BLEND then MASK', async () => {
    const _userDataDir = createUserDataDir()
    const app = await _electron.launch({
      executablePath: getElectronPath(),
      args: getElectronLaunchArgs(),
      env: { ...process.env, E2E: '1' },
      userDataDir: _userDataDir,
    })
    const page = await app.firstWindow()
    // Capture browser console
    page.on('console', (msg) => {
      if (msg.text().includes('[cloneMaterial]')) console.log('[browser]', msg.text())
    })
    await page.waitForLoadState('domcontentloaded')
    await page.locator('canvas').first().waitFor({ state: 'attached', timeout: 20000 })

    // On software GPU the context menu items for GLB files may not render
    // and model loading may time out.
    const _isSwGpu = isSoftwareGpu()
    test.skip(_isSwGpu, 'GLB material alpha tests require hardware GPU')

    // Load bath_day.glb
    await page.locator('input[type="file"]').setInputFiles({
      name: 'bath_day.glb', mimeType: 'model/gltf-binary', buffer: BATH_DAY_BUFFER,
    })
    await waitForLoadDone(page)
    // Right-click file → 材质管理
    await page.locator('[data-testid="scene-tree-file"]').first().click({ button: 'right' })
    const materialMgmtBtn = page.locator('.fixed.z-\\[100\\] button').filter({ hasText: '材质管理' })
    await materialMgmtBtn.waitFor({ state: 'visible', timeout: 5000 })
    await materialMgmtBtn.click()

    // ── BLEND ──
    await page.getByRole('cell', { name: '07_-_Default' }).click()

    const r1 = await page.evaluate(() => {
      const labels = ['不透明','遮罩','混合']
      return Array.from(document.querySelectorAll('button'))
        .filter(b => labels.includes(b.textContent?.trim()??''))
        .map(b => ({ text: b.textContent?.trim(), sel: b.className.includes('bg-primary') }))
    })
    expect(r1.find(b => b.text === '混合')?.sel, 'BLEND selected').toBe(true)

    // Close MaterialEditor via store
    await page.evaluate(() => { (window as any).__materialStore?.getState()?.closeMaterialEditor() })
    // Wait for material editor panel to fully close
    await page.waitForFunction(() => {
      const s = (window as any).__materialStore?.getState()
      return s?.materialEditorVisible === false
    }, { timeout: 5000 })

    // ── MASK ──
    await page.getByRole('cell', { name: '03_-_Default' }).click({ force: true })

    // Diagnostic: check original material properties
    const rawMatDiag = await page.evaluate(() => {
      const ms = (window as any).__materialStore?.getState()
      const primary = ms?.editingOverrideKeys?.[0] ?? ''
      const orig = ms?.materialOriginals?.[primary]
      return { primary, origAlphaMode: orig?.alphaMode, origAlphaCutoff: orig?.alphaCutoff }
    })
    console.log('[test] MASK raw diag:', JSON.stringify(rawMatDiag))

    const r2 = await page.evaluate(() => {
      const labels = ['不透明','遮罩','混合']
      return Array.from(document.querySelectorAll('button'))
        .filter(b => labels.includes(b.textContent?.trim()??''))
        .map(b => ({ text: b.textContent?.trim(), sel: b.className.includes('bg-primary') }))
    })
    expect(r2.find(b => b.text === '遮罩')?.sel, 'MASK selected').toBe(true)

    await app.close()
    cleanupUserDataDir(_userDataDir)
  })
})
