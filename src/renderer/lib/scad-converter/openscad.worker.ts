/// <reference lib="webworker" />

/**
 * OpenSCAD WASM Worker — compiles SCAD → STL.
 *
 * Loads openscad-wasm from local `/wasm/openscad.js` (ES module, default export).
 * The JS glue auto-resolves `openscad.wasm` relative to its own URL via
 * `import.meta.url`.
 *
 * Lifecycle: each render creates a fresh WASM instance (callMain is single-shot).
 * The main-thread client terminates this worker after receiving the result.
 */

// Use runtime construction to prevent Vite from statically resolving these imports.
// In dev mode Vite processes the worker and tries to resolve import('/wasm/...'),
// but public/ files are not part of the module graph.
const LOCAL_URL = self.location.origin + '/wasm/openscad.js'
const SCAD_CDN_URL = 'https://cdn.jsdelivr.net/npm/openscad-wasm-prebuilt@1.2.0/dist/openscad.js'

// ---- Types (self-contained, no imports) ----

interface OpenSCADInstance {
  callMain(args: string[]): number
  FS: {
    writeFile(path: string, data: string | ArrayBufferView): void
    readFile(path: string): string | Uint8Array
    readFile(path: string, opts: { encoding: 'binary' }): Uint8Array
    unlink(path: string): void
  }
}

interface WorkerRequest {
  id: string
  type: 'render'
  source: string
  format: 'stl'
}

type WorkerResponse =
  | { id: string; type: 'render-progress'; phase: 'init' | 'compile' | 'export' }
  | { id: string; type: 'render-result'; bytes: Uint8Array; renderMs: number; stderr: string }
  | { id: string; type: 'render-error'; message: string; stderr: string }
  | { id: string; type: 'ready' }

const stderrBuffer: string[] = []

function clearStderr(): void { stderrBuffer.length = 0 }

async function handleRender(req: WorkerRequest): Promise<void> {
  const start = performance.now()
  clearStderr()

  postResponse({ id: req.id, type: 'render-progress', phase: 'init' })

  // Load OpenSCAD: local first, CDN fallback
  let instance: OpenSCADInstance
  try {
    let factory: (opts?: { noInitialRun?: boolean; printErr?: (t: string) => void }) => Promise<OpenSCADInstance>

    try {
      const mod = await import(LOCAL_URL)
      factory = mod.default as typeof factory
    } catch {
      // Local not available — try CDN (openscad-wasm-prebuilt has createOpenSCAD)
      const mod = await import(/* @vite-ignore */ SCAD_CDN_URL)
      if (typeof mod.createOpenSCAD === 'function') {
        const wrapped = await mod.createOpenSCAD({
          noInitialRun: true,
          printErr: (t: string) => { stderrBuffer.push(t) },
        })
        instance = wrapped.getInstance() as unknown as OpenSCADInstance
        // instance ready, skip the factory path below
        factory = null!
      } else if (typeof mod.default === 'function') {
        factory = mod.default as typeof factory
      } else {
        throw new Error(`Unknown module format. Keys: ${Object.keys(mod).join(', ')}`)
      }
    }

    if (factory) {
      instance = await factory({
        noInitialRun: true,
        printErr: (t: string) => { stderrBuffer.push(t) },
      })
    }
  } catch (e) {
    postResponse({
      id: req.id, type: 'render-error',
      message: `Failed to load OpenSCAD: ${e instanceof Error ? e.message : String(e)}`,
      stderr: stderrBuffer.join('\n'),
    })
    return
  }

  const fs = instance.FS
  const inputPath = '/input.scad'
  const outputPath = '/output.stl'

  try { fs.writeFile(inputPath, req.source) } catch (e) {
    postResponse({
      id: req.id, type: 'render-error',
      message: `Failed to write SCAD: ${e instanceof Error ? e.message : String(e)}`,
      stderr: stderrBuffer.join('\n'),
    })
    return
  }

  postResponse({ id: req.id, type: 'render-progress', phase: 'compile' })

  let exitCode: number
  try {
    exitCode = instance.callMain([inputPath, '--enable=manifold', '--export-format', 'binstl', '-o', outputPath])
  } catch (e) {
    postResponse({
      id: req.id, type: 'render-error',
      message: `callMain crashed: ${e instanceof Error ? e.message : String(e)}`,
      stderr: stderrBuffer.join('\n'),
    })
    return
  }

  if (exitCode !== 0) {
    postResponse({
      id: req.id, type: 'render-error',
      message: `OpenSCAD exited with code ${exitCode}`,
      stderr: stderrBuffer.join('\n'),
    })
    return
  }

  postResponse({ id: req.id, type: 'render-progress', phase: 'export' })

  let bytes: Uint8Array
  try {
    const raw = fs.readFile(outputPath, { encoding: 'binary' })
    bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw as ArrayBufferLike)
  } catch (e) {
    postResponse({
      id: req.id, type: 'render-error',
      message: `Failed to read STL: ${e instanceof Error ? e.message : String(e)}`,
      stderr: stderrBuffer.join('\n'),
    })
    return
  }

  const renderMs = performance.now() - start
  postResponse(
    { id: req.id, type: 'render-result', bytes, renderMs, stderr: stderrBuffer.join('\n') },
    [bytes.buffer],
  )
}

function postResponse(msg: WorkerResponse, transfer: Transferable[] = []): void {
  ;(self as unknown as DedicatedWorkerGlobalScope).postMessage(msg, transfer)
}

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  if (ev.data.type === 'render') void handleRender(ev.data)
}

postResponse({ id: 'boot', type: 'ready' })
