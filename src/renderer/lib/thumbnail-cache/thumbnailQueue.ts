import { detectFormat } from '@/config/file-formats'
import { cacheKey, getThumbnail, putThumbnail } from './thumbnailCache'
import { generateThumbnail, generateSvgThumbnail, extractAndProcess3mfThumbnail } from './thumbnailGenerator'
import { getCached as getStepCached } from '@/lib/step-converter/stepCache'
import { convertDxfToSvg } from '@/lib/dxf-to-svg'

export interface QueueFile {
  name: string
  path: string
  mtimeMs: number
}

export type ThumbnailCallback = (filePath: string, objectURL: string) => void
export type ThumbnailProgressCallback = (filePath: string) => void

const GAP_MS = 200

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
  if (typeof requestIdleCallback !== 'undefined') {
    idleCallbackId = requestIdleCallback(processNext, { timeout: 1000 })
  } else {
    timeoutId = setTimeout(processNext, GAP_MS)
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

const CACHE_BATCH_SIZE = 20

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
  const file = queue.shift()!
  const key = cacheKey(file.path, file.mtimeMs)

  onProcessing?.(file.path)

  try {
    const cached = await getThumbnail(key)
    if (cached && onReady) {
      const url = URL.createObjectURL(cached)
      onReady(file.path, url)
    } else {
      const format = detectFormat(file.name)
      if (!format) {
        onReady?.(file.path, '') // trigger re-render to clear spinner
      } else if (format === 'svg' || format === 'dxf') {
        const result = await window.electronAPI.readFile(file.path)
        if (result.success && result.data) {
          const text = new TextDecoder().decode(result.data)
          const svgText = format === 'dxf' ? (await convertDxfToSvg(text)).svgText : text
          const blob = await generateSvgThumbnail(svgText)
          if (blob && onReady) {
            await putThumbnail(key, blob)
            const url = URL.createObjectURL(blob)
            onReady(file.path, url)
          } else {
            onReady?.(file.path, '')
          }
        } else {
          onReady?.(file.path, '')
        }
      } else if (format === 'step') {
        // For STEP files, wait for pre-cache to finish
        const stepCached = await getStepCached(key)
        if (stepCached) {
          const blob = await generateThumbnail(stepCached, 'glb')
          if (blob && onReady) {
            await putThumbnail(key, blob)
            const url = URL.createObjectURL(blob)
            onReady(file.path, url)
          } else {
            onReady?.(file.path, '')
          }
        } else {
          onReady?.(file.path, '')
        }
      } else if (format === '3mf') {
        // 3MF: try embedded thumbnail first (fast — no geometry parsing)
        const result = await window.electronAPI.readFile(file.path)
        if (result.success && result.data) {
          const embeddedBlob = await extractAndProcess3mfThumbnail(result.data)
          if (embeddedBlob && onReady) {
            await putThumbnail(key, embeddedBlob)
            const url = URL.createObjectURL(embeddedBlob)
            onReady(file.path, url)
          } else {
            // Fall back to WebGL render
            const blob = await generateThumbnail(result.data, format)
            if (blob && onReady) {
              await putThumbnail(key, blob)
              const url = URL.createObjectURL(blob)
              onReady(file.path, url)
            } else {
              onReady?.(file.path, '')
            }
          }
        } else {
          onReady?.(file.path, '')
        }
      } else {
        const result = await window.electronAPI.readFile(file.path)
        if (result.success && result.data) {
          const blob = await generateThumbnail(result.data, format)
          if (blob && onReady) {
            await putThumbnail(key, blob)
            const url = URL.createObjectURL(blob)
            onReady(file.path, url)
          } else {
            onReady?.(file.path, '')
          }
        } else {
          onReady?.(file.path, '')
        }
      }
    }
  } catch (err) {
    console.warn('[thumbnailQueue] failed for', file.name, err)
    onReady?.(file.path, '')
  }

  // Only delay after real work — cache hits were already served
  // without any artificial gap.
  if (!abortFlag && queue.length > 0) {
    timeoutId = setTimeout(processNext, GAP_MS)
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
