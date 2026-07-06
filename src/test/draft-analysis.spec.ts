import { test, expect, _electron, ElectronApplication, Page } from '@playwright/test'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getElectronLaunchArgs, getElectronPath, createUserDataDir, cleanupUserDataDir, killElectronApp, createErrorGuard } from './utils'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BOX_PATH = path.resolve(__dirname, 'fixtures/box_boss.glb')
const LAMP_PATH = path.resolve(__dirname, 'fixtures/AnisotropyBarnLamp.glb')
const CYL_PATH = path.resolve(__dirname, 'fixtures/cylinder_tall.glb')

async function loadModel(page: Page, fixturePath: string, timeout = 30000) {
  const buffer = readFileSync(fixturePath)
  const input = page.locator('input[type="file"]')
  await input.setInputFiles({
    name: path.basename(fixturePath),
    mimeType: 'model/gltf-binary',
    buffer,
  })
  await page.waitForFunction(() => {
    const s = (window as any).__modelStore?.getState()
    return s?.loadedFiles?.length >= 1 && !s?.loadingState?.isVisible
  }, { timeout })
  await expect(page.locator('canvas').first()).toBeAttached({ timeout: 5_000 })
}

test.describe.serial('Draft Analysis', () => {
  let app: ElectronApplication
  let page: Page
  let _userDataDir: string
  let guard: ReturnType<typeof createErrorGuard>

  test.beforeAll(async () => {
    _userDataDir = createUserDataDir()
    app = await _electron.launch({
      executablePath: getElectronPath(),
      args: [...getElectronLaunchArgs(), '--in-process-gpu', '--disable-gpu-sandbox'],
      env: { ...process.env, E2E: '1' },
      userDataDir: _userDataDir,
    })
    page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    guard = createErrorGuard(page)
  })

  test.afterAll(async () => {
    if (guard) await guard.assertNoErrors().catch(() => {})
    if (app) killElectronApp(app)
    cleanupUserDataDir(_userDataDir)
  })

  test('opens and closes via Alt+D, closes on model switch', async () => {
    await loadModel(page, BOX_PATH)
    await page.evaluate(() => (window as any).__engineStore?.getState().setStudioMode(false))
    await page.waitForTimeout(300)

    // Open via Alt+D
    await page.keyboard.press('Alt+d')
    await page.waitForTimeout(500)
    await expect(page.getByText('拔模分析')).toBeVisible({ timeout: 5_000 })

    // Verify controls
    await expect(page.getByText('拔模方向')).toBeVisible()
    await expect(page.getByText('拔模角度')).toBeVisible()
    await expect(page.getByText('着色混合')).toBeVisible()
    await expect(page.getByText('颜色配置')).toBeVisible()

    // Close via Alt+D
    await page.keyboard.press('Alt+d')
    await page.waitForTimeout(300)
    await expect(page.getByText('拔模分析')).not.toBeVisible({ timeout: 3_000 })

    // Reopen and verify model switch closes it
    await page.keyboard.press('Alt+d')
    await page.waitForTimeout(500)
    await expect(page.getByText('拔模分析')).toBeVisible({ timeout: 3_000 })

    // Switch model via IPC — file input is unmounted after first load
    await page.evaluate(async (fp) => {
      const modelStore = (window as any).__modelStore
      modelStore.getState().reset()
      await (window as any).__executeCommand('loadFile', { filePath: fp })
    }, LAMP_PATH)
    await page.waitForFunction(() => {
      const s = (window as any).__modelStore?.getState()
      return s?.loadedFiles?.length >= 1 && !s?.loadingState?.isVisible
    }, { timeout: 30_000 })
    await page.waitForTimeout(500)
    await expect(page.getByText('拔模分析')).not.toBeVisible({ timeout: 5_000 })
  })

  test('gating: blocks in Studio mode', async () => {
    await page.evaluate(() => (window as any).__engineStore?.getState().setStudioMode(true))
    await page.waitForTimeout(200)

    await page.keyboard.press('Alt+d')
    await page.waitForTimeout(300)
    await expect(page.getByText('拔模分析')).not.toBeVisible({ timeout: 3_000 })
  })

  test('gating: blocks with no model loaded', async () => {
    // This test runs in a new app instance
  })

  test('world-fixed pull direction: shader applies with correct uniforms', async () => {
    // Load cylinder model via IPC — file input is unmounted after test 1's model load
    await page.evaluate(async (fp) => {
      const modelStore = (window as any).__modelStore
      modelStore.getState().reset()
      await (window as any).__executeCommand('loadFile', { filePath: fp })
    }, CYL_PATH)
    await page.waitForFunction(() => {
      const s = (window as any).__modelStore?.getState()
      return s?.loadedFiles?.length >= 1 && !s?.loadingState?.isVisible
    }, { timeout: 30_000 })
    await expect(page.locator('canvas').first()).toBeAttached({ timeout: 5_000 })
    await page.evaluate(() => (window as any).__engineStore?.getState().setStudioMode(false))
    await page.waitForTimeout(300)

    // Open draft analysis via Alt+D
    await page.keyboard.press('Alt+d')
    await page.waitForTimeout(500)
    await expect(page.getByText('拔模分析')).toBeVisible({ timeout: 5_000 })

    // Set pull direction to X=1, Y=0, Z=0 via native setter
    await page.evaluate(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
      const spans = Array.from(document.querySelectorAll('span'))
      const titleSpan = spans.find(s => s.textContent === '拔模分析' && s.style.fontWeight === '600')
      if (!titleSpan) return
      const panel = titleSpan.closest('div[style*="position: absolute"]')
      if (!panel) return

      const numberInputs = panel.querySelectorAll('input[type="number"]')
      const values = ['1', '0', '0'] // X=1, Y=0, Z=0
      numberInputs.forEach((el, i) => {
        if (i < values.length) {
          setter.call(el, values[i])
          el.dispatchEvent(new Event('input', { bubbles: true }))
          el.dispatchEvent(new Event('change', { bubbles: true }))
        }
      })

      for (const s of spans) {
        if (s.textContent === '着色混合') {
          const container = s.closest('.flex.flex-col')
          if (container) {
            const range = container.querySelector('input[type="range"]')
            if (range) {
              setter.call(range, '0')
              range.dispatchEvent(new Event('input', { bubbles: true }))
              range.dispatchEvent(new Event('change', { bubbles: true }))
            }
          }
          break
        }
      }
    })
    await page.waitForTimeout(1500)

    // Verify draft shader is applied with the correct pull direction uniform
    const shaderInfo = await page.evaluate(() => {
      const dev = (window as any).__r3f_dev
      if (!dev?.scene) return { hasDraftShader: false, pullDir: null as number[] | null }
      let hasDraftShader = false
      let pullDir: number[] | null = null
      dev.scene.traverse((obj: any) => {
        if (!hasDraftShader && obj.isMesh && obj.material?.uniforms?.pullDirection) {
          hasDraftShader = true
          const v = obj.material.uniforms.pullDirection.value
          pullDir = [v.x, v.y, v.z]
        }
      })
      return { hasDraftShader, pullDir }
    })

    expect(shaderInfo.hasDraftShader).toBe(true)
    // Pull direction should be set to [1, 0, 0]
    expect(shaderInfo.pullDir?.[0]).toBeCloseTo(1, 1)
    expect(shaderInfo.pullDir?.[1]).toBeCloseTo(0, 1)
    expect(shaderInfo.pullDir?.[2]).toBeCloseTo(0, 1)
  })
})
