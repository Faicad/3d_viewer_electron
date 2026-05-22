import * as THREE from 'three'
import type { LoaderResult } from '@/engine/formatLoaders'

interface CacheEntry {
  result: LoaderResult
  refCount: number
}

const cache = new Map<string, CacheEntry>()

// Module-level guard to prevent ModelGroup from re-loading the same file when
// R3F remounts the component (which bypasses per-instance useRef guards).
const loadedOnce = new Set<string>()

export function markLoaded(fileId: string, buffer: ArrayBuffer): boolean {
  const key = `${fileId}|${buffer.byteLength}`
  if (loadedOnce.has(key)) return false // already loaded
  loadedOnce.add(key)
  return true
}

export function clearLoaded(fileId: string): void {
  for (const key of loadedOnce) {
    if (key.startsWith(fileId)) loadedOnce.delete(key)
  }
}

export function setCachedResult(fileId: string, result: LoaderResult): void {
  const prev = cache.get(fileId)
  if (prev) disposeResult(prev.result)
  cache.set(fileId, { result, refCount: 1 })
}

export function getCachedResult(fileId: string): LoaderResult | undefined {
  return cache.get(fileId)?.result
}

export function retainResult(fileId: string): void {
  const entry = cache.get(fileId)
  if (entry) entry.refCount++
}

export function releaseResult(fileId: string): void {
  const entry = cache.get(fileId)
  if (!entry) return
  entry.refCount--
  if (entry.refCount <= 0) {
    disposeResult(entry.result)
    cache.delete(fileId)
  }
}

export function clearAllResults(): void {
  for (const [, entry] of cache) {
    disposeResult(entry.result)
  }
  cache.clear()
}

function disposeResult(result: LoaderResult): void {
  for (const mesh of result.meshes) {
    mesh.geometry?.dispose()
    const mat = mesh.material
    if (Array.isArray(mat)) {
      for (const m of mat) m.dispose()
    } else {
      mat?.dispose()
    }
  }
  for (const obj of result.objects) {
    const m = obj as THREE.Mesh
    m.geometry?.dispose()
    const mat = m.material
    if (Array.isArray(mat)) {
      for (const mt of mat) mt.dispose()
    } else {
      mat?.dispose()
    }
  }
}
