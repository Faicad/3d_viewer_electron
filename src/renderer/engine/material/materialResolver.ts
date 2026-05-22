import * as THREE from 'three'
import type { MaterialAppearance } from './types'
import { MATERIAL_PRESETS, getPreset } from './presets'
import { MaterialFactory } from './MaterialFactory'

const BUILTIN_PREFIX = 'builtin:'

let _defaultFactory: MaterialFactory | undefined

function defaultFactory(): MaterialFactory {
  if (!_defaultFactory) _defaultFactory = new MaterialFactory()
  return _defaultFactory
}

/**
 * Resolve a material descriptor to a `MeshPhysicalMaterial`.
 *
 * Descriptors:
 * - `"builtin:<presetId>"` — look up `MATERIAL_PRESETS[presetId]`
 * - `MaterialAppearance` — pass directly to `MaterialFactory`
 * - RGB array `[r,g,b]` — create a simple coloured material
 * - Plain string — try as preset key, then as a hex colour, fall back to grey
 */
export function resolveMaterial(
  descriptor: string | [number, number, number] | MaterialAppearance,
  factory?: MaterialFactory,
): THREE.MeshPhysicalMaterial {
  const f = factory ?? defaultFactory()

  if (typeof descriptor === 'string') {
    if (descriptor.startsWith(BUILTIN_PREFIX)) {
      const presetId = descriptor.slice(BUILTIN_PREFIX.length)
      const preset = getPreset(presetId)
      if (preset) return f.createMaterial(preset)
      return f.createMaterial(MATERIAL_PRESETS.concrete)
    }

    // Try as preset key
    const preset = getPreset(descriptor)
    if (preset) return f.createMaterial(preset)

    // Try as hex colour
    if (/^#[0-9a-fA-F]{6}$/.test(descriptor)) {
      const r = parseInt(descriptor.slice(1, 3), 16) / 255
      const g = parseInt(descriptor.slice(3, 5), 16) / 255
      const b = parseInt(descriptor.slice(5, 7), 16) / 255
      return f.createMaterial({
        name: descriptor,
        color: [r, g, b],
        roughness: 0.5,
        metalness: 0.0,
      })
    }

    // Fallback — unknown string
    return f.createMaterial(MATERIAL_PRESETS.concrete)
  }

  if (Array.isArray(descriptor)) {
    const [r, g, b] = descriptor
    return f.createMaterial({
      name: `rgb(${r},${g},${b})`,
      color: [r, g, b],
      roughness: 0.5,
      metalness: 0.0,
    })
  }

  return f.createMaterial(descriptor)
}

/**
 * Release the global default factory (for test isolation).
 * After calling this, the next `resolveMaterial` call creates a fresh factory.
 */
export function resetDefaultFactory(): void {
  if (_defaultFactory) {
    _defaultFactory.dispose()
    _defaultFactory = undefined
  }
}
