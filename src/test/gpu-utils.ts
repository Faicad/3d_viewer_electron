/**
 * GPU detection helpers for E2E tests.
 *
 * On software-rendered platforms (WSL2 with llvmpipe, CI without GPU, etc.)
 * PMREM generation, shadow maps, and IBL-based environment textures are
 * unavailable.  Tests that depend on those features should skip.
 *
 * See docs/gpu-adaptive-rendering-design.md and simple-rendering-mode-design.md
 * for the full GPU-adaptive rendering strategy.
 */
import type { Page } from '@playwright/test'

/** Software GPU keywords matched case-insensitively. */
const SW_GPU_PATTERNS = [
  'llvmpipe',
  'swiftshader',
  'microsoft basic render',
  'mesa offscreen',
]

/**
 * Detect whether the current WebGL renderer is software-backed.
 * Must be called after the canvas is attached and `__r3f_dev.gl` is ready.
 */
export async function isSoftwareGpu(page: Page): Promise<boolean> {
  try {
    const info = await page.evaluate(() => {
      const gl = (window as any).__r3f_dev?.gl as WebGLRendererLike | undefined
      if (!gl) return { vendor: '', renderer: '', isSoftware: false }
      const ctx = gl.getContext() as WebGLRenderingContext | null
      if (!ctx) return { vendor: '', renderer: '', isSoftware: false }
      const ext = ctx.getExtension('WEBGL_debug_renderer_info')
      const vendor = ext ? ctx.getParameter(ext.UNMASKED_VENDOR_WEBGL) : ''
      const renderer = ext ? ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ''
      const lower = `${vendor} ${renderer}`.toLowerCase()
      const swPatterns = ['llvmpipe', 'swiftshader', 'microsoft basic render', 'mesa offscreen']
      return { vendor, renderer, isSoftware: swPatterns.some(p => lower.includes(p)) }
    })
    return info.isSoftware
  } catch {
    // If __r3f_dev isn't ready, err on the safe side (don't skip).
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

interface WebGLRendererLike {
  getContext(): WebGLRenderingContext | null
}
