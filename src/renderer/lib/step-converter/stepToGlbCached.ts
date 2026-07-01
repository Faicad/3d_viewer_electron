import { buildGlbFromResult, type StepToGlbOptions } from './stepToGlb'
import { convertInWorker, type OcctImportResult } from './stepWorkerPool'
import { getCached, putCached, memCache } from './stepCache'
import type { CadFormat } from './occtLoader'
export { clearStepCache } from './stepCache'

function cacheKey(filePath: string, mtimeMs: number): string {
  const normalizedPath = filePath.replace(/\\/g, '/')
  const normalizedTime = Math.trunc(mtimeMs)
  const key = `${normalizedPath}|${normalizedTime}`
  console.log('[stepToGlbCached] key built:', JSON.stringify({
    rawPath: filePath,
    rawMtimeMs: mtimeMs,
    rawMtimeType: typeof mtimeMs,
    normalizedPath,
    normalizedTime,
  }))
  return key
}

function cadProgressLabel(cadFormat: CadFormat): string {
  switch (cadFormat) {
    case 'iges': return 'IGES'
    case 'brep': return 'BREP'
    default: return 'STEP'
  }
}

export async function stepToGlbCached(
  stepData: ArrayBuffer | Uint8Array,
  fileInfo: { filePath: string; mtimeMs: number },
  options: StepToGlbOptions = {},
  onProgress?: (msg: string, pct: number) => void,
): Promise<{ buffer: ArrayBuffer; cached: boolean }> {
  const cadFormat = options.cadFormat || 'step'
  const fmtLabel = cadProgressLabel(cadFormat)
  const key = cacheKey(fileInfo.filePath, fileInfo.mtimeMs)
  const startTime = performance.now()

  // 1. In-memory cache (instant for repeat loads within session)
  const memHit = memCache.get(key)
  if (memHit) {
    console.log('[stepToGlbCached] memory hit:', key, `(${memCache.size} entries in cache)`)
    onProgress?.('Cache hit — loading scene...', 80)
    return { buffer: memHit, cached: true }
  }

  // 2. IndexedDB cache (persistent across restarts)
  try {
    const dbHit = await getCached(key)
    if (dbHit) {
      console.log('[stepToGlbCached] IndexedDB hit:', key, `size=${dbHit.byteLength}`)
      memCache.set(key, dbHit)
      onProgress?.('Cache hit — loading scene...', 80)
      return { buffer: dbHit, cached: true }
    }
  } catch (err) {
    console.warn('[stepToGlbCached] IndexedDB lookup failed:', err)
  }

  // 3. Worker conversion: CAD → mesh in worker → buildGlb on main thread
  console.log('[stepToGlbCached] miss, starting worker conversion:', key)
  onProgress?.(`Converting ${fmtLabel} geometry...`, 5)
  const stepBuffer = stepData instanceof ArrayBuffer ? stepData : stepData.buffer.slice(0)
  let importResult: OcctImportResult
  try {
    importResult = await convertInWorker(key, stepBuffer, null, 'user', cadFormat)
  } catch (e) {
    console.error('[stepToGlbCached] worker conversion failed:', e)
    throw e
  }

  onProgress?.('Building GLB geometry...', 60)
  const buffer = buildGlbFromResult(importResult, options, onProgress)
  const elapsed = ((performance.now() - startTime) / 1000).toFixed(1)
  console.log(`[stepToGlbCached] conversion done in ${elapsed}s, size=${buffer.byteLength}`)

  memCache.set(key, buffer)
  // Persist to IndexedDB for cross-restart cache hits
  try {
    await putCached(key, buffer)
    console.log('[stepToGlbCached] persisted to IndexedDB:', key)
  } catch (err) {
    console.warn('[stepToGlbCached] IndexedDB write failed:', err)
  }

  return { buffer, cached: false }
}
