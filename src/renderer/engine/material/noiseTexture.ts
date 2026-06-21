import * as THREE from 'three'

const SIZE = 512
const GRID = 6

let _cached: THREE.DataTexture | null = null

function hash(x: number, y: number): number {
  let h = x * 374761393 + y * 668265263
  h = (h ^ (h >> 13)) * 1274126177
  return ((h ^ (h >> 16)) & 0x7fffffff) / 0x7fffffff
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t)
}

function valueNoise(x: number, y: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy

  const sx = smoothstep(fx)
  const sy = smoothstep(fy)

  const v00 = hash(ix, iy)
  const v10 = hash(ix + 1, iy)
  const v01 = hash(ix, iy + 1)
  const v11 = hash(ix + 1, iy + 1)

  const v0 = v00 + (v10 - v00) * sx
  const v1 = v01 + (v11 - v01) * sx
  return v0 + (v1 - v0) * sy
}

function fbm(x: number, y: number, octaves: number): number {
  let value = 0
  let amplitude = 1
  let frequency = 1
  let maxVal = 0
  for (let i = 0; i < octaves; i++) {
    value += amplitude * valueNoise(x * frequency, y * frequency)
    maxVal += amplitude
    amplitude *= 0.5
    frequency *= 2
  }
  return value / maxVal
}

export function createNoiseTexture(): THREE.DataTexture {
  if (_cached) return _cached

  const data = new Uint8Array(SIZE * SIZE * 4)

  for (let py = 0; py < SIZE; py++) {
    for (let px = 0; px < SIZE; px++) {
      const u = (px / SIZE) * GRID
      const v = (py / SIZE) * GRID
      const n = fbm(u, v, 3)
      const gray = Math.round(230 + (n - 0.5) * 50)
      const idx = (py * SIZE + px) * 4
      data[idx] = gray
      data[idx + 1] = gray
      data[idx + 2] = gray
      data[idx + 3] = 255
    }
  }

  const tex = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat, THREE.UnsignedByteType)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(3, 3)
  tex.colorSpace = THREE.LinearSRGBColorSpace
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.generateMipmaps = true
  tex.needsUpdate = true

  _cached = tex
  return tex
}

export function disposeNoiseTexture(): void {
  if (_cached) {
    _cached.dispose()
    _cached = null
  }
}
