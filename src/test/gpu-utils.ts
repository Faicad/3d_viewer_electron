/**
 * GPU detection helpers for E2E tests.
 *
 * Software GPU detection is performed by the renderer at init time
 * (ViewportContainer.tsx onCreated) and stored in window.__isSoftwareGpu.
 * Tests read this pre-computed value — NO WebGL calls happen in the test
 * context, which avoids page.evaluate hangs on SwiftShader / ANGLE backends.
 *
 * On software-rendered platforms PMREM generation, shadow maps, and IBL-based
 * environment textures are unavailable. Tests that depend on those features
 * should skip.
 *
 * See docs/gpu-adaptive-rendering-design.md and simple-rendering-mode-design.md
 * for the full GPU-adaptive rendering strategy.
 */
import type { Page } from '@playwright/test'

/**
 * Detect whether the current WebGL renderer is software-backed.
 *
 * Reads window.__isSoftwareGpu which is pre-computed by the renderer during
 * Three.js initialization (while the WebGL context is still fresh).
 * No WebGL calls are made here — avoids hangs on software backends.
 */
export async function isSoftwareGpu(page: Page): Promise<boolean> {
  try {
    return await page.evaluate(() => !!(window as any).__isSoftwareGpu)
  } catch {
    return false
  }
}

/**
 * Convenience: returns true when the scene has no environment texture,
 * which is a reliable fallback signal that PMREM generation failed.
 * Useful as a pre-check before pixel-level shadow/lighting assertions.
 */
export async function hasSceneEnvironment(page: Page): Promise<boolean> {
  try {
    return await page.evaluate(() => !!(window as any).__r3f_dev?.scene?.environment)
  } catch {
    return false
  }
}
