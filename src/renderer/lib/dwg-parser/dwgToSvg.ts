let worker: Worker | null = null
let requestId = 0
const pending = new Map<
  number,
  { resolve: (svg: string) => void; reject: (e: Error) => void }
>()
const progressCallbacks = new Map<
  number,
  (message: string, percentage: number) => void
>()

interface ProgressPayload {
  message: string
  percentage: number
}

interface WorkerMessage {
  id: number
  svgText?: string
  error?: string
  progress?: ProgressPayload
}

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(
    new URL('./dwgWorker.ts', import.meta.url),
    { type: 'module' },
  )
  worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
    const { id, svgText, error, progress } = e.data
    if (progress) {
      const cb = progressCallbacks.get(id)
      cb?.(progress.message, progress.percentage)
      return
    }
    const req = pending.get(id)
    if (!req) return
    pending.delete(id)
    progressCallbacks.delete(id)
    if (error) req.reject(new Error(error))
    else req.resolve(svgText!)
  }
  worker.onerror = (e: ErrorEvent) => {
    for (const [id, req] of pending) {
      req.reject(new Error(e.message))
      progressCallbacks.delete(id)
    }
    pending.clear()
    worker?.terminate()
    worker = null
  }
  return worker
}

export function __resetWorkerForTest(): void {
  worker?.terminate()
  worker = null
  pending.clear()
  progressCallbacks.clear()
}

export async function dwgToSvg(
  buffer: ArrayBuffer,
  onProgress?: (message: string, percentage: number) => void,
): Promise<string> {
  const w = getWorker()
  return new Promise<string>((resolve, reject) => {
    const id = ++requestId
    pending.set(id, { resolve, reject })
    if (onProgress) {
      progressCallbacks.set(id, onProgress)
    }
    w.postMessage({ id, buffer }, [buffer])
  })
}
