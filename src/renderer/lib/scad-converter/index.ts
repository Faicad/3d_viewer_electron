/**
 * SCAD → STL converter entry point.
 *
 * Internal pipeline:
 *   SCAD code → Web Worker (openscad-wasm) → STL ArrayBuffer
 *
 * callMain is single-shot (WASM state corrupts on reuse), so each call
 * spawns a fresh Worker. JS/WASM are browser-cached — respawn is ~400-800ms.
 */

import { getScadWorkerClient, type ProgressPhase } from './worker-client'

export type { ProgressPhase } from './worker-client'

export interface ScadToStlResult {
  stlBuffer: ArrayBuffer
  triangleCount: number
  renderMs: number
}

const RENDER_TIMEOUT_MS = 60_000

/**
 * Compile OpenSCAD source code to STL ArrayBuffer.
 *
 * @param code         OpenSCAD source code
 * @param onProgress   Optional callback: 'init' | 'compile' | 'export'
 * @returns STL buffer + metadata
 * @throws Error on compilation failure, timeout, or empty output
 *
 * @example
 * const { stlBuffer } = await scadToStl('cube(10);')
 */
export async function scadToStl(
  code: string,
  onProgress?: (phase: ProgressPhase) => void,
): Promise<ScadToStlResult> {
  const client = getScadWorkerClient()

  let settled = false

  const outcome = await Promise.race([
    client.render(code, onProgress),
    new Promise<{ ok: false; message: string; stderr: string; aborted: true }>((resolve) => {
      setTimeout(() => {
        if (!settled) {
          client.cancel()
          resolve({
            ok: false,
            message: `OpenSCAD compilation timed out (${RENDER_TIMEOUT_MS / 1000}s)`,
            stderr: '',
            aborted: true,
          })
        }
      }, RENDER_TIMEOUT_MS)
    }),
  ])

  settled = true

  if (!outcome.ok) {
    throw new Error(outcome.stderr || outcome.message)
  }

  // Copy STL buffer (prevent detachment issues after Worker transfer)
  const stlBuffer = outcome.bytes.buffer.slice(
    outcome.bytes.byteOffset,
    outcome.bytes.byteOffset + outcome.bytes.byteLength,
  )

  // Read triangle count from STL binary header (offset 80, uint32 LE)
  const triangleCount = stlBuffer.byteLength >= 84
    ? new DataView(stlBuffer).getUint32(80, true)
    : 0

  if (triangleCount === 0) {
    throw new Error('Generated model contains no geometry')
  }

  return { stlBuffer, triangleCount, renderMs: outcome.renderMs }
}
