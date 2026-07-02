/// <reference lib="webworker" />

const DWG_CDN_URL = 'https://cdn.jsdelivr.net/npm/@mlightcad/libredwg-web@0.7.7/dist/libredwg-web.js'

interface WorkerRequest {
  id: number
  buffer: ArrayBuffer
}

interface WorkerResponse {
  id: number
  svgText?: string
  error?: string
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { id, buffer } = e.data

  try {
    const { LibreDwg, Dwg_File_Type } = await import(/* @vite-ignore */ DWG_CDN_URL)

    const libredwg = await LibreDwg.create()

    const dwg_ptr = libredwg.dwg_read_data(buffer, Dwg_File_Type.DWG)

    const db = libredwg.convert(dwg_ptr)

    libredwg.dwg_free(dwg_ptr)

    const svgText = libredwg.dwg_to_svg(db)

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
