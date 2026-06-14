import { test, expect, ElectronApplication, _electron, Page } from '@playwright/test'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getElectronLaunchArgs, getElectronPath, createUserDataDir, cleanupUserDataDir } from './utils'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BOX_BOSS_GLB = readFileSync(path.join(__dirname, 'fixtures', 'box_boss.glb'))

async function waitForLoadDone(page: Page, timeout = 30000) {
  await page.waitForFunction(
    () => window.__modelStore?.getState().__loadingPhase === 'done',
    { timeout },
  )
}

async function loadModel(page: Page, base64: string, fileName: string) {
  await page.evaluate(({ b64, name }: { b64: string; name: string }) => {
    const binary = atob(b64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const id = crypto.randomUUID()
    window.__modelStore!.getState().addLoadedFile({
      id,
      fileName: name,
      filePath: name,
      mtimeMs: 0,
      buffer: bytes.buffer.slice(0),
      format: 'glb',
      sceneTree: [],
      glbPartInfos: [],
      modelCenteringOffset: null,
      sourceUnit: 'meter',
      fileGroup: 'mesh',
      loadingPhase: 'loading',
    })
  }, { b64: base64, name: fileName })
  await waitForLoadDone(page)
}

async function ensureLeftPanelOpen(page: Page) {
  const panel = page.locator('[data-testid="left-panel"]')
  if (!(await panel.isVisible().catch(() => false))) {
    const toggleBtn = page.getByRole('button', { name: /toggle|left|panel/i })
    if (await toggleBtn.isVisible().catch(() => false)) {
      await toggleBtn.click()
      await page.waitForTimeout(300)
    }
  }
}

test.describe.serial('Material editor — scene tree nodes', () => {
  let electronApp: ElectronApplication
  let page: Page
  let _userDataDir: string

  test.beforeAll(async () => {
    _userDataDir = createUserDataDir()
    electronApp = await _electron.launch({
      executablePath: getElectronPath(),
      args: getElectronLaunchArgs(),
      env: { ...process.env, E2E: '1' },
      userDataDir: _userDataDir,
    })
    page = await electronApp.firstWindow()
    await page.waitForSelector('canvas', { timeout: 20000 })
  })

  test.afterAll(async () => {
    await electronApp.close()
    cleanupUserDataDir(_userDataDir)
  })

  test.beforeEach(async () => {
    await page.evaluate(() => {
      (window as any).__modelStore?.getState?.()?.reset?.()
      ;(window as any).__materialStore?.getState?.()?.closeMaterialEditor?.()
    })
    await page.waitForTimeout(300)
    await page.setViewportSize({ width: 1280, height: 800 })
    await ensureLeftPanelOpen(page)
  })

  test('part node context menu has "Edit Material" and opens editor', async () => {
    const boxB64 = BOX_BOSS_GLB.toString('base64')
    await loadModel(page, boxB64, 'box_boss.glb')

    const partNode = page.locator('[data-testid="scene-tree-part"]').first()
    await expect(partNode).toBeAttached({ timeout: 5000 })
    await partNode.click({ button: 'right' })

    const editItem = page.getByText(/Edit Material|编辑材质/)
    await expect(editItem.first()).toBeVisible({ timeout: 3000 })
    await editItem.first().click()

    const closeBtn = page.locator('button[aria-label="close material editor"]')
    await expect(closeBtn).toBeVisible({ timeout: 5000 })

    const storeInfo = await page.evaluate(() => {
      const mat = (window as any).__materialStore.getState() as any
      return {
        editingKey: mat.editingOverrideKey as string,
        fanoutKeys: mat.editingFanoutKeys as string[],
        isMatDef: mat.isEditingMaterialDefinition as boolean,
      }
    })
    expect(storeInfo.editingKey).toBeTruthy()
    expect(storeInfo.fanoutKeys.length).toBe(1)
    expect(storeInfo.isMatDef).toBe(false)

    await closeBtn.click()
  })

  test('part node title is "partName / fileName"', async () => {
    const boxB64 = BOX_BOSS_GLB.toString('base64')
    await loadModel(page, boxB64, 'box_boss.glb')

    const partNode = page.locator('[data-testid="scene-tree-part"]').first()
    const partDisplayName = await partNode.textContent()
    expect(partDisplayName).toBeTruthy()

    await partNode.click({ button: 'right' })
    await page.getByText(/Edit Material|编辑材质/).first().click()

    const title = page.locator('button[aria-label="close material editor"]').locator('..').locator('span.text-xs')
    await expect(title).toBeVisible({ timeout: 5000 })
    const expected = `${partDisplayName} / box_boss.glb`
    await expect(title).toHaveText(expected)

    await page.locator('button[aria-label="close material editor"]').click()
  })

  test('file node context menu does NOT have "编辑材质"', async () => {
    const boxB64 = BOX_BOSS_GLB.toString('base64')
    await loadModel(page, boxB64, 'box_boss.glb')

    const fileNode = page.locator('[data-testid="scene-tree-file"]').first()
    await expect(fileNode).toBeAttached({ timeout: 5000 })
    await fileNode.click({ button: 'right' })

    const editItem = page.getByText('编辑材质')
    await expect(editItem).not.toBeVisible({ timeout: 2000 })
  })

})
