export const STEP_CACHE_DB_NAME = 'step-glb-cache'
export const STEP_CACHE_DB_VERSION = 2
export const STORE_NAME = 'buffers'

export const memCache = new Map<string, ArrayBuffer>()

let dbPromise: Promise<IDBDatabase> | null = null

function openCache(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(STEP_CACHE_DB_NAME, STEP_CACHE_DB_VERSION)
    request.onupgradeneeded = () => {
      if (request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.deleteObjectStore(STORE_NAME)
      }
      request.result.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return dbPromise
}

export async function getCached(key: string): Promise<ArrayBuffer | null> {
  try {
    const db = await openCache()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const request = tx.objectStore(STORE_NAME).get(key)
      request.onsuccess = () => resolve(request.result ?? null)
      request.onerror = () => resolve(null)
    })
  } catch (e) {
    if (import.meta.env.DEV) throw e
    return null
  }
}

export async function putCached(key: string, buffer: ArrayBuffer): Promise<void> {
  const db = await openCache()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(buffer, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export async function clearStepCache(): Promise<void> {
  try {
    const db = await openCache()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } catch (err) {
    console.warn('[clearStepCache] IndexedDB clear failed:', err)
    if (import.meta.env.DEV) throw err
  }
  memCache.clear()
  console.log('[clearStepCache] Done')
}
