/**
 * MaterialProxyRegistry — singleton that manages the lifecycle of MaterialProxy
 * instances, keyed by override key (fileId:partId).
 *
 * Responsibilities:
 * 1. Create proxies when source materials are loaded (ModelGroup)
 * 2. Sync store overrides → proxy overrides
 * 3. Provide proxies for reading (MaterialEditor, ViewportContainer)
 * 4. Clean up proxies when files are unloaded
 */

import * as THREE from 'three'
import type { MaterialAppearance } from './types'
import { MaterialProxy } from './MaterialProxy'

export class MaterialProxyRegistry {
  private _proxies = new Map<string, MaterialProxy>()

  /**
   * Register a source material for an override key.
   *
   * Called during model loading (ModelGroup processes glbMeshes).
   * Disposes any existing proxy for the same key.
   */
  register(
    key: string,
    sourceMaterial: THREE.Material,
  ): MaterialProxy {
    const existing = this._proxies.get(key)
    if (existing) existing.dispose()

    const proxy = new MaterialProxy(sourceMaterial, key)
    this._proxies.set(key, proxy)
    return proxy
  }

  /** Remove all proxies whose key starts with the given fileId prefix. */
  unregisterFile(fileId: string): void {
    const prefix = `${fileId}:`
    // Collect keys first to avoid mutation during iteration
    const keys: string[] = []
    for (const key of this._proxies.keys()) {
      if (key.startsWith(prefix)) keys.push(key)
    }
    for (const key of keys) {
      const proxy = this._proxies.get(key)
      if (proxy) {
        proxy.dispose()
        this._proxies.delete(key)
      }
    }
  }

  /** Get a proxy by key. */
  get(key: string): MaterialProxy | undefined {
    return this._proxies.get(key)
  }

  /** Check if a proxy exists for the given key. */
  has(key: string): boolean {
    return this._proxies.has(key)
  }

  /** Number of registered proxies. */
  get size(): number {
    return this._proxies.size
  }

  /**
   * Apply MaterialAppearance overrides from the store to a proxy.
   * Called when the store's materialOverrides change (ModelGroup effect).
   */
  applyStoreOverrides(
    key: string,
    overrides: Partial<MaterialAppearance>,
  ): void {
    const proxy = this._proxies.get(key)
    if (!proxy) return
    proxy.applyBatch(overrides)
  }

  /** Reset all overrides for a key (restore to source). */
  resetOverrides(key: string): void {
    const proxy = this._proxies.get(key)
    if (!proxy) return
    proxy.reset()
  }

  /** Dispose all proxies. */
  disposeAll(): void {
    for (const proxy of this._proxies.values()) proxy.dispose()
    this._proxies.clear()
  }
}

// ---- Global singleton ----

let _registry: MaterialProxyRegistry | null = null

export function getMaterialProxyRegistry(): MaterialProxyRegistry {
  if (!_registry) _registry = new MaterialProxyRegistry()
  return _registry
}

/** For test isolation: dispose the global registry. */
export function disposeMaterialProxyRegistry(): void {
  _registry?.disposeAll()
  _registry = null
}
