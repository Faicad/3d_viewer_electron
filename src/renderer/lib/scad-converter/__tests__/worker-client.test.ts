/**
 * @vitest-environment jsdom
 *
 * Unit tests for ScadWorkerClient message handling.
 * Uses a mock Worker to verify protocol correctness without a real browser/CDN.
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { ScadWorkerClient, type RenderOutcome } from '../worker-client'

/** Minimal STL binary: 84-byte header + zero triangles. */
function buildStlHeader(triangleCount: number): Uint8Array {
  const buf = new ArrayBuffer(84 + triangleCount * 50)
  const dv = new DataView(buf)
  dv.setUint32(80, triangleCount, true)
  return new Uint8Array(buf)
}

/**
 * Create a mock Worker that replays pre-programmed responses sequentially.
 * Use the placeholder `'$id'` in response `id` fields — it gets replaced with
 * the actual request id from postMessage.
 */
function createMockWorker(
  responses: Array<Record<string, unknown>>,
): Worker {
  const messageHandlers = new Set<(ev: MessageEvent) => void>()
  const errorHandlers = new Set<(ev: ErrorEvent) => void>()

  let reqId = 'r1' // captured from postMessage

  let idx = 0
  function fireNext(): void {
    if (idx >= responses.length) return
    const raw = responses[idx++]
    // Replace '$id' placeholder with actual request id
    const resp = { ...raw }
    if (resp.id === '$id') resp.id = reqId
    setTimeout(() => {
      for (const h of messageHandlers) {
        h({ data: resp } as MessageEvent)
      }
      fireNext()
    }, 0)
  }

  const mock = {
    addEventListener: vi.fn((type: string, handler: (ev: MessageEvent | ErrorEvent) => void) => {
      if (type === 'message') messageHandlers.add(handler as (ev: MessageEvent) => void)
      if (type === 'error') errorHandlers.add(handler as (ev: ErrorEvent) => void)
    }),
    removeEventListener: vi.fn((type: string, handler: (ev: MessageEvent | ErrorEvent) => void) => {
      if (type === 'message') messageHandlers.delete(handler as (ev: MessageEvent) => void)
      if (type === 'error') errorHandlers.delete(handler as (ev: ErrorEvent) => void)
    }),
    postMessage: vi.fn((msg: unknown) => {
      // Capture the request ID for response matching
      reqId = (msg as { id: string }).id
      fireNext()
    }),
    terminate: vi.fn(),
  }

  return mock as unknown as Worker
}

// ---- Helpers ----

function overrideCreateWorker(responses: Array<Record<string, unknown>>): Worker {
  const w = createMockWorker(responses)
  ScadWorkerClient.createWorker = () => w
  return w
}

async function expectOk(outcome: RenderOutcome): Promise<RenderOutcome & { ok: true }> {
  if (!outcome.ok) throw new Error(`Expected ok, got error: ${outcome.message}`)
  return outcome as RenderOutcome & { ok: true }
}

async function expectError(outcome: RenderOutcome, msg?: string): Promise<void> {
  if (outcome.ok) throw new Error('Expected error, got ok')
  if (msg && !outcome.message.includes(msg)) {
    throw new Error(`Expected error containing "${msg}", got "${outcome.message}"`)
  }
}

describe('ScadWorkerClient', () => {
  afterEach(() => {
    // Restore default factory
    ScadWorkerClient.createWorker = () =>
      new Worker(new URL('../openscad.worker.ts', import.meta.url), { type: 'module' })
  })

  // ── Successful render ──

  it('resolves with STL bytes on render-result', async () => {
    const stl = buildStlHeader(12)
    overrideCreateWorker([
      { type: 'ready', id: 'boot' },
      { type: 'render-progress', phase: 'init', id: '$id' },
      { type: 'render-progress', phase: 'compile', id: '$id' },
      { type: 'render-result', id: '$id', bytes: stl, renderMs: 42, stderr: '' },
    ])

    const client = new ScadWorkerClient()
    const outcome = await expectOk(await client.render('cube(10);'))

    expect(outcome.bytes).toBe(stl)
    expect(outcome.renderMs).toBe(42)
    expect(outcome.stderr).toBe('')
  })

  // ── Error handling ──

  it('rejects with error on render-error', async () => {
    overrideCreateWorker([
      { type: 'ready', id: 'boot' },
      { type: 'render-error', id: '$id', message: 'syntax error', stderr: 'ERROR: line 3' },
    ])

    const client = new ScadWorkerClient()
    const outcome = await client.render('invalid scad')

    await expectError(outcome, 'syntax error')
    if (!outcome.ok) {
      expect(outcome.stderr).toBe('ERROR: line 3')
      expect(outcome.aborted).toBeUndefined()
    }
  })

  // ── Cancel ──

  it('cancels pending render and resolves as aborted', async () => {
    // Worker with only 'ready' — never completes
    overrideCreateWorker([
      { type: 'ready', id: 'boot' },
    ])

    const client = new ScadWorkerClient()
    const renderPromise = client.render('cube(10);')

    // Cancel before worker (which only sends 'ready') resolves
    client.cancel()

    const outcome = await renderPromise
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) {
      expect(outcome.message).toBe('superseded')
      expect(outcome.aborted).toBe(true)
    }
  })

  // ── Progress callbacks ──

  it('calls onProgress for each phase', async () => {
    const stl = buildStlHeader(8)
    overrideCreateWorker([
      { type: 'ready', id: 'boot' },
      { type: 'render-progress', phase: 'init', id: '$id' },
      { type: 'render-progress', phase: 'compile', id: '$id' },
      { type: 'render-progress', phase: 'export', id: '$id' },
      { type: 'render-result', id: '$id', bytes: stl, renderMs: 100, stderr: '' },
    ])

    const phases: string[] = []
    const client = new ScadWorkerClient()
    await client.render('cube(10);', (phase) => phases.push(phase))

    expect(phases).toEqual(['init', 'compile', 'export'])
  })

  // ── isRendering ──

  it('isRendering is true during render, false after', async () => {
    const stl = buildStlHeader(4)
    overrideCreateWorker([
      { type: 'ready', id: 'boot' },
      { type: 'render-result', id: '$id', bytes: stl, renderMs: 10, stderr: '' },
    ])

    const client = new ScadWorkerClient()
    expect(client.isRendering()).toBe(false)

    const p = client.render('cube(10);')
    expect(client.isRendering()).toBe(true)

    await p
    expect(client.isRendering()).toBe(false)
  })

  // ── Superseding renders ──

  it('cancels first render when second render starts', async () => {
    const stl = buildStlHeader(4)

    let callCount = 0
    ScadWorkerClient.createWorker = () => {
      callCount++
      if (callCount === 1) {
        // First worker: only sends ready, never completes
        return createMockWorker([{ type: 'ready', id: 'boot' }])
      }
      // Second worker: responds immediately
      return createMockWorker([
        { type: 'ready', id: 'boot' },
        { type: 'render-result', id: '$id', bytes: stl, renderMs: 10, stderr: '' },
      ])
    }

    const client = new ScadWorkerClient()

    const p1 = client.render('cube(10);')
    const p2 = client.render('sphere(5);')

    const [r1, r2] = await Promise.all([p1, p2])

    expect(r1.ok).toBe(false)
    if (!r1.ok) expect(r1.aborted).toBe(true)
    expect(r2.ok).toBe(true)
    expect(callCount).toBe(2)
  })

  // ── dispose ──

  it('dispose cancels and cleans up', () => {
    overrideCreateWorker([{ type: 'ready', id: 'boot' }])

    const client = new ScadWorkerClient()
    void client.render('cube(10);')
    expect(client.isRendering()).toBe(true)

    client.dispose()
    expect(client.isRendering()).toBe(false)
  })
})
