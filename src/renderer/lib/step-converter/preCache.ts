import { buildGlbFromResult, type StepToGlbOptions } from './stepToGlb'
import { convertInWorker } from './stepWorkerPool'
import { getCached, putCached } from './stepCache'
import { decompressStpz } from './stepCompress'
import { isStepFile, isIgesFile, isBrepFile, MAX_STEP_FILE_SIZE } from '@/config/file-formats'
import type { CadFormat } from './occtLoader'

const memCache = new Map<string, ArrayBuffer>()

function cacheKey(filePath: string, mtimeMs: number): string {
  const normalizedPath = filePath.replace(/\\/g, '/')
  const normalizedTime = Math.trunc(mtimeMs)
  return `${normalizedPath}|${normalizedTime}`
}

export function addToPreCache(key: string, buffer: ArrayBuffer): void {
  memCache.set(key, buffer)
}

export function isPreCached(key: string): boolean {
  return memCache.has(key)
}

let preCacheRunning = false
let preCacheAbort = false

export function stopPreCache(): void {
  preCacheAbort = true
}

export async function startPreCache(
  files: { name: string; path: string; mtimeMs: number }[],
  wasmPath: string,
): Promise<void> {
  if (preCacheRunning) return
  preCacheRunning = true
  preCacheAbort = false

  const cadFiles = files.filter(f => isStepFile(f.name) || isIgesFile(f.name) || isBrepFile(f.name))

  console.log('[preCache] scanning', cadFiles.length, 'CAD file(s) for pre-caching')

  for (const file of cadFiles) {
    if (preCacheAbort) break

    const key = cacheKey(file.path, file.mtimeMs)
    if (memCache.has(key)) continue

    try {
      const dbHit = await getCached(key)
      if (dbHit) {
        memCache.set(key, dbHit)
        console.log('[preCache] IndexedDB hit, skipping:', file.name)
        continue
      }
    } catch {
      // IndexedDB unavailable, proceed with conversion
    }

    try {
      const result = await window.electronAPI.readFile(file.path)
      if (!result.success || !result.data) {
        console.warn('[preCache] failed to read file:', file.name, result.error)
        continue
      }

      if (preCacheAbort) break

      let buffer = result.data
      // Decompress STPZ before caching
      if (file.name.toLowerCase().endsWith('.stpz')) {
        const decompressed = decompressStpz(buffer)
        if (decompressed.byteLength > MAX_STEP_FILE_SIZE) {
          console.warn('[preCache] STPZ decompressed size exceeds limit:', file.name)
          continue
        }
        buffer = decompressed
      }

      const cadFormat: CadFormat = isIgesFile(file.name) ? 'iges' : isBrepFile(file.name) ? 'brep' : 'step'
      console.log('[preCache] converting:', file.name)
      const importResult = await convertInWorker(key, buffer, null, 'precache', cadFormat)

      const glbBuffer = buildGlbFromResult(importResult, {
        wasmPath,
        includeSelectorTopology: true,
      } as StepToGlbOptions)

      memCache.set(key, glbBuffer)
      try { await putCached(key, glbBuffer) } catch { /* best-effort */ }
      console.log('[preCache] cached:', file.name, `(${(glbBuffer.byteLength / 1024).toFixed(0)}KB)`)
    } catch (err) {
      if (preCacheAbort) break
      console.warn('[preCache] failed for', file.name + ':', err)
    }
  }

  preCacheRunning = false
  console.log('[preCache] done')
}
