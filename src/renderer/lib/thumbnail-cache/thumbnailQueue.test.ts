import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  startThumbnailQueue,
  stopThumbnailQueue,
  type QueueFile,
} from './thumbnailQueue'

// Polyfill for Node environment (URL.createObjectURL is a browser-only API)
if (typeof URL.createObjectURL === 'undefined') {
  let counter = 0
  ;(URL as Record<string, unknown>).createObjectURL = (_blob: Blob) =>
    `blob:mock-${++counter}`
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockDetectFormat = vi.fn()
const mockCacheKey = vi.fn((path: string, mtime: number) => `${path.replace(/\\/g, '/')}|${Math.trunc(mtime)}`)
const mockGetThumbnail = vi.fn()
const mockPutThumbnail = vi.fn()
const mockGenerateThumbnail = vi.fn()
const mockGenerateSvgThumbnail = vi.fn()
const mockExtractAndProcess3mfThumbnail = vi.fn()
const mockGetStepCached = vi.fn()
const mockConvertDxfToSvg = vi.fn()
const mockReadFile = vi.fn()

vi.mock('@/config/file-formats', () => ({
  detectFormat: (...args: unknown[]) => mockDetectFormat(...args),
}))

vi.mock('./thumbnailCache', () => ({
  cacheKey: (...args: unknown[]) => mockCacheKey(...args),
  getThumbnail: (...args: unknown[]) => mockGetThumbnail(...args),
  putThumbnail: (...args: unknown[]) => mockPutThumbnail(...args),
}))

vi.mock('./thumbnailGenerator', () => ({
  generateThumbnail: (...args: unknown[]) => mockGenerateThumbnail(...args),
  generateSvgThumbnail: (...args: unknown[]) => mockGenerateSvgThumbnail(...args),
  extractAndProcess3mfThumbnail: (...args: unknown[]) =>
    mockExtractAndProcess3mfThumbnail(...args),
}))

vi.mock('@/lib/step-converter/stepCache', () => ({
  getCached: (...args: unknown[]) => mockGetStepCached(...args),
}))

vi.mock('@/lib/dxf-to-svg', () => ({
  convertDxfToSvg: (...args: unknown[]) => mockConvertDxfToSvg(...args),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeFile(name: string, path?: string): QueueFile {
  return {
    name,
    path: path ?? `C:/test/${name}`,
    mtimeMs: 1000,
  }
}

/**
 * Advance timers to let the first processNext run (50ms defer +
 * requestIdleCallback). After this, the queue has processed one file.
 */
async function runFirstProcess(): Promise<void> {
  // The 50 ms defer inside startThumbnailQueue → rebuildQueue → scheduleNext
  vi.advanceTimersByTime(50)
  await vi.runAllTimersAsync()

  // scheduleNext uses requestIdleCallback (→ setTimeout 0) or setTimeout.
  vi.advanceTimersByTime(1)
  await vi.runAllTimersAsync()

  // Let processNext execute (Phase 1 cache hits + Phase 2 worker).
  await vi.runAllTimersAsync()
}


// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('thumbnailQueue error retry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Polyfill requestIdleCallback via setTimeout so processNext runs
    // under fake timers.
    globalThis.requestIdleCallback ??= ((cb: IdleRequestCallback) => {
      return setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 1 }), 0) as unknown as number
    })
    globalThis.cancelIdleCallback ??= ((id: number) => clearTimeout(id))
    // Node environment (colocated test config) lacks window and document.
    if (typeof window === 'undefined') {
      ;(globalThis as Record<string, unknown>).window = globalThis
    }
    if (typeof document === 'undefined') {
      ;(globalThis as Record<string, unknown>).document = { hidden: false }
    }

    mockGetThumbnail.mockResolvedValue(null) // cache miss by default
    mockPutThumbnail.mockResolvedValue(undefined)
    mockReadFile.mockResolvedValue({ success: true, data: new ArrayBuffer(8) })
    mockGetStepCached.mockResolvedValue(null)
    mockConvertDxfToSvg.mockResolvedValue({ svgText: '<svg></svg>' })
    mockExtractAndProcess3mfThumbnail.mockResolvedValue(null)
    mockGenerateSvgThumbnail.mockResolvedValue(new Blob(['svg']))

    ;(window as Record<string, unknown>).electronAPI = { readFile: mockReadFile }

    stopThumbnailQueue()
  })

  afterEach(() => {
    stopThumbnailQueue()
    vi.useRealTimers()
  })

  // -----------------------------------------------------------------------
  // Error retry: requeue on error, permanent fail after MAX_RETRIES
  // -----------------------------------------------------------------------
  describe('error → requeue', () => {
    it('permanently fails after MAX_RETRIES (3) errors', async () => {
      mockDetectFormat.mockReturnValue('glb')
      mockGenerateThumbnail.mockRejectedValue(new Error('parse failed'))

      const onReady = vi.fn()

      startThumbnailQueue([makeFile('bad.glb')], onReady)

      // Let all timers run — 3 retries happen back-to-back
      await vi.runAllTimersAsync()

      // After 3 failed attempts, onReady should be called with '' (permanent fail)
      const permanentFailCalls = onReady.mock.calls.filter(
        ([, url]: [string, string]) => url === '',
      )
      expect(permanentFailCalls).toHaveLength(1)
      expect(permanentFailCalls[0][0]).toBe('C:/test/bad.glb')

      // generateThumbnail should have been called exactly 3 times (MAX_RETRIES)
      expect(mockGenerateThumbnail).toHaveBeenCalledTimes(3)
    })
  })

  // -----------------------------------------------------------------------
  // generateThumbnail receives filePath for gltf/glb formats
  // -----------------------------------------------------------------------
  describe('filePath forwarding', () => {
    it('passes file.path to generateThumbnail for glb format', async () => {
      mockDetectFormat.mockReturnValue('glb')
      const thumbBlob = new Blob(['thumb'])
      mockGenerateThumbnail.mockResolvedValue(thumbBlob)

      const onReady = vi.fn()

      startThumbnailQueue(
        [makeFile('model.glb', 'C:/projects/model.glb')],
        onReady,
      )

      await runFirstProcess()

      expect(mockGenerateThumbnail).toHaveBeenCalledWith(
        expect.any(ArrayBuffer),
        'glb',
        'C:/projects/model.glb',
      )
    })

    it('passes file.path to generateThumbnail for gltf format', async () => {
      mockDetectFormat.mockReturnValue('gltf')
      const thumbBlob = new Blob(['thumb'])
      mockGenerateThumbnail.mockResolvedValue(thumbBlob)

      const onReady = vi.fn()

      startThumbnailQueue(
        [makeFile('model.gltf', 'C:/projects/model.gltf')],
        onReady,
      )

      await runFirstProcess()

      expect(mockGenerateThumbnail).toHaveBeenCalledWith(
        expect.any(ArrayBuffer),
        'gltf',
        'C:/projects/model.gltf',
      )
    })
  })

  // -----------------------------------------------------------------------
  // Timeout retry still works
  // -----------------------------------------------------------------------
  describe('timeout retry', () => {
    it('permanently fails after MAX_RETRIES timeouts', async () => {
      mockDetectFormat.mockReturnValue('glb')
      // generateThumbnail never resolves → always times out
      mockGenerateThumbnail.mockImplementation(
        () => new Promise(() => {}),
      )

      const onReady = vi.fn()

      startThumbnailQueue([makeFile('hangs.glb')], onReady)

      // Run all timers — each cycle takes 15s timeout + 200ms gap.
      // 3 cycles ≈ 45.6s. runAllTimersAsync may take a while but
      // fake timers make it instant.
      await vi.runAllTimersAsync()

      const permanentFailCalls = onReady.mock.calls.filter(
        ([, url]: [string, string]) => url === '',
      )
      expect(permanentFailCalls).toHaveLength(1)
      expect(permanentFailCalls[0][0]).toBe('C:/test/hangs.glb')
    })
  })

  // -----------------------------------------------------------------------
  // Successful thumbnail generation
  // -----------------------------------------------------------------------
  describe('success path', () => {
    it('generates thumbnail and calls onReady with object URL', async () => {
      mockDetectFormat.mockReturnValue('glb')
      const thumbBlob = new Blob(['thumb-data'])
      mockGenerateThumbnail.mockResolvedValue(thumbBlob)

      const onReady = vi.fn()

      startThumbnailQueue([makeFile('good.glb', 'C:/test/good.glb')], onReady)

      await runFirstProcess()

      const successCalls = onReady.mock.calls.filter(
        ([, url]: [string, string]) => url !== '',
      )
      expect(successCalls).toHaveLength(1)
      expect(successCalls[0][0]).toBe('C:/test/good.glb')
      expect(successCalls[0][1]).toMatch(/^blob:/)
    })
  })

  // -----------------------------------------------------------------------
  // Combined error + timeout retryCount
  // -----------------------------------------------------------------------
  describe('mixed error and timeout retries share retryCount', () => {
    it('failures are counted cumulatively (timeout + error + error = 3)', async () => {
      mockDetectFormat.mockReturnValue('glb')

      const onReady = vi.fn()

      startThumbnailQueue([makeFile('mixed.glb')], onReady)

      // Attempt 1: timeout — called first because generateThumbnail never settles
      mockGenerateThumbnail.mockImplementation(() => new Promise(() => {}))
      await vi.advanceTimersByTimeAsync(50 + 1 + 15_000 + 200 + 1)

      // At this point 1 timeout done, file requeued.
      // Switch to error for attempts 2 & 3
      mockGenerateThumbnail.mockRejectedValue(new Error('crash'))

      // Let remaining cycles run
      await vi.runAllTimersAsync()

      const permanentFailCalls = onReady.mock.calls.filter(
        ([, url]: [string, string]) => url === '',
      )
      expect(permanentFailCalls).toHaveLength(1)
      expect(permanentFailCalls[0][0]).toBe('C:/test/mixed.glb')
    })
  })
})
