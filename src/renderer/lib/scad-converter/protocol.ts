export type RenderFormat = 'stl'

export interface WorkerRequest {
  id: string
  type: 'render'
  source: string
  format: RenderFormat
}

export type WorkerResponse =
  | { id: string; type: 'render-progress'; phase: 'init' | 'compile' | 'export' }
  | { id: string; type: 'render-result'; bytes: Uint8Array; renderMs: number; stderr: string }
  | { id: string; type: 'render-error'; message: string; stderr: string }
  | { id: string; type: 'ready' }
