import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { memCache, getCached, putCached, clearStepCache } from './stepCache'

function makeBuf(size: number): ArrayBuffer {
  return new ArrayBuffer(size)
}

describe('memCache', () => {
  afterEach(() => memCache.clear())

  it('is exported as a Map', () => {
    expect(memCache).toBeInstanceOf(Map)
  })

  it('stores and retrieves ArrayBuffers', () => {
    const buf = new ArrayBuffer(128)
    memCache.set('path|123', buf)
    expect(memCache.get('path|123')).toBe(buf)
  })

  it('delete removes entry', () => {
    memCache.set('a|1', new ArrayBuffer(10))
    memCache.set('b|2', new ArrayBuffer(20))
    memCache.delete('a|1')
    expect(memCache.has('a|1')).toBe(false)
    expect(memCache.has('b|2')).toBe(true)
  })

  it('clear removes all entries', () => {
    memCache.set('x|1', new ArrayBuffer(5))
    memCache.set('y|2', new ArrayBuffer(10))
    memCache.clear()
    expect(memCache.size).toBe(0)
  })

  it('overwrites existing key with new value', () => {
    const oldBuf = new ArrayBuffer(50)
    const newBuf = new ArrayBuffer(100)
    memCache.set('key|1', oldBuf)
    memCache.set('key|1', newBuf)
    expect(memCache.get('key|1')).toBe(newBuf)
    expect(memCache.size).toBe(1)
  })

  it('supports 100 unique keys', () => {
    for (let i = 0; i < 100; i++) {
      memCache.set(`file${i}.step|${i * 1000}`, new ArrayBuffer(i * 10))
    }
    for (let i = 0; i < 100; i++) {
      expect(memCache.get(`file${i}.step|${i * 1000}`)?.byteLength).toBe(i * 10)
    }
  })

  it('key format is normalizedPath|mtimeMs', () => {
    const key = 'C:/Users/test/Documents/model.step|1772808363923'
    memCache.set(key, new ArrayBuffer(8))
    expect(memCache.has(key)).toBe(true)
    expect(memCache.has('wrong-key')).toBe(false)
    expect(memCache.get('C:/Users/test/Documents/model.step|999')).toBeUndefined()
  })
})

describe('IndexedDB cache', () => {
  beforeEach(async () => {
    await clearStepCache()
  })

  afterEach(async () => {
    await clearStepCache()
  })

  describe('putCached + getCached', () => {
    it('returns null on cache miss', async () => {
      const result = await getCached('nonexistent|key')
      expect(result).toBeNull()
    })

    it('stores and retrieves a buffer', async () => {
      const key = 'C:/models/part.step|1234567890'
      const buf = makeBuf(256)
      await putCached(key, buf)

      const hit = await getCached(key)
      expect(hit).not.toBeNull()
      expect(hit!.byteLength).toBe(256)
    })

    it('overwrites existing key with new value', async () => {
      const key = 'C:/models/part.step|1111111111'
      await putCached(key, makeBuf(100))
      await putCached(key, makeBuf(200))

      const hit = await getCached(key)
      expect(hit!.byteLength).toBe(200)
    })

    it('distinguishes keys by path', async () => {
      await putCached('C:/a.step|1', makeBuf(10))
      await putCached('C:/b.step|1', makeBuf(20))

      expect((await getCached('C:/a.step|1'))!.byteLength).toBe(10)
      expect((await getCached('C:/b.step|1'))!.byteLength).toBe(20)
      expect(await getCached('C:/c.step|1')).toBeNull()
    })

    it('distinguishes keys by mtime', async () => {
      await putCached('C:/x.step|100', makeBuf(5))
      await putCached('C:/x.step|200', makeBuf(10))

      expect((await getCached('C:/x.step|100'))!.byteLength).toBe(5)
      expect((await getCached('C:/x.step|200'))!.byteLength).toBe(10)
    })

    it('stores many entries and retrieves each correctly', async () => {
      const entries: Array<{ key: string; size: number }> = []
      for (let i = 0; i < 50; i++) {
        const key = `C:/model${i}.step|${i * 100}`
        const size = (i + 1) * 10
        await putCached(key, makeBuf(size))
        entries.push({ key, size })
      }

      for (const { key, size } of entries) {
        const hit = await getCached(key)
        expect(hit!.byteLength).toBe(size)
      }
    })
  })

  describe('clearStepCache', () => {
    it('clears all IndexedDB entries', async () => {
      await putCached('k1|1', makeBuf(10))
      await putCached('k2|2', makeBuf(20))
      await putCached('k3|3', makeBuf(30))

      await clearStepCache()

      expect(await getCached('k1|1')).toBeNull()
      expect(await getCached('k2|2')).toBeNull()
      expect(await getCached('k3|3')).toBeNull()
    })

    it('clears memCache as well', async () => {
      memCache.set('mk1|1', makeBuf(10))
      memCache.set('mk2|2', makeBuf(20))

      await clearStepCache()

      expect(memCache.size).toBe(0)
    })

    it('is idempotent (safe to call on empty cache)', async () => {
      await clearStepCache()
      await clearStepCache()
      expect(memCache.size).toBe(0)
      expect(await getCached('anything|0')).toBeNull()
    })
  })
})

describe('two-layer cache integration', () => {
  beforeEach(async () => {
    await clearStepCache()
  })

  afterEach(async () => {
    await clearStepCache()
  })

  it('memCache hit skips IndexedDB entirely', async () => {
    const key = 'C:/test.step|999'
    const buf = makeBuf(42)
    memCache.set(key, buf)

    // Even though IDB has no such entry, memCache hit should return it
    const hit = memCache.get(key)
    expect(hit).toBe(buf)
    expect(await getCached(key)).toBeNull() // IDB doesn't have it
  })

  it('IDB hit can be promoted to memCache', async () => {
    const key = 'C:/test.step|888'
    const buf = makeBuf(64)
    await putCached(key, buf)

    // Simulate the promotion pattern from stepToGlbCached.ts
    const dbHit = await getCached(key)
    expect(dbHit!.byteLength).toBe(64)
    memCache.set(key, dbHit!)

    // Now memCache has it too
    expect(memCache.get(key)!.byteLength).toBe(64)
  })

  it('clearStepCache wipes both layers', async () => {
    memCache.set('m|1', makeBuf(1))
    await putCached('m|1', makeBuf(1))

    await clearStepCache()

    expect(memCache.size).toBe(0)
    expect(await getCached('m|1')).toBeNull()
  })
})
