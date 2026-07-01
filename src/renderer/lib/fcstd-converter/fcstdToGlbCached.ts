import { fcstdToGlb } from './fcstdToGlb'
import type { StepToGlbOptions } from '@/lib/step-converter/stepToGlb'
import { getCached, putCached, memCache } from '@/lib/step-converter/stepCache'

export async function fcstdToGlbCached(
  fcstdBuffer: ArrayBuffer,
  fileInfo: { filePath: string; mtimeMs: number },
  options: StepToGlbOptions = {},
): Promise<{ buffer: ArrayBuffer; cached: boolean }> {
  const key = `fcstd:${fileInfo.filePath.replace(/\\/g, '/')}|${Math.trunc(fileInfo.mtimeMs)}`

  const memHit = memCache.get(key)
  if (memHit) {
    return { buffer: memHit, cached: true }
  }

  try {
    const dbHit = await getCached(key)
    if (dbHit) {
      memCache.set(key, dbHit)
      return { buffer: dbHit, cached: true }
    }
  } catch { /* best-effort */ }

  const { buffer: glbBuffer } = await fcstdToGlb(fcstdBuffer, options)

  memCache.set(key, glbBuffer)
  try { await putCached(key, glbBuffer) } catch { /* best-effort */ }

  return { buffer: glbBuffer, cached: false }
}
