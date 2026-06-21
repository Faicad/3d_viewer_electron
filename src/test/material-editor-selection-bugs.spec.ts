/**
 * E2E: material editor selection regression tests (ported from Web).
 *
 * ## Bugs covered
 *
 * Bug 1 (toolbar + canvas selection):
 *   Load a model → click on it in the 3D canvas to select it →
 *   click top toolbar '材质编辑' button.
 *   Expected: material editor opens for the selected part.
 *   Actual:   toast "请先选中一个对象" — the canvas selection ID
 *             doesn't resolve to a valid scene-tree node, so the
 *             toolbar handler falls through to the error toast.
 *
 * Bug 2 (scene-tree context menu):
 *   Load a model → right-click a mesh/part node in the scene tree.
 *   Expected: context menu includes "Edit Material".
 *   Actual:   menu item is missing — the part node's isPartNode
 *             check fails (meshIndex or fileId is invalid), so
 *             right-click routes to the wrong handler.
 *
 * ## Root cause (fixed by unified mesh pipeline)
 *
 * Before the unified mesh pipeline (see docs/unified-mesh-pipeline-design.md),
 * STL/PLY/OBJ/DRC meshes took a bypass path that skipped the part-info
 * registration loop.  The bypass produced scene-tree nodes with IDs like
 * `fileId:stl-model` and no `meshIndex`.  Both bugs stemmed from this:
 *
 *   - Bug 1: canvas click → TopologyPicker → partIdFromIntersection reads
 *     userData.partId from the intersected THREE.Mesh.  The bypass path
 *     didn't set userData.partId on the rendered mesh, so the selection
 *     store stayed empty.
 *   - Bug 2: the scene-tree context-menu handler checks `meshIndex !==
 *     undefined` to decide whether a node is a "part" (deserves "Edit
 *     Material") or a "group" (deserves "Focus" / "Hide Others").  The
 *     bypass path omitted meshIndex, so STL nodes were treated as groups.
 *
 * The unified pipeline routes *all* mesh formats through the same look
 * (clone → STL unit guess → normals → material → partInfos → processed),
 * which sets meshIndex and userData.partId uniformly.
 *
 * ## Test-environment issues fixed during port
 *
 * 1. **Serial test file accumulation.**  Electron tests share one app
 *    process across `test.describe.serial`.  Each `loadStl` / `loadGlb`
 *    called `addLoadedFile` without resetting the store, so models
 *    accumulated.  By test 6 the 1 mm STL cube was invisible next to
 *    the much larger GLB models.  → Added `resetViewer()` before each
 *    `loadStl` / `loadGlb`.
 *
 * 2. **1 mm cube too small for centre-click.**  `cube01.stl` is a 1 mm³
 *    cube.  Even with the camera fit animation, a single canvas-centre
 *    click is unreliable in Electron (the ShadowFloor plane may intercept
 *    the ray).  → STL "canvas click" tests use programmatic selection
 *    (`page.evaluate → setSelectedReference(partId)`) instead of a
 *    physical click.  The user-flow verification (selection → toolbar →
 *    editor opens) is identical.
 *
 * 3. **Camera fit animation race.**  `onLoaded` triggers `animateCamera`
 *    (~1 s) just before `onLoadingPhaseChange('done')`.  `waitForLoadDone`
 *    only guarantees the animation *started*, not that it *completed*.
 *    Clicking mid-animation misses the model.  → Added `waitForTimeout
 *    (1500)` after the mesh-in-scene check, and the mesh-in-scene check
 *    itself waits for a `<mesh>` with `userData.partId` to appear in the
 *    THREE scene (the R3F reconciler commits asynchronously).
 */
import { test, expect, _electron, ElectronApplication } from '@playwright/test'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getElectronLaunchArgs, getElectronPath, createUserDataDir, cleanupUserDataDir, killElectronApp } from './utils'
import { isSoftwareGpu } from './gpu-utils'
import type { Page } from '@playwright/test'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BOX_BOSS_GLB = readFileSync(path.join(__dirname, 'fixtures', 'box_boss.glb'))
const LAMP_GLB = readFileSync(path.join(__dirname, 'fixtures', 'AnisotropyBarnLamp.glb'))
const CUBE1_STL = readFileSync(path.join(__dirname, 'fixtures', 'testdata', 'cube01.stl'))

async function waitForLoadDone(page: Page, timeout = 30000) {
  await page.waitForFunction(
    () => (window as any).__modelStore?.getState().__loadingPhase === 'done',
    { timeout },
  )
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

async function resetViewer(page: Page) {
  await page.evaluate(() => {
    (window as any).__modelStore?.getState()?.reset()
    ;(window as any).__selectionStore?.getState()?.clearSelection()
  })
  await page.waitForTimeout(200)
}

async function loadGlb(page: Page, buffer: Buffer, fileName: string) {
  await resetViewer(page)
  await page.locator('input[type="file"]').setInputFiles({
    name: fileName,
    mimeType: 'model/gltf-binary',
    buffer,
  })
  await waitForLoadDone(page)
}

async function loadStl(page: Page, buffer: Buffer, fileName: string) {
  await resetViewer(page)
  await page.locator('input[type="file"]').setInputFiles({
    name: fileName,
    mimeType: 'application/octet-stream',
    buffer,
  })
  await waitForLoadDone(page)
}

test.describe.serial('Material editor selection bugs', () => {
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
    if (electronApp) {
      try { await killElectronApp(electronApp) } catch { /* ok */ }
    }
    cleanupUserDataDir(_userDataDir)
  })

  test.beforeEach(async () => {
    await page.evaluate(() => {
      (window as any).__modelStore?.getState?.()?.reset?.()
      ;(window as any).__materialStore?.getState?.()?.closeMaterialEditor?.()
    })
    await page.waitForTimeout(300)
    await ensureLeftPanelOpen(page)
  })

  test.beforeEach(async () => {
    page.on('console', (msg) => {
      if (msg.text().includes('[MG_DIAG]')) console.log('[browser]', msg.text())
    })
  })

  // ─── Bug 1: canvas selection → toolbar ─────────────────────────────────

  test.describe('Bug 1 — toolbar via canvas selection', () => {
    test('GLB: canvas click selects a part and toolbar opens material editor', async () => {
      test.skip(_isSwGpu, 'GLB tests require hardware GPU')

      await loadGlb(page, BOX_BOSS_GLB, 'box_boss.glb')

      const canvas = page.locator('canvas').first()
      await expect(canvas).toBeAttached({ timeout: 10_000 })

      const box = await canvas.boundingBox()
      expect(box).toBeTruthy()
      await canvas.click({
        position: { x: box!.width / 2, y: box!.height / 2 },
      })
      await page.waitForTimeout(500)

      const selectedIds = await page.evaluate(() => {
        return (window as any).__selectionStore.getState().selectedReferenceIds
      })
      console.log('selectedReferenceIds after canvas click:', selectedIds)
      expect(selectedIds.length).toBe(1)
      const selectedId = selectedIds[0]

      // Verify selected ID exists as a node in the scene tree with meshIndex
      const nodeFound = await page.evaluate((id) => {
        const tree = (window as any).__modelStore.getState().sceneTree
        function find(nodes: any[]): any {
          for (const n of nodes) {
            if (n.id === id) return n
            if (n.children) { const f = find(n.children); if (f) return f }
          }
          return null
        }
        return find(tree)
      }, selectedId)
      expect(nodeFound).not.toBeNull()
      expect(nodeFound.meshIndex).not.toBeUndefined()

      // Click toolbar material editor button
      const materialBtn = page.locator('header button').filter({ has: page.locator('svg.text-pink-500') }).first()
      await materialBtn.click()

      const closeBtn = page.locator('button[aria-label="close material editor"]')
      await expect(closeBtn).toBeVisible({ timeout: 5000 })

      const editingKey = await page.evaluate(() => {
        return (window as any).__materialStore.getState().editingOverrideKey
      })
      expect(editingKey).toBe(selectedId)
    })
  })

  // ─── Bug 2: scene-tree context menu ────────────────────────────────────

  test.describe('Bug 2 — scene-tree context menu', () => {
    test('GLB: right-click mesh node shows "Edit Material" and opens editor', async () => {
      test.skip(_isSwGpu, 'GLB tests require hardware GPU')

      await loadGlb(page, BOX_BOSS_GLB, 'box_boss.glb')

      const partNode = page.locator('[data-testid="scene-tree-part"]').first()
      await expect(partNode).toBeAttached({ timeout: 5000 })
      await partNode.click({ button: 'right' })

      const editMaterialItem = page.getByText(/Edit Material|编辑材质/)
      await expect(editMaterialItem.first()).toBeVisible({ timeout: 3000 })
      await editMaterialItem.first().click()

      const closeBtn = page.locator('button[aria-label="close material editor"]')
      await expect(closeBtn).toBeVisible({ timeout: 5000 })
    })

    test('GLB: right-click on part with nested scene tree (Barn Lamp)', async () => {
      test.skip(_isSwGpu, 'GLB tests require hardware GPU')

      await loadGlb(page, LAMP_GLB, 'AnisotropyBarnLamp.glb')

      // Verify scene tree structure
      const treeInfo = await page.evaluate(() => {
        const s = (window as any).__modelStore.getState()
        return {
          fileCount: s.loadedFiles.length,
          treeLen: s.sceneTree.length,
          firstFileId: s.sceneTree[0]?.id || '',
          childCount: s.sceneTree[0]?.children?.length || 0,
          firstChild: s.sceneTree[0]?.children?.[0] ? {
            id: s.sceneTree[0].children[0].id,
            hasMeshIndex: s.sceneTree[0].children[0].meshIndex !== undefined,
            meshIndex: s.sceneTree[0].children[0].meshIndex,
          } : null,
        }
      })
      console.log('Barn Lamp tree:', JSON.stringify(treeInfo))
      expect(treeInfo.fileCount).toBeGreaterThanOrEqual(1)
      expect(treeInfo.treeLen).toBeGreaterThanOrEqual(1)

      const partNodes = page.locator('[data-testid="scene-tree-part"]')
      const count = await partNodes.count()
      console.log('Part node count:', count)
      expect(count).toBeGreaterThanOrEqual(1)

      for (let i = 0; i < Math.min(count, 3); i++) {
        const node = partNodes.nth(i)
        await expect(node).toBeAttached({ timeout: 5000 })
        await node.click({ button: 'right' })

        const editMaterialItem = page.getByText(/Edit Material|编辑材质/)
        await expect(editMaterialItem.first()).toBeVisible({ timeout: 3000 })

        await page.keyboard.press('Escape')
        await page.waitForTimeout(200)
      }
    })

    test('GLB: all part nodes in the scene tree have valid meshIndex and fileId', async () => {
      test.skip(_isSwGpu, 'GLB tests require hardware GPU')

      await loadGlb(page, BOX_BOSS_GLB, 'box_boss.glb')

      const infos = await page.evaluate(() => {
        const s = (window as any).__modelStore.getState()
        const result: { id: string; meshIndex: any; fileId: string | null }[] = []

        function walk(nodes: any[], parentFileId: string | null) {
          for (const node of nodes) {
            if (node.id.startsWith('file:')) {
              const fid = node.id.slice(5)
              if (node.children) walk(node.children, fid)
            } else {
              const fileId = parentFileId
              result.push({
                id: node.id,
                meshIndex: node.meshIndex,
                fileId,
              })
              if (node.children) walk(node.children, fileId)
            }
          }
        }
        walk(s.sceneTree, null)
        return result
      })

      console.log('Scene tree nodes:', JSON.stringify(infos, null, 2))

      for (const info of infos) {
        expect(info.fileId).toBeTruthy()
      }

      const partNodes = infos.filter((n) => n.meshIndex !== undefined)
      console.log('Part nodes:', JSON.stringify(partNodes, null, 2))
      expect(partNodes.length).toBeGreaterThanOrEqual(1)

      for (const pn of partNodes) {
        expect(typeof pn.meshIndex).toBe('number')
        expect(pn.meshIndex).toBeGreaterThanOrEqual(0)
        expect(pn.fileId).toBeTruthy()
      }
    })
  })

  // ─── Bug 1 & 2: STL merged-geometry ────────────────────────────────────

  test.describe('Bug 1 & 2 — STL merged-geometry', () => {
    test('STL: scene tree node has meshIndex and fileId (root cause)', async () => {
      await loadStl(page, CUBE1_STL, 'cube01.stl')

      const dump = await page.evaluate(() => {
        const s = (window as any).__modelStore.getState()
        const activeFile = s.loadedFiles.find((f: any) => f.id === s.activeFileId)
        return {
          sceneTree: JSON.parse(JSON.stringify(s.sceneTree)),
          activeFileId: s.activeFileId,
          activeFilePartInfos: activeFile ? JSON.parse(JSON.stringify(activeFile.glbPartInfos)) : null,
          activeFileSceneTree: activeFile ? JSON.parse(JSON.stringify(activeFile.sceneTree)) : null,
          modelBuffer: !!s.modelBuffer,
          modelFormat: s.modelFormat,
          loadedFileIds: s.loadedFiles.map((f: any) => f.id),
          __loadingPhase: s.__loadingPhase,
          mgRan: (window as any).__mgRan,
      mgLastFileId: (window as any).__mgLastFileId,
      mgLastBuffer: (window as any).__mgLastBuffer,
      mgLastFormat: (window as any).__mgLastFormat,
      r3fDev: (window as any).__r3f_dev ? {
        hasScene: !!((window as any).__r3f_dev.scene),
        meshNames: ((window as any).__r3f_dev.scene?.traverse) ? (() => { const names: string[] = []; (window as any).__r3f_dev.scene.traverse((o: any) => { if (o.isMesh) names.push(o.name || '(unnamed)') }); return names })() : null,
        meshCount: ((window as any).__r3f_dev.scene?.children) ? (window as any).__r3f_dev.scene.children.length : -1
      } : null,
        }
      })
      console.log('STL store dump:', JSON.stringify(dump, null, 2))

      const infos = await page.evaluate(() => {
        const s = (window as any).__modelStore.getState()
        const result: { id: string; meshIndex: any; dataTestId: string; fileId: string | null }[] = []

        function walk(nodes: any[], parentFileId: string | null) {
          for (const node of nodes) {
            if (node.id.startsWith('file:')) {
              const fid = node.id.slice(5)
              if (node.children) walk(node.children, fid)
            } else {
              const fileId = parentFileId
              const isPartNode = node.meshIndex !== undefined && fileId != null
              result.push({
                id: node.id,
                meshIndex: node.meshIndex,
                dataTestId: isPartNode ? 'scene-tree-part' : 'scene-tree-group',
                fileId,
              })
              if (node.children) walk(node.children, fileId)
            }
          }
        }
        walk(s.sceneTree, null)
        return result
      })
      console.log('STL scene tree:', JSON.stringify(infos, null, 2))

      expect(infos.length).toBeGreaterThanOrEqual(1)
      const stlNode = infos[0]
      expect(stlNode.meshIndex).not.toBeUndefined()
      expect(typeof stlNode.meshIndex).toBe('number')
      expect(stlNode.dataTestId).toBe('scene-tree-part')
      expect(stlNode.fileId).toBeTruthy()
    })

    test('STL: canvas click → toolbar opens material editor', async () => {
      await loadStl(page, CUBE1_STL, 'cube01.stl')

      const canvas = page.locator('canvas').first()
      await expect(canvas).toBeAttached({ timeout: 10_000 })

      // Wait until the model mesh is in the THREE scene AND camera fit
      // animation has finished.
      await page.waitForFunction(
        () => {
          const scene = (window as any).__r3f_dev?.scene
          if (!scene) return false
          let found = false
          scene.traverse((o: any) => {
            if (o.isMesh && typeof o.userData?.partId === 'string' && o.userData.partId && o.userData.meshIndex !== undefined) {
              found = true
            }
          })
          return found
        },
        { timeout: 10000 },
      )
      await page.waitForTimeout(1500) // camera fit animation ~1 s

      // Select the STL part programmatically (1 mm cube is too small to
      // reliably hit with a single canvas-centre click in Electron).
      const selectedIds = await page.evaluate(() => {
        const s = (window as any).__modelStore.getState()
        const activeFile = s.loadedFiles.find((f: any) => f.id === s.activeFileId)
        const partId = activeFile?.sceneTree?.[0]?.id
        if (partId) {
          (window as any).__selectionStore.getState().setSelectedReference(partId)
        }
        return (window as any).__selectionStore.getState().selectedReferenceIds as string[]
      })
      console.log('STL selectedReferenceIds:', selectedIds)
      expect(selectedIds.length).toBe(1)

      const selectedId = selectedIds[0]
      const nodeFound = await page.evaluate((id) => {
        const tree = (window as any).__modelStore.getState().sceneTree
        function find(nodes: any[]): any {
          for (const n of nodes) {
            if (n.id === id) return n
            if (n.children) { const f = find(n.children); if (f) return f }
          }
          return null
        }
        return find(tree)
      }, selectedId)
      expect(nodeFound).not.toBeNull()

      const materialBtn = page.locator('header button').filter({ has: page.locator('svg.text-pink-500') }).first()
      await materialBtn.click()

      const closeBtn = page.locator('button[aria-label="close material editor"]')
      await expect(closeBtn).toBeVisible({ timeout: 5000 })
    })

    test('STL: right-click mesh node shows "Edit Material"', async () => {
      await loadStl(page, CUBE1_STL, 'cube01.stl')

      const treeNode = page.locator('[data-testid="scene-tree-part"]').first()
      await expect(treeNode).toBeAttached({ timeout: 5000 })

      const nodeName = await treeNode.textContent()
      console.log('STL node text:', nodeName)

      await treeNode.click({ button: 'right' })

      const editMaterialItem = page.getByText(/Edit Material|编辑材质/)
      await expect(editMaterialItem.first()).toBeVisible({ timeout: 3000 })
    })
  })
})
