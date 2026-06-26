/**
 * Test: unloadModel + moveModelToScreenNdc with file target.
 * Run:  node movies/tests/test-unloadModel.mjs
 *
 * Starts viewer server + model server, loads two models,
 * verifies per-file unload doesn't affect remaining files,
 * and that path matching works with movie-style paths.
 */
import { chromium } from 'playwright'
import { createServer } from 'http'
import { readFileSync, existsSync, statSync } from 'fs'
import { join, extname, dirname } from 'path'
import { fileURLToPath } from 'url'
import * as lib from '../lib.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..', '..')
const distDir = join(rootDir, 'dist')

const MIME_MAP = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.glb': 'model/gltf-binary',
  '.stl': 'application/sla',
  '.png': 'image/png',
}

function createStaticServer(root, port) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let filePath = join(root, req.url.split('?')[0])
      try {
        const stat = statSync(filePath)
        if (stat.isDirectory()) filePath = join(filePath, 'index.html')
      } catch { filePath = join(root, 'index.html') }
      if (!existsSync(filePath)) { res.writeHead(404); res.end(); return }
      const ext = extname(filePath)
      res.writeHead(200, {
        'Content-Type': MIME_MAP[ext] || 'application/octet-stream',
        'Access-Control-Allow-Origin': '*',
      })
      res.end(readFileSync(filePath))
    })
    server.listen(port, () => resolve(server))
  })
}

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exit(1) }
  console.log('  ✓', msg)
}

async function main() {
  const VIEWER_PORT = 4180
  const MODEL_PORT = lib.MODEL_PORT

  const viewerServer = await createStaticServer(distDir, VIEWER_PORT)
  const modelServer = await createStaticServer(rootDir, MODEL_PORT)

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  page.on('console', msg => {
    if (msg.type() === 'error') console.log('[browser:error]', msg.text())
  })

  try {
    const modelPath = 'src/test/fixtures/cube_output.glb'
    const glbUrl = `http://localhost:${MODEL_PORT}/${modelPath}`
    const url = `http://localhost:${VIEWER_PORT}/#/workspace?url=${encodeURIComponent(glbUrl)}&AutoRotate=0`

    // ── 1. Open viewer with first model ──
    console.log('1. Open viewer with first model...')
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForFunction(() => !!window.__modelStore, { timeout: 15000 })
    await page.waitForFunction(() => window.__modelStore.getState().loadedFiles.length > 0, { timeout: 15000 })
    await page.waitForTimeout(2000)

    let files = await page.evaluate(() => window.__modelStore.getState().loadedFiles.map(f => ({ id: f.id, filePath: f.filePath, fileName: f.fileName, partCount: f.glbPartInfos.length })))
    assert(files.length === 1, `1 file loaded: ${files[0].fileName} (${files[0].partCount} parts)`)
    assert(files[0].filePath === 'cube_output.glb', `filePath is filename-only: ${files[0].filePath}`)

    // ── 2. Append second model via lib.loadModel ──
    console.log('2. Load second model (append)...')
    await lib.loadModel(page, modelPath, { resetCanvas: false })
    await page.waitForTimeout(3000)

    files = await page.evaluate(() => window.__modelStore.getState().loadedFiles.map(f => ({ id: f.id, filePath: f.filePath, fileName: f.fileName })))
    assert(files.length === 2, `2 files loaded: ${files.map(f => f.fileName).join(', ')}`)

    // ── 3. Verify modelGroupMap is populated ──
    const groupMapSize = await page.evaluate(() => window.__modelGroupMap?.size ?? -1)
    assert(groupMapSize === 2, `modelGroupMap has ${groupMapSize} entries`)

    // ── 4. Unload first file using movie-style path (with '/' in it) ──
    console.log('3. Unload first file...')
    await lib.unloadModel(page, modelPath, { duration: 300 })
    await page.waitForTimeout(500)

    files = await page.evaluate(() => window.__modelStore.getState().loadedFiles.map(f => ({ id: f.id, filePath: f.filePath, fileName: f.fileName })))
    assert(files.length === 1, `1 file remaining after unload`)

    // ── 5. Verify remaining file's materials are visible (opacity === 1.0) ──
    const allOpaque = await page.evaluate(() => {
      const state = window.__modelStore.getState()
      const file = state.loadedFiles[0]
      if (!file) return false
      const group = window.__modelGroupMap?.get(file.id)
      if (!group) return false
      let ok = true
      group.traverse(obj => {
        if (obj.isMesh && obj.material) {
          const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
          materials.forEach(m => { if (m.opacity !== 1.0) ok = false })
        }
      })
      return ok
    })
    assert(allOpaque, 'remaining file materials opacity=1.0 (visible)')

    // ── 6. Test: unload by filename-only (no path separator) ──
    console.log('4. Reload both and test filename-only unload...')
    await lib.loadModel(page, modelPath, { resetCanvas: false })
    await page.waitForTimeout(3000)
    files = await page.evaluate(() => window.__modelStore.getState().loadedFiles.map(f => ({ id: f.id, filePath: f.filePath, fileName: f.fileName })))
    assert(files.length === 2, `2 files loaded after reload`)

    // Use only the filename (no path prefix) — should match the first file's filePath
    await lib.unloadModel(page, 'cube_output.glb', { duration: 300 })
    await page.waitForTimeout(500)
    files = await page.evaluate(() => window.__modelStore.getState().loadedFiles.map(f => ({ id: f.id, filePath: f.filePath, fileName: f.fileName })))
    assert(files.length === 1, `1 remaining after filename-only unload`)

    // ── 7. Test: unload all (no target) ──
    console.log('5. Unload all...')
    await lib.unloadModel(page)
    await page.waitForTimeout(1500)
    files = await page.evaluate(() => window.__modelStore.getState().loadedFiles)
    assert(files.length === 0, `0 files after clear all`)

    console.log('\n✓ ALL TESTS PASSED')
  } finally {
    await browser.close()
    viewerServer.close()
    modelServer.close()
  }
}

main().catch(err => {
  console.error('Test failed:', err.message)
  process.exit(1)
})
