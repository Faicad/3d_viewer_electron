import { unzipSync, zipSync } from 'three/examples/jsm/libs/fflate.module.js'

export function decompressStpz(buffer: ArrayBuffer | Uint8Array): Uint8Array {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  const unzipped = unzipSync(bytes)
  const stepKey = Object.keys(unzipped).find(
    (k) => k.toLowerCase().endsWith('.stp') || k.toLowerCase().endsWith('.step'),
  )
  if (!stepKey) {
    throw new Error('No STEP file found in STPZ archive')
  }
  return unzipped[stepKey]
}

export function compressStep(buffer: ArrayBuffer | Uint8Array): Uint8Array {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  return zipSync({ 'model.stp': bytes })
}
