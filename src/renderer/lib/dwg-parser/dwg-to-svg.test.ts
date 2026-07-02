/**
 * @vitest-environment jsdom
 *
 * Tests for dwgToSvg — uses a mock Worker to verify protocol correctness
 * without a real browser/CDN.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { dwgToSvg, __resetWorkerForTest } from './dwgToSvg'
import fs from 'node:fs'
import path from 'node:path'

const BRACKET_PATH = path.resolve(__dirname, '../../../test/fixtures/testdata/Bracket.dwg')

describe('dwgToSvg', () => {
  let mockPostMessage: ReturnType<typeof vi.fn>
  let mockWorker: {
    postMessage: ReturnType<typeof vi.fn>
    onmessage: ((ev: MessageEvent) => void) | null
    onerror: ((ev: ErrorEvent) => void) | null
    terminate: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    __resetWorkerForTest()

    mockPostMessage = vi.fn()
    mockWorker = {
      postMessage: mockPostMessage,
      onmessage: null,
      onerror: null,
      terminate: vi.fn(),
    }
    globalThis.Worker = vi.fn(function () {
      return mockWorker as unknown as Worker
    }) as unknown as typeof Worker
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sends buffer to worker and resolves with SVG text', async () => {
    const rawBuffer = await fs.promises.readFile(BRACKET_PATH)
    const buffer = rawBuffer.buffer as ArrayBuffer

    const promise = dwgToSvg(buffer)

    const requestId = mockPostMessage.mock.calls[0]?.[0]?.id ?? 1
    const fakeSvg = '<svg viewBox="0 0 200 150"><line x1="0" y1="0" x2="200" y2="150"/></svg>'
    setTimeout(() => {
      if (mockWorker.onmessage) {
        mockWorker.onmessage({ data: { id: requestId, svgText: fakeSvg } } as MessageEvent)
      }
    }, 0)

    const svgText = await promise

    // Should receive SVG
    expect(svgText).toBe(fakeSvg)
    expect(svgText).toContain('<svg')
    expect(svgText).toContain('viewBox')

    // Should have posted the buffer to the worker
    expect(mockPostMessage).toHaveBeenCalledTimes(1)
    const posted = mockPostMessage.mock.calls[0][0]
    expect(posted).toHaveProperty('id')
    expect(posted).toHaveProperty('buffer')
    expect(posted.buffer).toBe(buffer)
  })

  it('rejects when worker sends an error', async () => {
    const buffer = new ArrayBuffer(64)
    const promise = dwgToSvg(buffer)

    const requestId = mockPostMessage.mock.calls[0]?.[0]?.id ?? 1
    setTimeout(() => {
      if (mockWorker.onmessage) {
        mockWorker.onmessage({ data: { id: requestId, error: 'WASM out of memory' } } as MessageEvent)
      }
    }, 0)

    await expect(promise).rejects.toThrow('WASM out of memory')
  })

  it('reuses the same worker for multiple calls', async () => {
    const buffer = new ArrayBuffer(16)

    const p1 = dwgToSvg(buffer)
    const id1 = mockPostMessage.mock.calls[0]?.[0]?.id

    const p2 = dwgToSvg(buffer)
    const id2 = mockPostMessage.mock.calls[1]?.[0]?.id

    expect(globalThis.Worker).toHaveBeenCalledTimes(1)

    setTimeout(() => {
      if (mockWorker.onmessage) {
        mockWorker.onmessage({ data: { id: id1, svgText: '<svg></svg>' } } as MessageEvent)
        mockWorker.onmessage({ data: { id: id2, svgText: '<svg></svg>' } } as MessageEvent)
      }
    }, 0)

    await expect(p1).resolves.toBeDefined()
    await expect(p2).resolves.toBeDefined()
  })
})

describe('Bracket.dwg fixture', () => {
  it('exists and has reasonable size', async () => {
    const stat = await fs.promises.stat(BRACKET_PATH)
    expect(stat.size).toBeGreaterThan(1000)
    expect(stat.size).toBeLessThan(10 * 1024 * 1024)
  })
})
