import path from 'path'
import { fileURLToPath } from 'url'
import type { Page } from '@playwright/test'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..', '..')

// ---------------------------------------------------------------------------
// Error guard — every E2E test must check that no pageerror/console.error
// fired, so regressions that throw runtime exceptions (like a missing import)
// cannot slip through CI.
// ---------------------------------------------------------------------------

export interface ErrorGuard {
  /** Assert that no page errors, console errors, or window.__errors have been collected. */
  assertNoErrors(): Promise<void>
  /** Return a copy of all collected error strings (for targeted assertions). */
  getErrors(): string[]
}

export function createErrorGuard(page: Page): ErrorGuard {
  const errors: string[] = []

  page.on('pageerror', (err) => {
    errors.push(`[pageerror] ${err.message}`)
  })
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(`[console.error] ${msg.text()}`)
    }
  })

  return {
    async assertNoErrors() {
      // Also check window.__errors — the renderer's own global error handler
      // (main.tsx) stores errors there, which is more reliable than Playwright's
      // console listener in Electron.
      try {
        const winErrors: Array<{ message: string; stack?: string; timestamp: number }> =
          await page.evaluate(() => (window as any).__errors?.slice() ?? [])
        for (const e of winErrors) {
          errors.push(`[window.__errors] ${e.message}`)
          if (e.stack) errors.push(`  Stack: ${e.stack.split('\n').slice(0, 3).join('\n  ')}`)
        }
        // Clear so the same errors aren't reported again
        await page.evaluate(() => { (window as any).__errors = [] })
      } catch {
        // page might be closed — ignore
      }

      if (errors.length > 0) {
        throw new Error(
          `Unexpected errors during test:\n${errors.map((e) => `  - ${e}`).join('\n')}`,
        )
      }
    },
    getErrors() {
      return [...errors]
    },
  }
}

// ---------------------------------------------------------------------------

export function getElectronPath(): string {
  const platform = process.platform
  if (platform === 'win32') {
    return path.join(PROJECT_ROOT, 'dist', 'win-unpacked', '3D_Viewer.exe')
  }
  if (platform === 'darwin') {
    const macDir = process.arch === 'arm64' ? 'dist/mac-arm64' : 'dist/mac'
    const appName = '3D Model Viewer'
    return path.join(PROJECT_ROOT, macDir, `${appName}.app`, 'Contents', 'MacOS', appName)
  }
  if (platform === 'linux') {
    return path.join(PROJECT_ROOT, 'dist', 'linux-unpacked', '3d_viewer_electron')
  }
  throw new Error(`Unsupported platform: ${platform}`)
}
