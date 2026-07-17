/**
 * Workaround: ThreeMFLoader's internal `build()` function always does
 * `target.substring(1)` to strip the leading '/' from the `.rels` Target,
 * but some 3MF files (e.g. Auger.3mf) omit it — causing a look-up on a
 * wrong key and throwing "Cannot read properties of undefined (reading 'build')".
 *
 * This function wraps ThreeMFLoader.parse() and temporarily patches
 * DOMParser to ensure every Relationship Target in the .rels XML starts
 * with '/', so the substring(1) works correctly. There is zero overhead
 * for files that already have the leading '/'.
 */
import * as THREE from 'three'

export function parse3mf<R extends { parse(b: ArrayBuffer): THREE.Group }>(
  loader: R,
  buffer: ArrayBuffer,
): THREE.Group {
  const orig = DOMParser.prototype.parseFromString

  DOMParser.prototype.parseFromString = function (
    this: DOMParser,
    str: string,
    type: string,
  ): Document {
    // Only patch the .rels XML (contains Relationship and Target attributes)
    if (str.includes('Relationship') && str.includes('Target=')) {
      str = str.replace(/Target="([^/])/g, 'Target="/$1')
    }
    return orig.call(this, str, type as DOMParserSupportedType)
  } as typeof DOMParser.prototype.parseFromString

  try {
    return loader.parse(buffer)
  } finally {
    DOMParser.prototype.parseFromString = orig
  }
}