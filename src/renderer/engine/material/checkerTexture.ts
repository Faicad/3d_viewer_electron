import * as THREE from 'three'

const CHECKER_SIZE = 512
const GRID = 8
const CELL = CHECKER_SIZE / GRID

let _cached: THREE.CanvasTexture | null = null

export function createCheckerTexture(): THREE.CanvasTexture {
  if (_cached) return _cached

  const canvas = document.createElement('canvas')
  canvas.width = CHECKER_SIZE
  canvas.height = CHECKER_SIZE
  const ctx = canvas.getContext('2d')!

  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      const x = col * CELL
      const y = row * CELL
      ctx.fillStyle = (row + col) % 2 === 0 ? '#ffffff' : '#cccccc'
      ctx.fillRect(x, y, CELL, CELL)

      const num = row * GRID + col + 1
      ctx.fillStyle = '#333333'
      ctx.font = `bold ${Math.round(CELL * 0.35)}px monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(num), x + CELL / 2, y + CELL / 2)
    }
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.generateMipmaps = true
  tex.needsUpdate = true

  _cached = tex
  return tex
}

let _dataUri: string | null = null

export function getCheckerDataUri(): string {
  if (!_dataUri) {
    const tex = createCheckerTexture()
    _dataUri = tex.image instanceof HTMLCanvasElement
      ? (tex.image as HTMLCanvasElement).toDataURL('image/png')
      : ''
  }
  return _dataUri
}

export function disposeCheckerTexture(): void {
  if (_cached) {
    _cached.dispose()
    _cached = null
  }
  _dataUri = null
}
