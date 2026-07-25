import { detectFormat, isStepFile, isIgesFile, isBrepFile, isFcstdFile } from '@/config/file-formats'
import { cacheKey, getThumbnail, putThumbnail } from './thumbnailCache'
import { generateThumbnail, generateSvgThumbnail, extractAndProcess3mfThumbnail, extractFcstdThumbnail } from './thumbnailGenerator'
import { getCached as getStepCached } from '@/lib/step-converter/stepCache'

export interface QueueFile {
  name: string
  path: string
  mtimeMs: number
}

export type ThumbnailCallback = (filePath: string, objectURL: string) => void
export type ThumbnailProgressCallback = (filePath: string) => void

const GAP_MS = 200
const GAP_MS_2D = 20
const GAP_MS_DXF = 50
/** Maximum times a file can time out before being marked as permanently failed. */
const MAX_RETRIES = 3
/** How many cache hits to serve in one batch before yielding the main thread. */
const CACHE_BATCH_SIZE = 20

/** Per-format work timeout. SVG/DXF thumbnails are fast (pure Canvas 2D);
 *  STEP needs OCCT WASM conversion; other 3D formats fall in between. */
function timeoutForFormat(format: string | null): number {
  if (format === 'svg' || format === 'dxf') return 3_000
  if (format === 'ifc') return 30_000
  if (isStepFile(format) || isIgesFile(format) || isBrepFile(format) || isFcstdFile(format)) return 60_000
  return 15_000 // stl, glb, 3mf, stp, unknown, …
}

/** Per-format gap between real-work items. SVG generates almost
 *  instantly so 20ms is enough to yield the main thread. DXF needs
 *  a quick SVG conversion step so 50ms is safer. 3D formats keep
 *  the original 200ms to avoid jank during WebGL renders. */
function gapForFormat(format: string | null): number {
  if (format === 'svg') return GAP_MS_2D
  if (format === 'dxf') return GAP_MS_DXF
  return GAP_MS
}

/** Multiplier applied to the per-format gap (1 = normal). Set <1 to
 *  accelerate the queue, e.g. 0.1 in fullscreen. */
let gapMultiplier = 1

/** Dynamically adjust the gap multiplier. Call from the UI layer when
 *  the user enters/leaves fullscreen thumbnail mode. */
export function setGapMultiplier(multiplier: number): void {
  gapMultiplier = multiplier
}

/** Tracks how many times each file has timed out in the current queue. */
const retryCount = new Map<string, number>()

let currentFiles: QueueFile[] = []
let visiblePaths = new Set<string>()
let priorityPaths = new Set<string>()
let queue: QueueFile[] = []
let processing = false
let abortFlag = false
let onReady: ThumbnailCallback | null = null
let onProcessing: ThumbnailProgressCallback | null = null
let idleCallbackId = 0
let timeoutId: ReturnType<typeof setTimeout> | null = null

function scheduleNext(): void {
  const interval = Math.round(gapMultiplier * GAP_MS)
  // When the multiplier is active (e.g. fullscreen) we need precise
  // control over the gap, so we skip requestIdleCallback and go
  // straight to setTimeout — otherwise the browser's idle scheduler
  // could ignore the shorter interval.
  if (gapMultiplier === 1 && typeof requestIdleCallback !== 'undefined') {
    idleCallbackId = requestIdleCallback(processNext, { timeout: interval })
  } else {
    timeoutId = setTimeout(processNext, interval)
  }
}

function cancelSchedule(): void {
  if (idleCallbackId) {
    cancelIdleCallback(idleCallbackId)
    idleCallbackId = 0
  }
  if (timeoutId !== null) {
    clearTimeout(timeoutId)
    timeoutId = null
  }
}

async function processNext(): Promise<void> {
  if (abortFlag || queue.length === 0) {
    processing = false
    return
  }

  if (document.hidden) {
    timeoutId = setTimeout(processNext, 1000)
    return
  }

  // Phase 1: drain all cache hits in a tight batch (no 200ms gap).
  // When the queue restarts on the same folder this restores 1,000+
  // cached thumbnails in ~1-2 seconds instead of 200+ seconds.
  let batchCount = 0
  while (
    !abortFlag &&
    queue.length > 0 &&
    batchCount < CACHE_BATCH_SIZE
  ) {
    const peek = queue[0]
    const peekKey = cacheKey(peek.path, peek.mtimeMs)
    const cached = await getThumbnail(peekKey)
    if (!cached) break // first cache miss stops the batch

    queue.shift() // consume
    onProcessing?.(peek.path)
    const url = URL.createObjectURL(cached)
    onReady?.(peek.path, url)
    batchCount++
  }

  if (abortFlag) {
    processing = false
    return
  }
  if (queue.length === 0) {
    processing = false
    return
  }

  // Phase 2: one real work item (file read + thumbnail generation).
  // Wrap in a per-format timeout so a single stuck file cannot block
  // the entire queue (3 s for SVG/DXF, 60 s for STEP, 15 s for others).
  const file = queue.shift()!
  const key = cacheKey(file.path, file.mtimeMs)
  const format = detectFormat(file.name)
  const workTimeout = timeoutForFormat(format)
  const gap = gapForFormat(format)

  onProcessing?.(file.path)

  const outcome = await Promise.race([
    (async (): Promise<'done' | 'failed'> => {
      try {
        const cached = await getThumbnail(key)
        if (cached && onReady) {
          const url = URL.createObjectURL(cached)
          onReady(file.path, url)
          return 'done'
        }
        if (!format) {
          onReady?.(file.path, '') // trigger re-render to clear spinner
          return 'done'
        }
        if (format === 'svg' || format === 'dxf') {
          const result = await window.electronAPI.readFile(file.path)
          if (result.success && result.data) {
            const text = new TextDecoder().decode(result.data)
            const svgText = format === 'dxf' ? (await (await import('@/lib/dxf-to-svg')).convertDxfToSvg(text)).svgText : text
            const blob = await generateSvgThumbnail(svgText)
            if (blob && onReady) {
              await putThumbnail(key, blob)
              const url = URL.createObjectURL(blob)
              onReady(file.path, url)
              return 'done'
            }
          }
          onReady?.(file.path, '')
          return 'done'
        }
        if (isStepFile(file.name) || isIgesFile(file.name) || isBrepFile(file.name)) {
          const stepCached = await getStepCached(key)
          if (stepCached) {
            const blob = await generateThumbnail(stepCached, 'glb')
            if (blob && onReady) {
              await putThumbnail(key, blob)
              const url = URL.createObjectURL(blob)
              onReady(file.path, url)
              return 'done'
            }
          }
          onReady?.(file.path, '')
          return 'done'
        }
        if (isFcstdFile(file.name)) {
          const result = await window.electronAPI.readFile(file.path)
          if (result.success && result.data) {
            const embeddedBlob = await extractFcstdThumbnail(result.data)
            if (embeddedBlob && onReady) {
              await putThumbnail(key, embeddedBlob)
              const url = URL.createObjectURL(embeddedBlob)
              onReady(file.path, url)
              return 'done'
            }
          }
          onReady?.(file.path, '') // no embedded thumbnail → placeholder, will be filled on file open
          return 'done'
        }
        if (format === '3mf') {
          const result = await window.electronAPI.readFile(file.path)
          if (result.success && result.data) {
            const embeddedBlob = await extractAndProcess3mfThumbnail(result.data)
            if (embeddedBlob && onReady) {
              await putThumbnail(key, embeddedBlob)
              const url = URL.createObjectURL(embeddedBlob)
              onReady(file.path, url)
              return 'done'
            }
            // Fall back to WebGL render
            const blob = await generateThumbnail(result.data, format)
            if (blob && onReady) {
              await putThumbnail(key, blob)
              const url = URL.createObjectURL(blob)
              onReady(file.path, url)
              return 'done'
            }
          }
          onReady?.(file.path, '')
          return 'done'
        }
        if (format === 'ifc') {
          const result = await window.electronAPI.readFile(file.path)
          if (result.success && result.data) {
            const blob = await generateThumbnail(result.data, format, file.path)
            if (blob && onReady) {
              await putThumbnail(key, blob)
              const url = URL.createObjectURL(blob)
              onReady(file.path, url)
              return 'done'
            }
          }
          onReady?.(file.path, '')
          return 'done'
        }
        // Other 3D formats (stl, glb, stp, …)
        const result = await window.electronAPI.readFile(file.path)
        if (result.success && result.data) {
          const blob = await generateThumbnail(result.data, format, file.path)
          if (blob && onReady) {
            await putThumbnail(key, blob)
            const url = URL.createObjectURL(blob)
            onReady(file.path, url)
            return 'done'
          }
        }
        onReady?.(file.path, '')
        return 'done'
      } catch (err) {
        console.warn('[thumbnailQueue] failed for', file.name, err)
        const tries = (retryCount.get(file.path) ?? 0) + 1
        retryCount.set(file.path, tries)
        if (tries >= MAX_RETRIES) {
          retryCount.delete(file.path)
          console.warn(
            `[thumbnailQueue] failed after ${MAX_RETRIES} attempts, giving up: ${file.name}`,
          )
          onReady?.(file.path, '') // permanent fail — stop spinner
        } else {
          console.warn(
            `[thumbnailQueue] failed (attempt ${tries}/${MAX_RETRIES}), requeuing: ${file.name}`,
          )
          // Requeue at the end so other files get a chance
          queue.push(file)
        }
        return 'failed'
      }
    })(),
    new Promise<'timeout'>((resolve) =>
      setTimeout(() => resolve('timeout'), workTimeout),
    ),
  ])

  if (outcome === 'timeout') {
    const tries = (retryCount.get(file.path) ?? 0) + 1
    retryCount.set(file.path, tries)
    if (tries >= MAX_RETRIES) {
      retryCount.delete(file.path)
      console.warn(
        `[thumbnailQueue] timeout after ${MAX_RETRIES} attempts, giving up: ${file.name}`,
      )
      onReady?.(file.path, '') // permanent fail — stop spinner
    } else {
      console.warn(
        `[thumbnailQueue] timeout (attempt ${tries}/${MAX_RETRIES}), requeuing: ${file.name}`,
      )
      // Requeue at the end so other files get a chance
      queue.push(file)
    }
  }

  // Per-format gap after real work (50 ms for fast SVG/DXF,
  // 200 ms for 3D formats).  Cache hits in Phase 1 need no gap.
  // gapMultiplier accelerates the queue in fullscreen mode.
  if (!abortFlag && queue.length > 0) {
    timeoutId = setTimeout(processNext, Math.round(gap * gapMultiplier))
  } else {
    processing = false
  }
}

export function startThumbnailQueue(
  files: QueueFile[],
  callback: ThumbnailCallback,
  progressCallback?: ThumbnailProgressCallback,
): void {
  // If the file list hasn't changed and a queue is already running,
  // just update the callbacks and visibility ordering — no need to
  // abort in-flight work or rebuild the queue from scratch.
  const newKeys = new Set(files.map((f) => `${f.path}|${Math.trunc(f.mtimeMs)}`))
  const oldKeys = new Set(
    currentFiles.map((f) => `${f.path}|${Math.trunc(f.mtimeMs)}`),
  )
  const sameFiles =
    newKeys.size === oldKeys.size &&
    [...newKeys].every((k) => oldKeys.has(k))

  if (sameFiles && processing) {
    onReady = callback
    onProcessing = progressCallback ?? null
    updateVisibleFiles(visiblePaths)
    return
  }

  abortFlag = true
  cancelSchedule()
  retryCount.clear()
  currentFiles = [...files]
  onReady = callback
  onProcessing = progressCallback ?? null

  // Wait a tick for any in-flight process to stop
  setTimeout(() => {
    abortFlag = false
    rebuildQueue()
  }, 50)
}

export function stopThumbnailQueue(): void {
  abortFlag = true
  cancelSchedule()
  retryCount.clear()
  currentFiles = []
  visiblePaths.clear()
  priorityPaths.clear()
  queue = []
  processing = false
  onReady = null
  onProcessing = null
}

export function updateVisibleFiles(visiblePaths_: Set<string>): void {
  visiblePaths = visiblePaths_
  if (processing) {
    // Reorder existing queue: priority > visible > hidden
    const priority: QueueFile[] = []
    const visible: QueueFile[] = []
    const hidden: QueueFile[] = []
    for (const f of queue) {
      if (priorityPaths.has(f.path)) priority.push(f)
      else if (visiblePaths.has(f.path)) visible.push(f)
      else hidden.push(f)
    }
    queue = [...priority, ...visible, ...hidden]
  } else {
    rebuildQueue()
  }
}

function rebuildQueue(): void {
  if (currentFiles.length === 0) return

  const priority: QueueFile[] = []
  const visible: QueueFile[] = []
  const hidden: QueueFile[] = []

  for (const f of currentFiles) {
    if (priorityPaths.has(f.path)) priority.push(f)
    else if (visiblePaths.has(f.path)) visible.push(f)
    else hidden.push(f)
  }

  queue = [...priority, ...visible, ...hidden]

  if (!processing && queue.length > 0) {
    processing = true
    scheduleNext()
  }
}

export function setPriorityPaths(paths: Set<string>): void {
  priorityPaths = new Set(paths)
  if (processing) {
    // Reorder existing queue: priority > visible > hidden
    const priority: QueueFile[] = []
    const visible: QueueFile[] = []
    const hidden: QueueFile[] = []
    for (const f of queue) {
      if (priorityPaths.has(f.path)) priority.push(f)
      else if (visiblePaths.has(f.path)) visible.push(f)
      else hidden.push(f)
    }
    queue = [...priority, ...visible, ...hidden]
  } else {
    rebuildQueue()
  }
}
