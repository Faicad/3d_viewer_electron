/**
 * E2E: auto-switch + three-mode mutual exclusion for material editor.
 *
 * Auto-switch: editing a mesh → left-click another mesh in scene tree →
 * editor auto-switches to the newly highlighted mesh.
 *
 * Mutual exclusion:
 *   1. Default material panel closes when a model loads
 *   2. Editing mesh + opening GLB material → replaces with GLB mode
 *   3. Editing GLB material + left-click mesh → no auto-switch
 *   4. Editing GLB material + right-click edit mesh → replaces with mesh mode
 */
import { test, expect, _electron, type ElectronApplication, type Page } from '@playwright/test'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getElectronLaunchArgs, getElectronPath, createUserDataDir, cleanupUserDataDir } from './utils'
import { isSoftwareGpu } from './gpu-utils'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LAMP_BUFFER = readFileSync(path.join(__dirname, 'fixtures', 'AnisotropyBarnLamp.glb'))

// ---- helpers ----

async function waitForLoadDone(page: Page, timeout = 30000) {
  await page.waitForFunction(
    () => window.__modelStore?.getState().__loadingPhase === 'done',
    { timeout },
  )
}

function dumpState() {
  return `(() => {
    var m = window.__materialStore && window.__materialStore.getState()
    if (!m) return {}
    var key = m.editingOverrideKey || ''
    var orig = m.materialOriginals || {}
    var e = orig[key]
    return {
      visible: m.materialEditorVisible,
      editingKey: key,
      fanoutKeys: m.editingFanoutKeys || [],
      isDefault: m.isEditingDefault,
      isMatDef: m.isEditingMaterialDefinition,
      title: m.materialEditorTitle || '',
      transmission: e ? e.transmission : undefined,
      emissive: e ? e.emissiveIntensity : undefined,
    }
  })()`
}

function dumpHighlighted() {
  return `(() => {
    var nodes = document.querySelectorAll('[data-testid="scene-tree-part"]')
    var h = []
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].className.includes('ring-1')) h.push((nodes[i].textContent || '').trim())
    }
    return h
  })()`
}

function log(label: string, obj: unknown) {
  console.log('── ' + label + ' ──\n' + JSON.stringify(obj, null, 2))
}

// ---- tests ----

test.describe.serial('material editor auto-switch', () => {
  let electronApp: ElectronApplication
  let page: Page
  let _userDataDir: string
  let _isSwGpu = false

  test.beforeAll(async () => {
    _userDataDir = createUserDataDir()
    electronApp = await _electron.launch({
      executablePath: getElectronPath(),
      args: getElectronLaunchArgs(),
      env: { ...process.env, E2E: '1' },
      userDataDir: _userDataDir,
    })
    page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.locator('canvas').first().waitFor({ state: 'attached', timeout: 20000 })
    _isSwGpu = isSoftwareGpu()
  })

  test.afterAll(async () => {
    await electronApp.close()
    cleanupUserDataDir(_userDataDir)
  })

  test.beforeEach(async () => {
    // Reset model store between tests
    await page.evaluate(() => {
      (window as any).__modelStore?.getState?.()?.reset?.()
      ;(window as any).__materialStore?.getState?.()?.closeMaterialEditor?.()
    })
    await page.waitForTimeout(500)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.waitForFunction(
      () => document.querySelector('aside[data-testid="left-panel"]') !== null,
      { timeout: 5000 },
    ).catch(() => {})
  })

  test('editing mesh → left-click another mesh → auto-switch editor', async () => {
    test.skip(_isSwGpu, 'Material editor tests require hardware GPU')

    // Load model
    await page.locator('input[type="file"]').setInputFiles({
      name: 'AnisotropyBarnLamp.glb', mimeType: 'model/gltf-binary', buffer: LAMP_BUFFER,
    })
    await waitForLoadDone(page)

    // ---- 1. Left-click lamp_glass to highlight, then open editor via toolbar ----
    const glass = page.locator('[data-testid="scene-tree-part"]').filter({ hasText: /lamp_glass/ })
    await expect(glass).toBeAttached({ timeout: 5000 })
    await glass.click()
    const materialBtn = page.locator('header button').filter({ has: page.locator('svg.text-pink-500') }).first()
    await materialBtn.click()
    await page.locator('button[aria-label="close material editor"]').waitFor({ timeout: 5000 })

    let s = await page.evaluate(dumpState()) as Record<string, unknown>
    log('editor on lamp_glass', s)
    expect(s.editingKey).toContain('lamp_glass')
    expect(s.transmission).toBe(1)

    // ---- 2. Left-click lamp_filament → auto-switch ----
    const filament = page.locator('[data-testid="scene-tree-part"]').filter({ hasText: /lamp_filament/ })
    await filament.click()
    await page.waitForTimeout(300)

    s = await page.evaluate(dumpState()) as Record<string, unknown>
    log('after clicking filament', s)
    expect(s.editingKey, 'should auto-switch to lamp_filament').toContain('lamp_filament')
    expect(s.emissive, 'filament emissive intensity should be 25').toBe(25)

    // Only filament highlighted
    const h = await page.evaluate(dumpHighlighted()) as string[]
    log('highlighted', h)
    expect(h.length).toBe(1)
    expect(h[0]).toContain('lamp_filament')

    // ---- 3. Left-click lamp_glass → switch back ----
    await glass.click()
    await page.waitForTimeout(300)

    s = await page.evaluate(dumpState()) as Record<string, unknown>
    log('back to lamp_glass', s)
    expect(s.editingKey).toContain('lamp_glass')
    expect(s.transmission).toBe(1)
  })

  test('editing GLB material → left-click does NOT auto-switch → right-click edit replaces panel', async () => {
    test.skip(_isSwGpu, 'Material editor tests require hardware GPU')

    await page.locator('input[type="file"]').setInputFiles({
      name: 'AnisotropyBarnLamp.glb', mimeType: 'model/gltf-binary', buffer: LAMP_BUFFER,
    })
    await waitForLoadDone(page)

    // ---- 1. Open GLB material editor via Material Manager ----
    const fileNode = page.locator('[data-testid="scene-tree-file"]').first()
    await fileNode.click({ button: 'right' })
    const materialManager = page.getByText(/Material Manager|材质管理/)
    await expect(materialManager).toBeVisible({ timeout: 3000 })
    await materialManager.click()

    // Click a GLB material row
    const materialRow = page.getByRole('cell', { name: /lamp glass/i }).first()
    await expect(materialRow).toBeVisible({ timeout: 5000 })
    await materialRow.click()
    await page.locator('button[aria-label="close material editor"]').waitFor({ timeout: 5000 })

    let s = await page.evaluate(dumpState()) as Record<string, unknown>
    log('GLB material def editor', s)
    expect(s.isMatDef).toBe(true)

    // ---- 2. Left-click lamp_filament → should NOT auto-switch ----
    const filament = page.locator('[data-testid="scene-tree-part"]').filter({ hasText: /lamp_filament/ })
    await filament.click()
    await page.waitForTimeout(300)

    s = await page.evaluate(dumpState()) as Record<string, unknown>
    log('after left-click filament (should NOT auto-switch)', s)
    expect(s.isMatDef, 'still editing GLB material, should not auto-switch').toBe(true)

    // ---- 3. Right-click lamp_filament → "编辑材质" → replaces GLB panel ----
    await filament.click({ button: 'right' })
    await page.getByText(/Edit Material|编辑材质/).first().click()
    await page.locator('button[aria-label="close material editor"]').waitFor({ timeout: 5000 })

    s = await page.evaluate(dumpState()) as Record<string, unknown>
    log('after right-click edit filament', s)
    expect(s.isMatDef, 'GLB panel replaced by mesh editor').toBe(false)
    expect(s.isDefault).toBe(false)
    expect(s.editingKey).toContain('lamp_filament')
    expect(s.emissive).toBe(25)

    const h = await page.evaluate(dumpHighlighted()) as string[]
    log('highlighted', h)
    expect(h.length).toBe(1)
    expect(h[0]).toContain('lamp_filament')
  })

  test('editing mesh → click GLB material row → replaces with GLB mode', async () => {
    test.skip(_isSwGpu, 'Material editor tests require hardware GPU')

    await page.locator('input[type="file"]').setInputFiles({
      name: 'AnisotropyBarnLamp.glb', mimeType: 'model/gltf-binary', buffer: LAMP_BUFFER,
    })
    await waitForLoadDone(page)

    // ---- 1. Open mesh editor for lamp_glass via right-click ----
    const glass = page.locator('[data-testid="scene-tree-part"]').filter({ hasText: /lamp_glass/ })
    await glass.click({ button: 'right' })
    await page.getByText(/Edit Material|编辑材质/).first().click()
    await page.locator('button[aria-label="close material editor"]').waitFor({ timeout: 5000 })

    let s = await page.evaluate(dumpState()) as Record<string, unknown>
    log('mesh editor open', s)
    expect(s.isMatDef).toBe(false)

    // ---- 2. Trigger GLB material editing via store (replaces mesh editor) ----
    s = await page.evaluate(() => {
      const modelStore = (window as any).__modelStore.getState()
      const matStore = (window as any).__materialStore
      const file = modelStore.loadedFiles[0]
      const fileId = file.id
      const glassPart = file.glbPartInfos.find((p: any) => p.name && p.name.includes('glass'))
      if (!glassPart) return { ok: false, reason: 'glass part not found' }
      const partIds = modelStore.getPartIdsByMaterial(fileId, glassPart.materialIndex)
      matStore.getState().openMaterialEditor(partIds[0], partIds, 'lamp glass / AnisotropyBarnLamp', true)
      s = matStore.getState()
      return {
        ok: true,
        isMatDef: s.isEditingMaterialDefinition,
        editingKey: s.editingOverrideKey,
        fanoutLen: (s.editingFanoutKeys as string[]).length,
      }
    })
    log('after GLB material trigger', s)
    expect(s.isMatDef).toBe(true)
    expect(s.fanoutLen).toBeGreaterThanOrEqual(1)
  })
})
