/// <reference lib="webworker" />

const DWG_CDN_URL = 'https://cdn.jsdelivr.net/npm/@mlightcad/libredwg-web@0.7.7/dist/libredwg-web.js'

interface WorkerRequest {
  id: number
  buffer: ArrayBuffer
}

interface ProgressPayload {
  message: string
  percentage: number
}

interface WorkerResponse {
  id: number
  svgText?: string
  error?: string
  progress?: ProgressPayload
}

function postProgress(id: number, message: string, percentage: number): void {
  ;(self as unknown as DedicatedWorkerGlobalScope).postMessage({
    id,
    progress: { message, percentage },
  })
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { id, buffer } = e.data

  try {
    const { LibreDwg, Dwg_File_Type } = await import(/* @vite-ignore */ DWG_CDN_URL)
    postProgress(id, 'Initializing DWG engine...', 20)

    const libredwg = await LibreDwg.create()
    postProgress(id, 'Parsing DWG file...', 45)

    const dwg_ptr = libredwg.dwg_read_data(buffer, Dwg_File_Type.DWG)
    postProgress(id, 'Reading DWG data...', 65)

    const db = libredwg.convert(dwg_ptr)
    postProgress(id, 'Generating SVG...', 85)

    libredwg.dwg_free(dwg_ptr)

    const svgText = libredwg.dwg_to_svg(db)
    postProgress(id, 'Finishing...', 95)

    const response: WorkerResponse = { id, svgText }
    ;(self as unknown as DedicatedWorkerGlobalScope).postMessage(response)
  } catch (e) {
    const response: WorkerResponse = {
      id,
      error: e instanceof Error ? e.message : String(e),
    }
    ;(self as unknown as DedicatedWorkerGlobalScope).postMessage(response)
  }
}
