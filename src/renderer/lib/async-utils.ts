const YIELD_BUDGET_MS = 32

let lastYield = 0

const raf = typeof requestAnimationFrame !== 'undefined'
  ? (cb: FrameRequestCallback) => requestAnimationFrame(cb)
  : (cb: FrameRequestCallback) => setTimeout(cb, 16)

/**
 * Yield control to the browser's rendering thread so pending DOM updates
 * (like progress bar width changes) can be painted.
 *
 * Uses requestAnimationFrame + setTimeout(0) — the same pattern that
 * bambu-viewer uses to avoid progress bars that jump from 0% straight to 100%.
 *
 * Falls back to setTimeout(16) in non-browser environments (e.g. vitest).
 *
 * @param force — If true, always yield regardless of the time budget.
 * @returns true if a yield actually happened (false = skipped by budget).
 */
export async function yieldToUI(force = false): Promise<boolean> {
  const now = performance.now()
  if (!force && now - lastYield < YIELD_BUDGET_MS) return false
  await new Promise(resolve => raf(() => setTimeout(resolve, 0)))
  lastYield = performance.now()
  return true
}

/** Reset the yield timer. Call at the start of each new load operation. */
export function resetYieldTimer(): void {
  lastYield = 0
}
