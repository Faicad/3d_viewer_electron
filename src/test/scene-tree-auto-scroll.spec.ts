import { test, expect, ElectronApplication, _electron, Page } from '@playwright/test'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getElectronLaunchArgs, getElectronPath, createUserDataDir, cleanupUserDataDir } from './utils'
import { isLinuxCI } from './gpu-utils'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROBOT_GLB = readFileSync(path.join(__dirname, 'fixtures', 'RobotExpressive.glb'))

/** Wait for ModelGroup to finish loading (replaces fixed timeouts). */
async function waitForLoadDone(page: Page, timeout = 30000) {
  await page.waitForFunction(
    () => window.__modelStore?.getState().__loadingPhase === 'done',
    { timeout },
  )
}

/**
 * Verify: selecting a mesh auto-scrolls the scene tree so the corresponding
 * node is visible in the scroll viewport.
 *
 * Without this fix, the node only gets highlighted but stays off-screen
 * if the tree is long and the node is deep.
 *
 * RobotExpressive.glb scene tree path for the right foot:
 *   RobotExpressive.glb / RobotExpressive / RobotArmature / Bone / FootR / FootR_1
 */
test.describe('Scene tree auto-scroll on selection', () => {
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

  /** Ensure the left (scene tree) panel is open. */
  async function ensureLeftPanelOpen(window: Page) {
    await window.setViewportSize({ width: 1280, height: 800 })
    await window.waitForFunction(
      () => document.querySelector('aside[data-testid="left-panel"]') !== null,
      { timeout: 5000 },
    )
  }

  /** Load RobotExpressive.glb via addLoadedFile. */
  async function loadRobot(window: Page) {
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
  }

  test('selecting a deep mesh scrolls the scene tree to reveal it', async () => {
    test.skip(isLinuxCI(), 'Unstable on Linux CI / SwiftShader')
    const window = await electronApp.firstWindow()
    await ensureLeftPanelOpen(window)
    await window.locator('canvas').first().waitFor({ state: 'attached', timeout: 20000 })
    await loadRobot(window)

    // Wait for scene tree parts to appear
    await window.locator('[data-testid="scene-tree-part"]').first().waitFor({ state: 'attached', timeout: 10_000 })

    // Find the FootR_1 node ID — it's the right foot mesh, deep in the tree
    const deepPartId = await window.evaluate(() => {
      const ms = (window as any).__modelStore.getState() as any
      const tree = ms.sceneTree as any[]
      function findByName(nodes: any[], name: string): string | null {
        for (const n of nodes) {
          if (n.meshIndex !== undefined && n.name === name) return n.id
          if (n.children) {
            const found = findByName(n.children, name)
            if (found) return found
          }
        }
        return null
      }
      return findByName(tree, 'FootR_1')
    })
    expect(deepPartId).toBeTruthy()

    // Ensure all ancestors are expanded so the deep node is in the DOM
    await window.evaluate((partId) => {
      const ms = (window as any).__modelStore.getState() as any
      const tree = ms.sceneTree as any[]
      function findAncestors(nodes: any[], targetId: string, path: string[]): string[] | null {
        for (const n of nodes) {
          if (n.id === targetId) return path
          if (n.children) {
            const found = findAncestors(n.children, targetId, [...path, n.id])
            if (found) return found
          }
        }
        return null
      }
      const ancestors = findAncestors(tree, partId, []) ?? []
      for (const ancestorId of ancestors) {
        ms.setNodeExpanded(ancestorId, true)
      }
    }, deepPartId)

    // Get the viewport (Radix ScrollArea Viewport) and scroll it to top
    const viewportEl = window.locator('[data-testid="left-panel"] [data-radix-scroll-area-viewport]')
    await expect(viewportEl).toBeAttached({ timeout: 5000 })

    // Scroll to top
    await viewportEl.evaluate((el: HTMLElement) => { el.scrollTop = 0 })

    // Verify the FootR_1 element is below the viewport (off-screen) before selection
    const belowFold = await viewportEl.evaluate((vp, partId) => {
      const el = vp.querySelector(`[data-node-id="${(window as any).CSS.escape(partId)}"]`)
      if (!el) return 'not-in-dom'
      const vpRect = vp.getBoundingClientRect()
      const elRect = el.getBoundingClientRect()
      if (elRect.top >= vpRect.bottom) return true  // below viewport
      if (elRect.bottom <= vpRect.top) return 'above'
      return false // already visible
    }, deepPartId)
    expect(belowFold, 'FootR_1 should be below the fold before selection').toBe(true)

    // Now select the deep part via the store (simulating canvas click)
    await window.evaluate((partId) => {
      (window as any).__selectionStore.getState().setSelectedReference(partId)
    }, deepPartId)

    // Wait for smooth scroll to complete
    await window.waitForTimeout(600)

    // Verify the selected node is now visible within the viewport
    const isVisible = await viewportEl.evaluate((vp, partId) => {
      const el = vp.querySelector(`[data-node-id="${(window as any).CSS.escape(partId)}"]`)
      if (!el) return false
      const vpRect = vp.getBoundingClientRect()
      const elRect = el.getBoundingClientRect()
      return (
        elRect.bottom > vpRect.top &&
        elRect.top < vpRect.bottom
      )
    }, deepPartId)
    expect(isVisible, 'Selected FootR_1 node should be scrolled into view').toBe(true)
  })

  test('selection auto-expands collapsed parent nodes', async () => {
    test.skip(isLinuxCI(), 'Unstable on Linux CI / SwiftShader')
    const window = await electronApp.firstWindow()
    await ensureLeftPanelOpen(window)
    await window.locator('canvas').first().waitFor({ state: 'attached', timeout: 20000 })
    await loadRobot(window)

    // Wait for scene tree parts
    await window.locator('[data-testid="scene-tree-part"]').first().waitFor({ state: 'attached', timeout: 10_000 })

    // Find FootR_1 and collapse all its ancestors
    const deepPartId = await window.evaluate(() => {
      const ms = (window as any).__modelStore.getState() as any
      const tree = ms.sceneTree as any[]
      function findByName(nodes: any[], name: string): string | null {
        for (const n of nodes) {
          if (n.meshIndex !== undefined && n.name === name) return n.id
          if (n.children) {
            const found = findByName(n.children, name)
            if (found) return found
          }
        }
        return null
      }
      return findByName(tree, 'FootR_1')
    })
    expect(deepPartId).toBeTruthy()

    // Collapse all ancestor nodes
    await window.evaluate((partId) => {
      const ms = (window as any).__modelStore.getState() as any
      const tree = ms.sceneTree as any[]
      function findAncestors(nodes: any[], targetId: string, path: string[]): string[] | null {
        for (const n of nodes) {
          if (n.id === targetId) return path
          if (n.children) {
            const found = findAncestors(n.children, targetId, [...path, n.id])
            if (found) return found
          }
        }
        return null
      }
      const ancestors = findAncestors(tree, partId, []) ?? []
      for (const ancestorId of ancestors) {
        ms.setNodeExpanded(ancestorId, false)
      }
    }, deepPartId)

    // Verify the deep part is NOT in the DOM (parent collapsed)
    const viewportEl = window.locator('[data-testid="left-panel"] [data-radix-scroll-area-viewport]')
    const existsBefore = await viewportEl.evaluate((vp, partId) => {
      return vp.querySelector(`[data-node-id="${(window as any).CSS.escape(partId)}"]`) !== null
    }, deepPartId)
    expect(existsBefore, 'FootR_1 should NOT be in DOM when ancestors collapsed').toBe(false)

    // Select the deep part — fix should auto-expand ancestors
    await window.evaluate((partId) => {
      (window as any).__selectionStore.getState().setSelectedReference(partId)
    }, deepPartId)

    // Wait for expand + scroll
    await window.waitForTimeout(600)

    // Now the node should be in the DOM
    const existsAfter = await viewportEl.evaluate((vp, partId) => {
      return vp.querySelector(`[data-node-id="${(window as any).CSS.escape(partId)}"]`) !== null
    }, deepPartId)
    expect(existsAfter, 'FootR_1 should be in DOM after auto-expand').toBe(true)

    // And it should be visible in the viewport
    const isVisible = await viewportEl.evaluate((vp, partId) => {
      const el = vp.querySelector(`[data-node-id="${(window as any).CSS.escape(partId)}"]`)
      if (!el) return false
      const vpRect = vp.getBoundingClientRect()
      const elRect = el.getBoundingClientRect()
      return (
        elRect.bottom > vpRect.top &&
        elRect.top < vpRect.bottom
      )
    }, deepPartId)
    expect(isVisible, 'Auto-expanded node should be visible in viewport').toBe(true)
  })
})
