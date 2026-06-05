import { test, expect, _electron, ElectronApplication, Page } from '@playwright/test'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getElectronLaunchArgs, getElectronPath, createUserDataDir, cleanupUserDataDir, killElectronApp } from './utils'
import { isSoftwareGpu } from './gpu-utils'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEST_BOX_GLB = readFileSync(path.join(__dirname, 'fixtures', 'test-box.glb'))
const BOX_BOSS_GLB = readFileSync(path.join(__dirname, 'fixtures', 'box_boss.glb'))

/**
 * BUG REPRO: when two GLB files are loaded, both assign the same unscoped
 * partId to their meshes (e.g. both have a mesh named "o1" → partId="o1").
 * Clicking one then selects/drags/highlights meshes from BOTH files.
 *
 * Fix: partId on rendered meshes must be scoped per file (e.g. "${fileId}:o1").
 */

async function waitForLoadDone(page: Page, timeout = 30000) {
  await page.waitForFunction(
    () => (window as any).__modelStore?.getState().__loadingPhase === 'done',
    { timeout },
  )
}

test.describe.serial('Multi-file Selection Isolation', () => {
  let app: ElectronApplication
  let page: Page
  let _userDataDir: string

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
    await page.locator('canvas').first().waitFor({ state: 'attached', timeout: 20000 })
    _isSwGpu = isSoftwareGpu()
    if (_isSwGpu) return

    await page.evaluate(() => {
      (window as any).__modelStore?.getState().reset()
      ;(window as any).__engineStore?.getState().setShowHeatbed(false)
    })
  })

  test.afterAll(async () => {
    if (app) {
      try { killElectronApp(app) } catch { /* ignore */ }
    }
    cleanupUserDataDir(_userDataDir)
  })

  let _isSwGpu = false

  async function loadGlbFile(buffer: Buffer, fileName: string) {
    const base64 = buffer.toString('base64')
    const fileId = await page.evaluate(({ b64, name }: { b64: string; name: string }) => {
      const binary = atob(b64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      const id = crypto.randomUUID()
      ;(window as any).__modelStore!.getState().addLoadedFile({
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
      return id
    }, { b64: base64, name: fileName })

    await page.waitForFunction((fid: string) => {
      const f = (window as any).__modelStore!.getState().loadedFiles.find((x: any) => x.id === fid)
      return f?.loadingPhase === 'done'
    }, fileId, { timeout: 30000 })

    return fileId
  }

  test('1. two GLB files load without errors', async () => {
    test.skip(_isSwGpu, 'Model loading may time out on software GPU')

    await loadGlbFile(TEST_BOX_GLB, 'test-box.glb')
    await loadGlbFile(BOX_BOSS_GLB, 'box_boss.glb')

    await waitForLoadDone(page)

    // Wait for camera auto-fit
    await page.waitForFunction(() => {
      const es = (window as any).__engineStore
      return es?.getState().__animActive === true
    }, { timeout: 5000 }).catch(() => {})
    await page.waitForFunction(() => {
      const es = (window as any).__engineStore
      return es?.getState().__animActive === false
    }, { timeout: 10000 }).catch(() => {})

    const fileCount = await page.evaluate(() =>
      (window as any).__modelStore!.getState().loadedFiles.length
    )
    expect(fileCount).toBe(2)
  })

  test('2. EVERY mesh must have a unique partId — no collisions across files', async () => {
    test.skip(_isSwGpu, 'Selection unavailable on software GPU')

    // Collect all meshes with their partIds from the 3D scene.
    // If the bug is present, meshes from different files share the
    // same partId (e.g. both have "o1" from GLTF node names).
    const meshPartIds = await page.evaluate(() => {
      const dev = (window as any).__r3f_dev as any
      if (!dev?.scene) return []
      const result: Array<{ partId: string }> = []
      dev.scene.traverse((obj: any) => {
        if (!obj.isMesh) return
        const pid = obj.userData?.partId as string | undefined
        if (pid) result.push({ partId: pid })
      })
      return result
    })

    console.log('[test] mesh partIds:', JSON.stringify(meshPartIds))

    const renderMeshes = meshPartIds.filter(
      (m: any) => m.partId !== '__default_stl_mesh__'
    )
    const uniquePartIds = new Set(renderMeshes.map((m: any) => m.partId))

    // CRITICAL: each mesh must have a unique partId.
    // If partIds collide, selecting one mesh in the viewport will also
    // highlight/drag/bounding-box meshes from other files.
    expect(
      uniquePartIds.size,
      `partId collision detected: ${renderMeshes.length} meshes but only ${uniquePartIds.size} unique partIds (${[...uniquePartIds].join(', ')})`
    ).toBe(renderMeshes.length)

    expect(renderMeshes.length).toBeGreaterThan(0)
  })

  test('3. clicking in viewport selects exactly one partId', async () => {
    test.skip(_isSwGpu, 'Selection unavailable on software GPU')

    await page.evaluate(() => {
      ;(window as any).__toolStore?.getState().setSelectionMode('object')
    })
    await page.waitForTimeout(200)

    const c = page.locator('canvas').first()
    const b = await c.boundingBox()
    expect(b).not.toBeNull()

    // Click center of canvas — should hit one of the loaded models
    await c.click({ position: { x: b!.width * 0.5, y: b!.height * 0.5 }, force: true })
    await page.waitForTimeout(400)

    const selectedIds: string[] = await page.evaluate(() => {
      const sel = (window as any).__selectionStore
      return sel?.getState().selectedReferenceIds?.slice() ?? []
    })
    console.log('[test] selectedIds:', JSON.stringify(selectedIds))

    // Only one ID should be selected
    expect(selectedIds.length).toBe(1)
  })

  test('4. drag only moves the selected mesh, not meshes from other files', async () => {
    test.skip(_isSwGpu, 'Selection unavailable on software GPU')

    const c = page.locator('canvas').first()
    const b = await c.boundingBox()
    expect(b).not.toBeNull()

    // Click center to select one mesh
    await c.click({ position: { x: b!.width * 0.5, y: b!.height * 0.5 }, force: true })
    await page.waitForTimeout(400)

    // Record positions of all render meshes BEFORE drag
    const beforePositions = await page.evaluate(() => {
      const dev = (window as any).__r3f_dev as any
      if (!dev?.scene) return []
      const result: Array<{ partId: string; x: number; y: number }> = []
      dev.scene.traverse((obj: any) => {
        if (!obj.isMesh || !obj.userData?.partId) return
        const pid = obj.userData.partId as string
        if (pid === '__default_stl_mesh__') return
        result.push({ partId: pid, x: obj.position.x, y: obj.position.y })
      })
      return result
    })

    console.log('[test] before positions:', JSON.stringify(beforePositions))

    // Perform a small drag
    const cx = b!.x + b!.width / 2
    const cy = b!.y + b!.height / 2
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx + 50, cy, { steps: 3 })
    await page.mouse.up()
    await page.waitForTimeout(300)

    // Record positions AFTER drag
    const afterPositions = await page.evaluate(() => {
      const dev = (window as any).__r3f_dev as any
      if (!dev?.scene) return []
      const result: Array<{ partId: string; x: number; y: number }> = []
      dev.scene.traverse((obj: any) => {
        if (!obj.isMesh || !obj.userData?.partId) return
        const pid = obj.userData.partId as string
        if (pid === '__default_stl_mesh__') return
        result.push({ partId: pid, x: obj.position.x, y: obj.position.y })
      })
      return result
    })

    console.log('[test] after positions:', JSON.stringify(afterPositions))

    const selectedIds: string[] = await page.evaluate(() => {
      const sel = (window as any).__selectionStore
      return sel?.getState().selectedReferenceIds?.slice() ?? []
    })

    // Count how many meshes moved
    let movedCount = 0
    let selectedMoved = false
    let nonSelectedMoved = false
    for (let i = 0; i < beforePositions.length; i++) {
      const before = beforePositions[i]
      const after = afterPositions[i]
      if (before.x !== after.x || before.y !== after.y) {
        movedCount++
        if (selectedIds.includes(before.partId)) {
          selectedMoved = true
        } else {
          nonSelectedMoved = true
        }
      }
    }

    console.log('[test] movedCount:', movedCount, 'selectedMoved:', selectedMoved, 'nonSelectedMoved:', nonSelectedMoved)

    // CRITICAL: the selected mesh should have moved
    expect(selectedMoved).toBe(true)
    // CRITICAL: non-selected meshes should NOT have moved (this fails with the bug)
    expect(nonSelectedMoved).toBe(false)
  })
})
