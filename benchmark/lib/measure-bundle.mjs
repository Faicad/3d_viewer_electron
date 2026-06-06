/**
 * Bundle size measurement.
 * Analyzes the renderer build output (out/renderer/assets/) and reports
 * per-chunk sizes, total JS payload, and Three.js loader distribution.
 *
 * Usage:  node benchmark/lib/measure-bundle.mjs [--json]
 */

import { readFileSync, readdirSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '..', '..')
const ASSETS_DIR = join(PROJECT_ROOT, 'out', 'renderer', 'assets')

const LOADER_NAMES = [
  'STLLoader', 'GLTFLoader', 'ThreeMFLoader', 'OBJLoader', 'PLYLoader',
  'FBXLoader', 'ColladaLoader', 'TDSLoader', 'USDZLoader', 'DRACOLoader',
  'KTX2Loader', 'BVHLoader', 'VTKLoader', 'XYZLoader', 'PDBLoader',
  'NRRDLoader', 'GCodeLoader', 'VRMLLoader', 'VOXLoader', 'KMZLoader',
  'AMFLoader', 'LWOLoader', 'MD2Loader', 'PCDLoader', 'Rhino3dmLoader',
  '3DMLoader', 'HDRLoader', 'RGBELoader',
]

export function loadBuildManifest() {
  return readFileSync(join(PROJECT_ROOT, 'out', 'renderer', '.vite', 'manifest.json'), 'utf-8')
}

export function measureBundle() {
  let totalSizeBytes = 0
  const chunks = []

  const files = readdirSync(ASSETS_DIR)
    .filter(f => f.endsWith('.js'))
    .sort((a, b) => statSync(join(ASSETS_DIR, b)).size - statSync(join(ASSETS_DIR, a)).size)

  for (const file of files) {
    const filePath = join(ASSETS_DIR, file)
    const sizeBytes = statSync(filePath).size
    totalSizeBytes += sizeBytes
    const content = readFileSync(filePath, 'utf8')
    const loadersFound = LOADER_NAMES.filter(l => content.includes(l))

    chunks.push({
      file,
      sizeBytes,
      sizeKB: Math.round(sizeBytes / 1024),
      loaders: loadersFound,
      /* classDefs: actual class definitions (false positive filter) */
      hasClassDefs: LOADER_NAMES.some(l => content.includes('class ' + l)),
    })
  }

  // Determine initial chunks (loaded by index.html directly)
  const htmlPath = join(PROJECT_ROOT, 'out', 'renderer', 'index.html')
  const html = readFileSync(htmlPath, 'utf8')
  const scriptTags = [...html.matchAll(/src="\.\/assets\/([^"]+)"/g)].map(m => m[1])

  const initialChunks = chunks.filter(c => scriptTags.some(tag => c.file === tag))
  const initialSizeBytes = initialChunks.reduce((sum, c) => sum + c.sizeBytes, 0)
  const dynamicChunks = chunks.filter(c => !scriptTags.some(tag => c.file === tag))
  const dynamicSizeBytes = dynamicChunks.reduce((sum, c) => sum + c.sizeBytes, 0)

  return {
    totalSizeBytes,
    totalSizeKB: Math.round(totalSizeBytes / 1024),
    totalSizeMB: +(totalSizeBytes / 1024 / 1024).toFixed(2),
    initialSizeBytes,
    initialSizeKB: Math.round(initialSizeBytes / 1024),
    dynamicSizeBytes,
    dynamicSizeKB: Math.round(dynamicSizeBytes / 1024),
    initialChunks: initialChunks.map(c => ({
      file: c.file,
      sizeKB: c.sizeKB,
      loaderRefCount: c.loaders.length,
    })),
    dynamicChunks: dynamicChunks.map(c => ({
      file: c.file,
      sizeKB: c.sizeKB,
      loaders: c.loaders,
    })),
    chunkCount: chunks.length,
  }
}

// CLI usage
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = measureBundle()

  console.log('='.repeat(50))
  console.log('BUNDLE SIZE ANALYSIS')
  console.log('='.repeat(50))
  console.log(`Initial chunks  : ${result.initialSizeKB} KB (${(result.initialSizeKB/1024).toFixed(2)} MB)`)
  console.log(`Dynamic chunks  : ${result.dynamicSizeKB} KB (${(result.dynamicSizeKB/1024).toFixed(2)} MB)`)
  console.log(`Total JS        : ${result.totalSizeKB} KB (${result.totalSizeMB.toFixed(2)} MB)`)
  console.log(`Chunk count     : ${result.chunkCount}`)
  console.log('')

  console.log(`--- Initial chunks (${result.initialChunks.length}) ---`)
  for (const c of result.initialChunks) {
    console.log(`  ${c.file}  ${c.sizeKB} KB  loader refs: ${c.loaderRefCount}`)
  }
  console.log('')
  console.log(`--- Dynamic chunks (${result.dynamicChunks.length}) ---`)
  for (const c of result.dynamicChunks) {
    console.log(`  ${c.file}  ${c.sizeKB} KB  loaders: ${c.loaders.join(', ') || '-none-'}`)
  }

  if (process.argv.includes('--json')) {
    process.stdout.write('\n' + JSON.stringify(result, null, 2))
  }
}
