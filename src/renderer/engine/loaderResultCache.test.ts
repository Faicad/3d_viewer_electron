import { describe, it, expect } from 'vitest'
import { markLoaded, clearLoaded, setCachedResult, getCachedResult } from './loaderResultCache'

describe('loaderResultCache — markLoaded / clearLoaded', () => {

  it('markLoaded returns true on first call', () => {
    const buf = new ArrayBuffer(8)
    expect(markLoaded('test1', buf)).toBe(true)
  })

  it('markLoaded returns false on duplicate call', () => {
    const buf = new ArrayBuffer(8)
    markLoaded('test2', buf)
    expect(markLoaded('test2', buf)).toBe(false)
  })

  it('markLoaded returns true again after clearLoaded', () => {
    const buf = new ArrayBuffer(8)
    markLoaded('test3', buf)
    clearLoaded('test3')
    expect(markLoaded('test3', buf)).toBe(true)
  })

  it('clearLoaded does not affect other fileIds', () => {
    const buf = new ArrayBuffer(8)
    markLoaded('test4', buf)
    markLoaded('other4', buf)
    clearLoaded('test4')
    // test4 should be loadable again
    expect(markLoaded('test4', buf)).toBe(true)
    // other4 should still be blocked
    expect(markLoaded('other4', buf)).toBe(false)
  })

  it('modelGroup effect re-runs after clearLoaded (simulated flow)', () => {
    // Simulate ModelGroup effect:
    // 1. Initial load: markLoaded returns true, process meshes with 'print' view
    // 2. viewMode changes → cleanup clears loadedOnce
    // 3. Effect re-runs: markLoaded returns true, re-process meshes with new view mode

    const fileId = 'sim-flow'
    const buf = new ArrayBuffer(16)

    // Step 1: initial load (markLoaded succeeds)
    expect(markLoaded(fileId, buf)).toBe(true)

    // Step 2: simulate cleanup when effect deps change
    clearLoaded(fileId)

    // Step 3: effect re-runs (markLoaded succeeds again)
    expect(markLoaded(fileId, buf)).toBe(true)

    // If clearLoaded were not called, step 3 would return false and the effect
    // would bail out early — this is the exact bug that was fixed.
  })

  it('setCachedResult/getCachedResult round-trip', () => {
    const fn = () => ({ meshes: [], objects: [] })
    setCachedResult('cache-test', fn as unknown as any)
    const result = getCachedResult('cache-test')
    expect(result).toBeDefined()
  })
})
