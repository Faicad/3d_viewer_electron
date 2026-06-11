/**
 * Main-thread client for the OpenSCAD WASM Worker.
 *
 * Lifecycle: spawn worker → send render → receive result → terminate worker.
 * `callMain` is single-shot in openscad-wasm (corrupts state on reuse), so
 * every render gets a freshly spawned Worker. JS/WASM are browser-cached so
 * respawn is ~400-800ms (not a full download).
 */

import type { WorkerRequest, WorkerResponse } from './protocol'

export interface RenderResult {
  ok: true
  bytes: Uint8Array
  renderMs: number
  stderr: string
}

export interface RenderError {
  ok: false
  message: string
  stderr: string
  /** True when cancelled in favour of a newer render. */
  aborted?: boolean
}

export type RenderOutcome = RenderResult | RenderError

export type ProgressPhase = 'init' | 'compile' | 'export'

interface PendingRender {
  id: string
  resolve: (outcome: RenderOutcome) => void
  onProgress?: (phase: ProgressPhase) => void
}

export class ScadWorkerClient {
  private worker: Worker | null = null
  private pending = new Map<string, PendingRender>()
  private nextId = 1

  /** Override for testing: factory that creates a Worker. */
  static createWorker: () => Worker = () => {
    return new Worker(
      new URL('./openscad.worker.ts', import.meta.url),
      { type: 'module' },
    )
  }

  private spawnWorker(): Worker {
    const w = ScadWorkerClient.createWorker()
    w.addEventListener('message', this.handleMessage)
    w.addEventListener('error', this.handleError)
    return w
  }

  private terminateWorker(): void {
    if (!this.worker) return
    this.worker.removeEventListener('message', this.handleMessage)
    this.worker.removeEventListener('error', this.handleError)
    this.worker.terminate()
    this.worker = null
  }

  private handleMessage = (ev: MessageEvent<WorkerResponse>) => {
    const msg = ev.data
    if (msg.type === 'ready') return

    const pending = this.pending.get(msg.id)
    if (!pending) return

    if (msg.type === 'render-progress') {
      pending.onProgress?.(msg.phase)
      return
    }

    this.pending.delete(msg.id)

    if (msg.type === 'render-result') {
      this.terminateWorker()
      pending.resolve({
        ok: true,
        bytes: msg.bytes,
        renderMs: msg.renderMs,
        stderr: msg.stderr,
      })
    }

    if (msg.type === 'render-error') {
      this.terminateWorker()
      pending.resolve({
        ok: false,
        message: msg.message,
        stderr: msg.stderr,
      })
    }
  }

  private handleError = (ev: ErrorEvent) => {
    const message = ev.message || 'Worker error'
    for (const p of this.pending.values()) {
      p.resolve({ ok: false, message, stderr: '' })
    }
    this.pending.clear()
  }

  /** Cancel the current render (terminates worker, resolves pending as aborted). */
  cancel(): void {
    if (!this.worker) return
    for (const p of this.pending.values()) {
      p.resolve({ ok: false, message: 'superseded', stderr: '', aborted: true })
    }
    this.pending.clear()
    this.terminateWorker()
  }

  /** True if a render is in flight. */
  isRendering(): boolean {
    return this.worker !== null
  }

  /**
   * Render SCAD source to STL.
   *
   * If a render is already in flight, cancels it first (callMain is not
   * re-entrant). Returns a Promise that resolves with the outcome.
   */
  render(source: string, onProgress?: (phase: ProgressPhase) => void): Promise<RenderOutcome> {
    if (this.worker) {
      this.cancel()
    }

    const id = `r${this.nextId++}`
    this.worker = this.spawnWorker()

    return new Promise<RenderOutcome>((resolve) => {
      this.pending.set(id, { id, resolve, onProgress })
      const req: WorkerRequest = { id, type: 'render', source, format: 'stl' }
      this.worker!.postMessage(req)
    })
  }

  /** Dispose the client (terminate worker if any). */
  dispose(): void {
    this.cancel()
  }
}

/** Singleton for production use. */
let singleton: ScadWorkerClient | null = null

export function getScadWorkerClient(): ScadWorkerClient {
  if (!singleton) singleton = new ScadWorkerClient()
  return singleton
}
