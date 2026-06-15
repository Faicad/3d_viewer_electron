import { chromium } from 'playwright'
import { createServer } from 'http'
import { readFileSync, existsSync, mkdirSync, rmSync, readdirSync } from 'fs'
import { join, extname, dirname, basename, relative, resolve } from 'path'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'


const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
export const moviesDir = __dirname
export const rootDir = join(__dirname, '..')
export const distDir = join(rootDir, 'out', 'renderer')
export const fixtureDir = join(rootDir, 'src', 'test', 'fixtures')

mkdirSync(moviesDir, { recursive: true })

const MIME_MAP = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.glb': 'model/gltf-binary',
  '.png': 'image/png',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.hdr': 'image/vnd.radiance',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
}

function createStaticServer(root, port) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const urlPath = req.url.split('?')[0]
      const filePath = join(root, urlPath === '/' ? 'index.html' : urlPath)
      if (!existsSync(filePath)) {
        res.writeHead(404)
        res.end()
        return
      }
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

const VIEWER_PORT = 4178
const MODEL_PORT = 4179
export const MOVIE_PORT = 4180

export const ORIENTATIONS = [
  { width: 1920, height: 1080, suffix: '_h' },
  { width: 1080, height: 1920, suffix: '_v' },
]

function cleanup(scriptName, dir = moviesDir) {
  if (!existsSync(dir)) return
  for (const f of readdirSync(dir)) {
    if (f.startsWith(scriptName) && f.endsWith('.webm')) {
      try { rmSync(join(dir, f), { force: true }) } catch {}
    }
  }
}

export function waitForModel(page) {
  return page.waitForFunction(() => {
    const s = window.__modelStore?.getState()
    return s?.loadedFiles?.length >= 1
      && !s?.loadingState?.isVisible
      && s?.glbPartInfos?.length > 0
  }, { timeout: 30000 })
}

export function zoomUI(page, factor = 1.5) {
  return page.evaluate((f) => {
    const header = document.querySelector('header')
    if (header) header.style.zoom = String(f)
    const overlay = document.querySelector('div[style*="z-index: 10"]')
    if (overlay) overlay.style.zoom = String(f)
  }, factor)
}

/** 标准录制开场：zoomUI → waitForModel → 计算 trimStart */
export async function startRecording(page, tPageOpen) {
  await zoomUI(page)
  await waitForModel(page)
  return (Date.now() - tPageOpen) / 1000
}

/** Dispatch a CustomEvent on window */
export function dispatchEvent(page, name) {
  return page.evaluate((n) => window.dispatchEvent(new CustomEvent(n)), name)
}

/** Animate camera — proxy to window.__animateCamera(opts) */
export function animateCamera(page, opts) {
  return page.evaluate((o) => window.__animateCamera(o), opts)
}

/** Call a browser-side demo function by name (e.g. 'GSAPExplode' -> window.__demoGSAPExplode?.()) */
export function callDemo(page, name) {
  return page.evaluate((n) => window[`__demo${n}`]?.(), name)
}

/** Click an element by its id */
export function clickById(page, id) {
  return page.evaluate((id) => document.getElementById(id)?.click(), id)
}

/** Set a <select> element's value and fire its change event */
export function setSelectValue(page, id, value) {
  return page.evaluate(({ id, val }) => {
    const el = document.getElementById(id)
    if (el) { el.value = val; el.dispatchEvent(new Event('change')) }
  }, { id, val: value })
}

/** Post a 3d-viewer command (fire-and-forget) */
export function postMessage(page, { id, command, params }) {
  return page.evaluate((m) => window.postMessage(m, '*'), { type: '3d-viewer', ...{ id, command, params } })
}

/** Post a 3d-viewer command and wait for a matching response */
export function postMessageAndWait(page, { id, command, params, expectedCommand, timeout = 5000 }) {
  return page.evaluate(async ({ id, command, params, expectedCommand, timeout }) => {
    return new Promise((resolve, reject) => {
      const handler = (e) => {
        if (e.data?.type === '3d-viewer' && e.data.command === expectedCommand && e.data.status) {
          window.removeEventListener('message', handler)
          resolve(e.data)
        }
      }
      window.addEventListener('message', handler)
      window.postMessage({ type: '3d-viewer', id, command, params }, '*')
      setTimeout(() => {
        window.removeEventListener('message', handler)
        reject(new Error(`${command} timeout`))
      }, timeout)
    })
  }, { id, command, params, expectedCommand, timeout })
}

export async function recordOne(browser, viewerUrl, viewport, suffix, pageFn, recordDir = moviesDir) {
  const context = await browser.newContext({
    viewport,
    recordVideo: { dir: recordDir, size: viewport },
  })
  const page = await context.newPage()
  page.on('console', msg => {
    if (msg.type() === 'error') console.log('[browser:error]', msg.text())
  })

  const tPageOpen = Date.now()
  console.log(`[${suffix}] Navigating...`)
  await page.goto(viewerUrl, { waitUntil: 'networkidle', timeout: 30000 })

  const trimStart = await startRecording(page, tPageOpen)
  await pageFn(page, suffix, tPageOpen)
  const rawPath = await page.video()?.path()
  await context.close()
  return { rawPath, trimStart }
}

export async function makeMovie(scriptUrl, modelPath, viewerParams, pageFn, trimDuration, outputDir) {
  const scriptName = basename(fileURLToPath(scriptUrl), '.mjs')
  const outDir = outputDir || join(dirname(fileURLToPath(scriptUrl)), 'gen')
  mkdirSync(outDir, { recursive: true })
  cleanup(scriptName, outDir)

  const viewerServer = await createStaticServer(distDir, VIEWER_PORT)
  const modelServer = await createStaticServer(rootDir, MODEL_PORT)
  const movieServer = await createStaticServer(moviesDir, MOVIE_PORT)

  const MODEL_URL = `http://localhost:${MODEL_PORT}/${modelPath}`
  const params = new URLSearchParams({ url: MODEL_URL, movie_mode: '1', ...viewerParams })
  const VIEWER_URL = `http://localhost:${VIEWER_PORT}/#/workspace?${params.toString()}`

  console.log(`Viewer: ${VIEWER_URL}`)
  console.log(`Model:  ${MODEL_URL}`)

  const browser = await chromium.launch({ headless: false })
  const results = []

  for (const { width, height, suffix } of ORIENTATIONS) {
    try {
      const result = await recordOne(browser, VIEWER_URL, { width, height }, suffix, pageFn, outDir)
      result.suffix = suffix
      results.push(result)
    } catch (err) {
      console.error(`[${suffix}] Failed:`, err.message)
    }
  }

  await browser.close()
  viewerServer.close()
  modelServer.close()
  movieServer.close()

  for (const { suffix, rawPath, trimStart } of results) {
    if (!rawPath || !existsSync(rawPath)) {
      console.error(`[${suffix}] No recorded video found`)
      continue
    }
    const outputVideo = join(outDir, `${scriptName}${suffix}.webm`)
    console.log(`[${suffix}] Trimming (start=${trimStart.toFixed(1)}s, duration=${trimDuration}s)...`)
    const r = spawnSync('ffmpeg', [
      '-y',
      '-ss', trimStart.toFixed(2),
      '-i', rawPath,
      '-t', String(trimDuration),
      '-c:v', 'libvpx-vp9',
      '-b:v', '8M',
      '-pix_fmt', 'yuv420p',
      outputVideo,
    ], { stdio: 'pipe' })
    if (r.status === 0) {
      const mb = existsSync(outputVideo) ? (readFileSync(outputVideo).length / 1024 / 1024).toFixed(2) : '?'
      console.log(`Video saved: ${outputVideo} (${mb} MB)`)
      if (existsSync(rawPath)) rmSync(rawPath)
    } else {
      console.error(`FFmpeg trim failed for ${suffix}:`, r.stderr.toString().slice(0, 1000))
    }
  }

  console.log('Done!')
}

// ──────────────────────────────────────────────
// renderVideo — 核心渲染：scale+pad + ASS 字幕 + 混音
// ──────────────────────────────────────────────

function probe(path) {
  const r = spawnSync('ffprobe', [
    '-v', 'quiet', '-print_format', 'json',
    '-show_streams', '-show_format', path,
  ], { stdio: 'pipe', timeout: 15000 })
  if (r.status !== 0) return null
  return JSON.parse(r.stdout.toString())
}

function hasAudio(path) {
  const info = probe(path)
  return !!info?.streams?.some(s => s.codec_type === 'audio')
}

function clipExists(path) {
  try {
    return existsSync(path) && readFileSync(path).length > 0
  } catch { return false }
}

/**
 * Render video: scale+pad clips, burn ASS subtitles, mix audio.
 *
 * audioVoice — TTS 配音（音量 1.0）
 * audioBg    — 背景音乐（音量 0.5）
 * 二者至少提供一个即有音轨。同时提供时自动混音。
 */
export function renderVideo({ clips, assPath, assRel, audioVoice, audioBg, output, targetW, targetH, fps }) {
  const existing = clips.filter(clipExists)
  if (existing.length === 0) {
    console.error('  No input files found, skipping')
    return false
  }

  const hasVoice = audioVoice && clipExists(audioVoice)
  const hasBg = audioBg && clipExists(audioBg)

  const extraInputs = []
  if (hasVoice) extraInputs.push(audioVoice)
  if (hasBg) extraInputs.push(audioBg)
  const allInputs = [...existing, ...extraInputs]

  const filterParts = []

  const videoLabels = existing.map((_, i) => `v${i}`)
  for (let i = 0; i < existing.length; i++) {
    filterParts.push(
      `[${i}:v]scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease,`
      + `pad=${targetW}:${targetH}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps}[${videoLabels[i]}]`
    )
  }
  const concatV = `[${videoLabels.join('][')}]concat=n=${existing.length}:v=1:a=0[rawv]`
  filterParts.push(concatV)

  filterParts.push(`[rawv]ass='${assRel}'[finalv]`)

  const audioSources = []
  for (let i = 0; i < existing.length; i++) {
    if (hasAudio(existing[i])) {
      const lbl = `ca${audioSources.length}`
      filterParts.push(`[${i}:a]aresample=48000[${lbl}]`)
      audioSources.push(lbl)
    }
  }
  if (hasVoice) {
    const voiceIdx = existing.length
    const lbl = 'voice'
    filterParts.push(`[${voiceIdx}:a]volume=1.0,aresample=48000[${lbl}]`)
    audioSources.push(lbl)
  }
  if (hasBg) {
    const bgIdx = existing.length + (hasVoice ? 1 : 0)
    const lbl = 'bg'
    filterParts.push(`[${bgIdx}:a]volume=0.5,aresample=48000[${lbl}]`)
    audioSources.push(lbl)
  }

  let audioFilterEnd = null
  if (audioSources.length > 0) {
    const mixInput = audioSources.map(l => `[${l}]`).join('')
    const method = audioSources.length === 1 ? 'anull' : `amix=inputs=${audioSources.length}:duration=first`
    filterParts.push(`${mixInput}${method}[outa]`)
    audioFilterEnd = 'outa'
  }

  const filterComplex = filterParts.join(';')

  const args = ['-y', ...allInputs.flatMap(f => ['-i', f]),
    '-filter_complex', filterComplex,
    '-map', '[finalv]',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
    '-pix_fmt', 'yuv420p',
  ]
  if (audioFilterEnd) {
    args.push('-map', `[${audioFilterEnd}]`, '-c:a', 'aac', '-b:a', '192k')
  }
  if (hasBg) args.push('-shortest')
  args.push('-movflags', '+faststart', output)

  console.log(`  Inputs: ${existing.join(', ')}`)
  if (hasVoice) console.log(`  AudioVoice: ${audioVoice}`)
  if (hasBg) console.log(`  AudioBg: ${audioBg}`)
  if (audioFilterEnd) console.log(`  Audio: ${audioSources.length} source(s)`)
  console.log(`  Output: ${output}`)

  const r = spawnSync('ffmpeg', args, { stdio: 'pipe', timeout: 300000 })
  const errStr = r.stderr.toString()
  if (r.status === 0) {
    console.log(`  Saved: ${output} (${(readFileSync(output).length / 1024 / 1024).toFixed(2)} MB)`)
    return true
  } else {
    const errLines = errStr.split('\n')
    console.error(`  FFmpeg exit code ${r.status}, last stderr lines:`)
    console.error(errLines.slice(-10).join('\n'))
    return false
  }
}

const DEFAULT_BGM = join(moviesDir, 'alex-productions-acoustic-folk-friends.wav')

/**
 * burnVideo — 烧录单个视频（字幕+音频），按约定推导路径。
 *
 * 约定（相对于 CWD）：
 *   subtitle:  {scriptDir}/{scriptName}.ass
 *   video:     {genDir}/{scriptName}_{h|v}.webm
 *   audioVoice:{genDir}/{scriptName}.mp3
 *   audioBg:   {moviesDir}/alex-productions-acoustic-folk-friends.wav
 *   output:    {genDir}/{scriptName}_burn_{h|v}.mp4
 */
export function burnVideo(scriptUrl, genDir) {
  const scriptName = basename(fileURLToPath(scriptUrl), '.mjs')
  const scriptDir = dirname(fileURLToPath(scriptUrl))
  const cwd = process.cwd()
  const rel = (p) => relative(cwd, p).replace(/\\/g, '/')
  const assRel = rel(join(scriptDir, `${scriptName}.ass`))
  const assPath = resolve(scriptDir, `${scriptName}.ass`)
  const audioVoice = rel(join(genDir, `${scriptName}.mp3`))
  const audioBg = rel(DEFAULT_BGM)

  for (const { width, height, suffix } of ORIENTATIONS) {
    const clip = rel(join(genDir, `${scriptName}${suffix}.webm`))
    const output = rel(join(genDir, `${scriptName}_burn${suffix}.mp4`))
    console.log(`\n=== ${width}×${height} ===`)
    renderVideo({ clips: [clip], audioVoice, audioBg, assPath, assRel, output, targetW: width, targetH: height, fps: 25 })
  }
  console.log('\nDone!')
}
