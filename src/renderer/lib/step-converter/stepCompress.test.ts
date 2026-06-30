/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest'
import { decompressStpz, compressStep } from './stepCompress'
import { zipSync } from 'three/examples/jsm/libs/fflate.module.js'

const STEP_HEADER = new Uint8Array([
  0x49, 0x53, 0x4F, 0x2D, 0x31, 0x30, 0x33, 0x30, 0x33, 0x2D, 0x32, 0x31,
  0x3B, 0x0A, 0x48, 0x45, 0x41, 0x44, 0x45, 0x52, 0x0A,
])

describe('decompressStpz / compressStep', () => {
  it('compress then decompress yields identical data', () => {
    const compressed = compressStep(STEP_HEADER)
    const decompressed = decompressStpz(compressed)
    expect(new Uint8Array(decompressed)).toEqual(STEP_HEADER)
  })

  it('compressed data starts with PK ZIP magic', () => {
    const compressed = compressStep(STEP_HEADER)
    expect(compressed[0]).toBe(0x50)
    expect(compressed[1]).toBe(0x4B)
  })

  it('compressed data is smaller than original', () => {
    const large = new Uint8Array(4096)
    for (let i = 0; i < large.length; i++) {
      large[i] = i % 256
    }
    const compressed = compressStep(large)
    expect(compressed.length).toBeLessThan(large.length)
  })

  it('handles ArrayBuffer input', () => {
    const compressed = compressStep(STEP_HEADER.buffer)
    const decompressed = decompressStpz(compressed)
    expect(new Uint8Array(decompressed)).toEqual(STEP_HEADER)
  })

  it('handles empty buffer', () => {
    const empty = new Uint8Array(0)
    const compressed = compressStep(empty)
    const decompressed = decompressStpz(compressed)
    expect(decompressed.length).toBe(0)
  })

  it('throws on invalid ZIP data', () => {
    const invalid = new Uint8Array([0, 1, 2, 3])
    expect(() => decompressStpz(invalid)).toThrow()
  })

  it('throws on valid ZIP without STEP entry', () => {
    const noStepZip = zipSync({ 'readme.txt': new Uint8Array([1, 2, 3]) })
    expect(() => decompressStpz(noStepZip)).toThrow('No STEP file found')
  })
})
