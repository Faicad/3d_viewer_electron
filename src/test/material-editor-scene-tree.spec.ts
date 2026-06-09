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

test.describe('Material editor — scene tree nodes', () => {
  let electronApp: ElectronApplication
  let _userDataDir: string

  test.beforeAll(async () => {
    _userDataDir = createUserDataDir()
    electronApp = await _electron.launch({
      executablePath: getElectronPath(),
      args: getElectronLaunchArgs(),
      env: { ...process.env, E2E: '1' },
      userDataDir: _userDataDir,
    })
  })

  test.afterAll(async () => {
    await electronApp.close()
    cleanupUserDataDir(_userDataDir)
  })

  test('file node context menu has "編集材質" and opens editor', async () => {
    const window = await electronApp.firstWindow()
    await window.waitForSelector('canvas', { timeout: 20000 })
    await window.setViewportSize({ width: 1280, height: 800 })
    await ensureLeftPanelOpen(window)

    const boxB64 = BOX_BOSS_GLB.toString('base64')
    await loadModel(window, boxB64, 'box_boss.glb')

    // Right-click the file node
    const fileNode = window.locator('[data-testid="scene-tree-file"]').first()
    await expect(fileNode).toBeAttached({ timeout: 5000 })
    await fileNode.click({ button: 'right' })

    // Context menu should have "編集材質" or "编辑材質"
    const editItem = window.getByRole('button', { name: '编辑材质' })
    await expect(editItem).toBeVisible({ timeout: 3000 })
    await editItem.click()

    // Material editor should appear
    const closeBtn = window.locator('button[aria-label="close material editor"]')
    await expect(closeBtn).toBeVisible({ timeout: 5000 })
    await closeBtn.click()
  })

  test('file node material editor applies colour to all child parts', async () => {
    const window = await electronApp.firstWindow()
    await window.waitForSelector('canvas', { timeout: 20000 })
    await ensureLeftPanelOpen(window)

    const boxB64 = BOX_BOSS_GLB.toString('base64')
    await loadModel(window, boxB64, 'box_boss.glb')

    const fileNode = window.locator('[data-testid="scene-tree-file"]').first()
    await fileNode.click({ button: 'right' })
    await window.getByRole('button', { name: '编辑材质' }).click()
    await window.locator('button[aria-label="close material editor"]').waitFor({ timeout: 5000 })

    // Change colour to red
    const colorInput = window.locator('input[type="color"]').first()
    if (await colorInput.isVisible().catch(() => false)) {
      await colorInput.fill('#ff0000')
    }
    await window.locator('button[aria-label="close material editor"]').click()

    // Verify all parts have overrides
    const result = await window.evaluate(() => {
      const ms = window.__modelStore!.getState() as any
      const mat = window.__materialStore!.getState() as any
      const overrides = mat.materialOverrides as Record<string, any>
      const partIds = ms.glbPartInfos.map((p: any) => p.partId) as string[]
      return {
        totalParts: partIds.length,
        overriddenCount: partIds.filter((id: string) => overrides[id] != null).length,
      }
    })
    expect(result.totalParts).toBeGreaterThan(0)
    expect(result.overriddenCount).toBe(result.totalParts)
  })

  test('part node context menu still has material edit option (regression)', async () => {
    const window = await electronApp.firstWindow()
    await window.waitForSelector('canvas', { timeout: 20000 })
    await ensureLeftPanelOpen(window)

    const boxB64 = BOX_BOSS_GLB.toString('base64')
    await loadModel(window, boxB64, 'box_boss.glb')

    const partNode = window.locator('[data-testid="scene-tree-part"]').first()
    await expect(partNode).toBeAttached({ timeout: 5000 })
    await partNode.click({ button: 'right' })

    const editItem = window.getByText('Edit Material')
    await expect(editItem).toBeVisible({ timeout: 3000 })
    await editItem.click()

    const closeBtn = window.locator('button[aria-label="close material editor"]')
    await expect(closeBtn).toBeVisible({ timeout: 5000 })
    await closeBtn.click()
  })

  test('part node title is "partName / fileName"', async () => {
    const window = await electronApp.firstWindow()
    await window.waitForSelector('canvas', { timeout: 20000 })
    await ensureLeftPanelOpen(window)

    const boxB64 = BOX_BOSS_GLB.toString('base64')
    await loadModel(window, boxB64, 'box_boss.glb')

    const partNode = window.locator('[data-testid="scene-tree-part"]').first()
    const partDisplayName = await partNode.textContent()
    expect(partDisplayName).toBeTruthy()

    await partNode.click({ button: 'right' })
    await window.getByText('Edit Material').click()

    const title = window.locator('button[aria-label="close material editor"]').locator('..').locator('span.text-xs')
    await expect(title).toBeVisible({ timeout: 5000 })
    const expected = `${partDisplayName} / box_boss.glb`
    await expect(title).toHaveText(expected)

    await window.locator('button[aria-label="close material editor"]').click()
  })

  test('file node title is file name only', async () => {
    const window = await electronApp.firstWindow()
    await window.waitForSelector('canvas', { timeout: 20000 })
    await ensureLeftPanelOpen(window)

    const boxB64 = BOX_BOSS_GLB.toString('base64')
    await loadModel(window, boxB64, 'box_boss.glb')

    const fileNode = window.locator('[data-testid="scene-tree-file"]').first()
    await fileNode.click({ button: 'right' })
    await window.getByRole('button', { name: '编辑材质' }).click()

    const title = window.locator('button[aria-label="close material editor"]').locator('..').locator('span.text-xs')
    await expect(title).toBeVisible({ timeout: 5000 })
    await expect(title).toHaveText('box_boss.glb')

    await window.locator('button[aria-label="close material editor"]').click()
  })

  test('toolbar button opens editor with all parts when no selection', async () => {
    const window = await electronApp.firstWindow()
    await window.waitForSelector('canvas', { timeout: 20000 })
    await ensureLeftPanelOpen(window)

    const boxB64 = BOX_BOSS_GLB.toString('base64')
    await loadModel(window, boxB64, 'box_boss.glb')

    // Click toolbar material button
    const materialBtn = window.locator('header button').filter({ has: window.locator('svg.text-pink-500') }).first()
    await materialBtn.click()

    const closeBtn = window.locator('button[aria-label="close material editor"]')
    await expect(closeBtn).toBeVisible({ timeout: 5000 })

    const partsInfo = await window.evaluate(() => {
      const ms = window.__modelStore!.getState() as any
      const matStore = window.__materialStore!.getState() as any
      return {
        totalParts: ms.glbPartInfos.length as number,
        editingKeys: matStore.editingOverrideKeys as string[],
      }
    })
    expect(partsInfo.editingKeys.length).toBe(partsInfo.totalParts)

    await closeBtn.click()
  })
})

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
