let worker: Worker | null = null
let requestId = 0
const pending = new Map<
  number,
  { resolve: (svg: string) => void; reject: (e: Error) => void }
>()

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(
    new URL('./dwgWorker.ts', import.meta.url),
    { type: 'module' },
  )
  worker.onmessage = (e: MessageEvent<{ id: number; svgText?: string; error?: string }>) => {
    const { id, svgText, error } = e.data
    const req = pending.get(id)
    if (!req) return
    pending.delete(id)
    if (error) req.reject(new Error(error))
    else req.resolve(svgText!)
  }
  worker.onerror = (e: ErrorEvent) => {
    for (const [, req] of pending) req.reject(new Error(e.message))
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
}

export async function dwgToSvg(buffer: ArrayBuffer): Promise<string> {
  const w = getWorker()
  return new Promise<string>((resolve, reject) => {
    const id = ++requestId
    pending.set(id, { resolve, reject })
    w.postMessage({ id, buffer }, [buffer])
  })
}
