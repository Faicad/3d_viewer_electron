/**
 * E2E test for KHR_animation_pointer extension support.
 *
 * The model from Needle Cloud uses KHR_animation_pointer to animate
 * material properties (emissiveFactor, etc.) via JSON pointer paths
 * instead of standard T/R/S/weights node targets.
 *
 * Model also requires KHR_draco_mesh_compression — works in browser only.
 */
import { test, expect, _electron, ElectronApplication, Page } from '@playwright/test'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getElectronPath } from './utils'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const KHR_GLB = readFileSync(path.join(__dirname, 'fixtures', 'khr-animation-pointer.glb'))

async function waitForLoadDone(page: Page, timeout = 30000) {
  await page.waitForFunction(
    () => (window as any).__modelStore?.getState().__loadingPhase === 'done',
    { timeout },
  )
}

test.describe('KHR_animation_pointer', () => {
  let app: ElectronApplication

  test.beforeAll(async () => {
    app = await _electron.launch({
      executablePath: getElectronPath(),
      args: ['--no-sandbox', '--ozone-platform-hint=x11'],
      env: { ...process.env, E2E: '1' },
    })

    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.locator('canvas').first().waitFor({ state: 'attached', timeout: 20000 })
    await page.evaluate(() => { (window as any).__errors = [] })
  })

  test.afterAll(async () => {
    // Note: KHR model has known console.errors from texture loading + animation binding
    if (app) await app.close()
  })

  test('loads KHR_animation_pointer model and extracts material-target animations', async () => {
    const page = await app.firstWindow()

    await page.locator('input[type="file"]').setInputFiles({
      name: 'khr-animation-pointer.glb',
      mimeType: 'model/gltf-binary',
      buffer: KHR_GLB,
    })
    await waitForLoadDone(page)

    // Verify toolbar animation button is enabled — means animations were extracted
    const playBtn = page.locator('[data-testid="toolbar-animation-player"]')
    await expect(playBtn, 'KHR model should enable Play Animation button').toBeVisible({ timeout: 10000 })
    await expect(playBtn, 'KHR button should be enabled').toBeEnabled({ timeout: 5000 })

    // Verify animations are stored
    const animInfo = await page.evaluate(() => {
      const store = (window as any).__modelStore?.getState()
      const file = store?.loadedFiles?.[0]
      if (!file?.animations?.length) return null
      const anim = file.animations[0]
      return {
        clipCount: file.animations.length,
        trackCount: anim.tracks?.length,
        trackNames: anim.tracks?.map((t: any) => t.name),
        duration: anim.duration,
      }
    })
    expect(animInfo, 'Should have animation data').not.toBeNull()
    expect(animInfo!.clipCount).toBeGreaterThan(0)
    expect(animInfo!.trackCount).toBeGreaterThan(0)

    // KHR_animation_pointer tracks target material properties, not T/R/S
    const hasMaterialTrack = animInfo!.trackNames.some(
      (n: string) => n.includes('material') || n.includes('emissive') || n.includes('baseColor'),
    )
    expect(hasMaterialTrack, 'Should have material-targeted tracks').toBe(true)

    // sceneRoot must exist for AnimationMixer
    const hasSceneRoot = await page.evaluate(() => {
      return !!(window as any).__modelStore?.getState().loadedFiles?.[0]?.sceneRoot
    })
    expect(hasSceneRoot).toBe(true)
  })

  test('KHR_animation_pointer clips load into store with material property tracks', async () => {
    const page = await app.firstWindow()

    // Model already loaded in beforeAll test
    await page.locator('[data-testid="toolbar-animation-player"]').click()
    await page.locator('[role="dialog"]').waitFor({ state: 'visible', timeout: 5000 })
    await page.waitForTimeout(500)

    // Verify clips loaded into animation store
    const clipCount = await page.evaluate(() => {
      return (window as any).__animationStore?.getState().clips?.length ?? 0
    })
    expect(clipCount, 'Animation store should have KHR pointer clips').toBeGreaterThan(0)

    // Verify track names include material property paths (not T/R/S)
    const trackNames = await page.evaluate(() => {
      const clips = (window as any).__animationStore?.getState().clips ?? []
      return clips.flatMap((c: any) => c.tracks?.map((t: any) => t.name) ?? [])
    })
    const hasMaterialTrack = trackNames.some(
      (n: string) => n.includes('material') || n.includes('emissive') || n.includes('baseColor'),
    )
    expect(hasMaterialTrack, 'Tracks should target material properties').toBe(true)

    // Dialog should stay open and animation should play
    await expect(page.locator('[role="dialog"]'), 'Dialog should stay open').toBeVisible()

    // Clip name is inside a <select> dropdown option (hidden until expanded)
    const clipOption = page.locator('[role="dialog"] option').filter({ hasText: 'DragonMaterialAnim' })
    expect(await clipOption.count(), 'KHR clip should be in the dropdown').toBeGreaterThan(0)

    // After track filtering, animation should play (time advances)
    const t0 = await page.evaluate(() => {
      return (window as any).__animationStore?.getState().currentTime ?? 0
    })
    await page.waitForTimeout(2000)
    const t1 = await page.evaluate(() => {
      return (window as any).__animationStore?.getState().currentTime ?? 0
    })
    expect(t1, 'KHR animation time should advance after filtering bad tracks').toBeGreaterThan(t0)

    // Close dialog — use keyboard Escape
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)

    // Verify store is reset after close
    const clipsAfter = await page.evaluate(() => {
      return (window as any).__animationStore?.getState().clips?.length ?? -1
    })
    expect(clipsAfter).toBe(0)
  })
})
