const DB_NAME = 'step-glb-cache'
const DB_VERSION = 1
const STORE_NAME = 'buffers'

let dbPromise: Promise<IDBDatabase> | null = null

function openCache(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return dbPromise
}

export async function getCached(hash: string): Promise<ArrayBuffer | null> {
  try {
    const db = await openCache()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const request = tx.objectStore(STORE_NAME).get(hash)
      request.onsuccess = () => resolve(request.result ?? null)
      request.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

export async function putCached(hash: string, buffer: ArrayBuffer): Promise<void> {
  try {
    const db = await openCache()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(buffer, hash)
  } catch {
    // Fire-and-forget: don't block on cache write failures
  }
}

export async function deleteCached(hash: string): Promise<void> {
  try {
    const db = await openCache()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(hash)
  } catch {
    // No-op on failure
  }
}
