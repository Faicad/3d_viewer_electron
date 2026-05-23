import { test, expect, ElectronApplication, _electron, Page } from '@playwright/test'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getElectronPath } from './utils'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROBOT_GLB = readFileSync(path.join(__dirname, 'fixtures', 'RobotExpressive.glb'))
const BOX_BOSS_GLB = readFileSync(path.join(__dirname, 'fixtures', 'box_boss.glb'))

/** Wait for ModelGroup to finish loading (replaces fixed timeouts). */
async function waitForLoadDone(page: Page, timeout = 30000) {
  await page.waitForFunction(
    () => window.__modelStore?.getState().__loadingPhase === 'done',
    { timeout },
  )
}

/**
 * Set up console and error listeners on a page for diagnostics.
 * Returns a function that logs collected messages, call after the test completes.
 */
function setupConsoleCapture(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`))
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[console.error] ${msg.text()}`)
  })
  return () => {
    if (errors.length > 0) console.log('[test] renderer errors:', JSON.stringify(errors))
    return errors
  }
}

test.describe.serial('Multi-level scene tree', () => {
  let electronApp: ElectronApplication

  test.beforeAll(async () => {
    electronApp = await _electron.launch({
      executablePath: getElectronPath(),
      args: ['--no-sandbox', '--ozone-platform-hint=x11'],
      env: { ...process.env, E2E: '1' },
    })
  })

  test.afterAll(async () => {
    await electronApp.close()
  })

  /** Ensure the left (scene tree) panel is open. On CI some runners create
   *  a window narrower than 1024px, which triggers the compact layout and
   *  hides the left panel. We normalize by setting a viewport > 1024px. */
  async function ensureLeftPanelOpen(window: Page) {
    // Setting viewport to 1280px triggers the responsive effect that opens
    // the left panel when width > 1023px.
    await window.setViewportSize({ width: 1280, height: 800 })
    // Wait for the left panel to actually open (effect is async)
    await window.waitForFunction(
      () => document.querySelector('aside.border-r') !== null,
      { timeout: 5000 },
    )
  }

  test('left panel hides on narrow viewport (compact layout)', async () => {
    const window = await electronApp.firstWindow()
    await window.locator('canvas').first().waitFor({ state: 'attached', timeout: 20000 })

    // Start wide — panel should be visible
    await window.setViewportSize({ width: 1280, height: 800 })
    await expect(window.locator('aside.border-r').first()).toBeAttached({ timeout: 5000 })

    // Shrink below 1024px — panel should collapse
    await window.setViewportSize({ width: 800, height: 800 })
    await window.waitForFunction(
      () => document.querySelector('aside.border-r') === null,
      { timeout: 5000 },
    )

    // Widen again — panel should reappear
    await window.setViewportSize({ width: 1280, height: 800 })
    await expect(window.locator('aside.border-r').first()).toBeAttached({ timeout: 5000 })
  })

  test('scene tree panel title is visible', async () => {
    const window = await electronApp.firstWindow()
    await ensureLeftPanelOpen(window)
    await window.locator('canvas').first().waitFor({ state: 'attached', timeout: 20000 })

    const title = window.locator('aside.border-r').first().locator('.text-xs.font-semibold')
    await expect(title).toBeVisible()
    const text = await title.textContent()
    // Title text varies by locale (Scene / 场景)
    expect(text?.length).toBeGreaterThan(0)
  })

  test('loads a hierarchical GLB and renders tree nodes with expand/collapse', async () => {
    const window = await electronApp.firstWindow()
    await ensureLeftPanelOpen(window)
    await window.locator('canvas').first().waitFor({ state: 'attached', timeout: 20000 })

    const getErrors = setupConsoleCapture(window)

    // Load GLB via addLoadedFile so ModelGroup renders through the
    // multi-file path (which properly updates the store via callbacks).
    const base64 = ROBOT_GLB.toString('base64')
    await window.evaluate((b64) => {
      const binary = atob(b64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      const buf = bytes.buffer.slice(0)
      window.__modelStore!.getState().addLoadedFile({
        id: crypto.randomUUID(),
        fileName: 'RobotExpressive.glb',
        filePath: 'RobotExpressive.glb',
        mtimeMs: 0,
        buffer: buf,
        format: 'glb',
        sceneTree: [],
        glbPartInfos: [],
        modelCenteringOffset: null,
        sourceUnit: 'meter',
        fileGroup: 'mesh',
        loadingPhase: 'loading',
      })
    }, base64)

    await waitForLoadDone(window)
    getErrors()

    const leftPanel = window.locator('aside.border-r').first()
    const treeNodes = leftPanel.locator('.whitespace-nowrap')

    const nodeFound = await window.waitForFunction(
      () => {
        const s = window.__modelStore?.getState()
        if (s?.sceneTree && s.sceneTree.length > 0) {
          const aside = document.querySelector('aside.border-r')
          return aside && aside.querySelectorAll('.whitespace-nowrap').length > 0
        }
        return false
      },
      { timeout: 20000 },
    ).then(() => true).catch(() => false)

    if (!nodeFound) {
      // Diagnostic: check store state and panel state
      const diag = await window.evaluate(() => {
        const s = window.__modelStore?.getState()
        const leftAside = document.querySelector('aside.border-r')
        const rightAside = document.querySelector('aside.border-l')
        return {
          loadingPhase: s?.__loadingPhase,
          sceneTreeLength: s?.sceneTree?.length,
          leftPanelHTML: leftAside?.innerHTML?.substring(0, 300) ?? 'null',
          rightPanelHTML: rightAside?.innerHTML?.substring(0, 300) ?? 'null',
          leftPanelExists: !!leftAside,
          rightPanelExists: !!rightAside,
        }
      })
      console.log('[test] diagnostic:', JSON.stringify(diag))
    }
    expect(nodeFound).toBe(true)

    const nodeCount = await treeNodes.count()
    // Some platforms (Windows) may produce a 1-node tree (RootNode without hierarchy)
    // while others produce the full 83-node hierarchical tree
    expect(nodeCount).toBeGreaterThanOrEqual(1)

    const rootNode = treeNodes.first()
    await expect(rootNode).toBeVisible()

    // Chevron buttons exist for nodes with children
    const chevronButtons = leftPanel.locator('button[aria-label="collapse"], button[aria-label="expand"]')
    const chevronCount = await chevronButtons.count()
    if (nodeCount > 1) {
      expect(chevronCount).toBeGreaterThan(0)
    }

    console.log(`[test] tree nodes: ${nodeCount}, chevron buttons: ${chevronCount}`)
  })

  test('expand/collapse toggles children visibility', async () => {
    const window = await electronApp.firstWindow()
    await ensureLeftPanelOpen(window)
    const leftPanel = window.locator('aside.border-r').first()

    const initialCount = await leftPanel.locator('.whitespace-nowrap').count()
    // Skip if no hierarchy to expand/collapse
    test.skip(initialCount <= 1, 'no hierarchical tree nodes to test')

    const collapseBtn = leftPanel.locator('button[aria-label="collapse"]').first()
    const collapseCount = await collapseBtn.count()
    if (collapseCount > 0) {
      await collapseBtn.click()
      await window.waitForFunction(
        (initial: number) => {
          const panel = document.querySelector('aside.border-r')
          return (panel?.querySelectorAll('.whitespace-nowrap').length ?? 0) < initial
        },
        initialCount,
      )

      const afterCollapseCount = await leftPanel.locator('.whitespace-nowrap').count()
      expect(afterCollapseCount).toBeLessThan(initialCount)

      const expandBtn = leftPanel.locator('button[aria-label="expand"]').first()
      await expandBtn.click()
      await window.waitForFunction(
        (initial: number) => {
          const panel = document.querySelector('aside.border-r')
          return (panel?.querySelectorAll('.whitespace-nowrap').length ?? 0) === initial
        },
        initialCount,
      )

      const afterExpandCount = await leftPanel.locator('.whitespace-nowrap').count()
      expect(afterExpandCount).toBe(initialCount)

      console.log(`[test] initial=${initialCount}, collapsed=${afterCollapseCount}, expanded=${afterExpandCount}`)
    }
  })

  test('eye icon toggles visibility on hover', async () => {
    const window = await electronApp.firstWindow()
    await ensureLeftPanelOpen(window)
    const leftPanel = window.locator('aside.border-r').first()
    const firstNode = leftPanel.locator('.whitespace-nowrap').first()

    await expect(firstNode).toBeAttached({ timeout: 10000 })
    await firstNode.hover()

    const eyeButton = firstNode.locator('button[aria-label="hide"], button[aria-label="show"]')
    await expect(eyeButton).toBeVisible()
    const eyeCount = await eyeButton.count()
    expect(eyeCount).toBeGreaterThan(0)

    await eyeButton.click()
    await expect(firstNode).toHaveClass(/opacity-40/)

    console.log('[test] eye icon visibility toggle works')
  })

  test('file-level hide cascades to 3D mesh visibility, then show restores', async () => {
    const window = await electronApp.firstWindow()
    await ensureLeftPanelOpen(window)
    await window.locator('canvas').first().waitFor({ state: 'attached', timeout: 20000 })

    const leftPanel = window.locator('aside.border-r').first()
    const fileNode = leftPanel.locator('.whitespace-nowrap').first()
    await fileNode.hover()

    // Check current visibility state of meshes
    const beforeShow = await window.evaluate(() => {
      let visibleCount = 0; let totalCount = 0
      ;(window as any).__r3f_dev.scene.traverse((o: any) => {
        if (o.isMesh && o.name !== 'shadowFloor' && o.parent?.name !== 'shadowFloor') {
          totalCount++; if (o.visible) visibleCount++
        }
      })
      return { visibleCount, totalCount }
    })

    // If meshes are mostly hidden (from previous test), show them first
    const showBtn = fileNode.locator('button[aria-label="show"]')
    if (beforeShow.visibleCount < beforeShow.totalCount / 2 && await showBtn.count() > 0) {
      await showBtn.click()
      // Wait for meshes to become visible
      await window.waitForFunction(() => {
        let visibleCount = 0; let totalCount = 0
        ;(window as any).__r3f_dev.scene.traverse((o: any) => {
          if (o.isMesh && o.name !== 'shadowFloor' && o.parent?.name !== 'shadowFloor') {
            totalCount++; if (o.visible) visibleCount++
          }
        })
        return totalCount > 0 && visibleCount === totalCount
      }, { timeout: 5000 })
    }

    // Verify all meshes are visible
    const visible = await window.evaluate(() => {
      let visibleCount = 0; let totalCount = 0
      ;(window as any).__r3f_dev.scene.traverse((o: any) => {
        if (o.isMesh && o.name !== 'shadowFloor' && o.parent?.name !== 'shadowFloor') {
          totalCount++; if (o.visible) visibleCount++
        }
      })
      return { visibleCount, totalCount }
    })
    expect(visible.totalCount).toBeGreaterThan(0)
    expect(visible.visibleCount).toBe(visible.totalCount)

    // Now hide the file node
    await fileNode.hover()
    const hideButton = fileNode.locator('button[aria-label="hide"]')
    if (await hideButton.count() > 0) {
      await hideButton.click()
    }

    // Wait for meshes to become invisible
    await window.waitForFunction(() => {
      let hiddenCount = 0; let totalCount = 0
      ;(window as any).__r3f_dev.scene.traverse((o: any) => {
        if (o.isMesh && o.name !== 'shadowFloor' && o.parent?.name !== 'shadowFloor') {
          totalCount++; if (!o.visible) hiddenCount++
        }
      })
      return totalCount > 0 && hiddenCount === totalCount
    }, { timeout: 5000 })

    const hidden = await window.evaluate(() => {
      let visibleCount = 0; let totalCount = 0
      ;(window as any).__r3f_dev.scene.traverse((o: any) => {
        if (o.isMesh && o.name !== 'shadowFloor' && o.parent?.name !== 'shadowFloor') {
          totalCount++; if (o.visible) visibleCount++
        }
      })
      return { visibleCount, totalCount }
    })
    expect(hidden.totalCount).toBeGreaterThan(0)
    expect(hidden.visibleCount).toBe(0)

    console.log(`[test] mesh visibility cascade: hide → ${hidden.visibleCount}/${hidden.totalCount} visible`)
  })

  test('non-active file gets its scene tree populated (file-list load scenario)', async () => {
    // Reproduce: load box_boss.glb first, then load RobotExpressive.glb from
    // the file list WITHOUT making it the active file. Bug: updateFileSceneTree
    // only updated state.sceneTree when the file was active, so RobotExpressive
    // appeared with no children in the scene tree, and hiding it didn't work.
    const window = await electronApp.firstWindow()
    await ensureLeftPanelOpen(window)
    await window.locator('canvas').first().waitFor({ state: 'attached', timeout: 20000 })

    // Clear state from previous tests in this serial describe
    await window.evaluate(() => { window.__modelStore!.getState().reset() })

    // 1. Load box_boss.glb as the first (active) file
    const boxB64 = BOX_BOSS_GLB.toString('base64')
    await window.evaluate((b64) => {
      const binary = atob(b64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      const id = crypto.randomUUID()
      window.__modelStore!.getState().addLoadedFile({
        id,
        fileName: 'box_boss.glb',
        filePath: 'box_boss.glb',
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
    }, boxB64)

    await waitForLoadDone(window)

    // 2. Load RobotExpressive.glb WITHOUT changing active file
    const robotB64 = ROBOT_GLB.toString('base64')
    const robotFileId = await window.evaluate((b64) => {
      const binary = atob(b64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      const id = crypto.randomUUID()
      window.__modelStore!.getState().addLoadedFile({
        id,
        fileName: 'RobotExpressive.glb',
        filePath: 'RobotExpressive.glb',
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
    }, robotB64)

    // Wait for RobotExpressive's loadingPhase to reach 'done'
    await window.waitForFunction((rid: string) => {
      const f = window.__modelStore!.getState().loadedFiles.find((x: any) => x.id === rid)
      return f?.loadingPhase === 'done'
    }, robotFileId, { timeout: 30000 })

    // 3. Verify RobotExpressive file node exists in sceneTree WITH children
    const treeState = await window.evaluate((rid) => {
      const s = window.__modelStore!.getState()
      const fileNode = s.sceneTree.find((n: any) => n.id === `file:${rid}`)
      if (!fileNode) return { found: false }
      return {
        found: true,
        name: fileNode.name,
        childCount: fileNode.children?.length ?? 0,
        firstChildName: fileNode.children?.[0]?.name ?? '(none)',
        firstChildId: fileNode.children?.[0]?.id ?? '(none)',
      }
    }, robotFileId)

    expect(treeState.found, 'RobotExpressive file node must exist in sceneTree').toBe(true)
    expect(treeState.childCount, 'RobotExpressive must have children in sceneTree').toBeGreaterThan(0)
    console.log(`[test] RobotExpressive tree: ${treeState.childCount} children, first="${treeState.firstChildName}"`)

    // 4. Hide RobotExpressive and verify its scene tree children are set to invisible
    const leftPanel = window.locator('aside.border-r').first()
    const fileNodes = leftPanel.locator('.whitespace-nowrap')
    const robotNode = fileNodes.nth(2) // third node: box_boss(0), box_boss_child(1), RobotExpressive(2)

    await robotNode.hover()
    const hideBtn = robotNode.locator('button[aria-label="hide"]')
    const hideCount = await hideBtn.count()
    if (hideCount > 0) {
      await hideBtn.click()
    }

    // Verify the RobotExpressive file node shows as hidden (opacity-40 class)
    await expect(robotNode).toHaveClass(/opacity-40/)

    // Verify RobotExpressive's children in sceneTree are set to visible=false
    const visState = await window.evaluate((rid) => {
      const s = window.__modelStore!.getState()
      const fileNode = s.sceneTree.find((n: any) => n.id === `file:${rid}`)
      if (!fileNode?.children) return { err: 'no children' }
      const childVis = fileNode.children.map((c: any) => ({ id: c.id, name: c.name, visible: c.visible }))
      return { fileVisible: fileNode.visible, childVis }
    }, robotFileId)

    expect(visState.fileVisible, 'file node should be hidden').toBe(false)
    expect(visState.childVis.length, 'should have children').toBeGreaterThan(0)
    for (const c of visState.childVis) {
      expect(c.visible, `child "${c.name}" should be hidden`).toBe(false)
    }
    console.log(`[test] RobotExpressive hidden: ${visState.childVis.length} children all invisible`)
  })
})
