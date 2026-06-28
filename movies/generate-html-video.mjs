import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, renameSync, readdirSync, copyFileSync, statSync } from 'fs'
import { resolve, dirname, basename, extname, join } from 'path'
import { spawnSync } from 'child_process'
import { pathToFileURL, fileURLToPath } from 'url'
import { chromium } from 'playwright'
import * as lib from './lib.mjs'
import { generateSubtitle, parseSubtitleLines, INITIAL_GAP, INTER_LINE_GAP, DEFAULT_TTS_PROVIDER } from './generate-subtitle.mjs'

// ── Helpers (reused from generate-image-video.mjs) ──

function naturalCompare(a, b) {
  const split = (s) => (s.match(/(\d+|\D+)/g) || []).map(p => /^\d+$/.test(p) ? parseInt(p, 10) : p)
  const ca = split(a), cb = split(b)
  for (let i = 0; i < Math.min(ca.length, cb.length); i++) {
    if (ca[i] !== cb[i]) {
      if (typeof ca[i] === 'number' && typeof cb[i] === 'number') return ca[i] - cb[i]
      if (typeof ca[i] === 'string' && typeof cb[i] === 'string') return ca[i] < cb[i] ? -1 : 1
      return typeof ca[i] === 'number' ? -1 : 1
    }
  }
  return ca.length - cb.length
}

function stripOrientation(name, suffix) { return name.replaceAll(suffix, '') }

function isMarked(netName) { return /_marked_\d+\.png$/.test(netName) }

function getMarkedNumber(netName) {
  const m = netName.match(/_marked_(\d+)\.png$/)
  return m ? parseInt(m[1], 10) : 0
}

function scanOrientationImages(basePath, suffix) {
  const dirPath = dirname(basePath)
  const baseName = basename(basePath)
  let allFiles
  try { allFiles = readdirSync(dirPath).filter(f => f.endsWith('.png')) }
  catch { return [] }
  const matched = allFiles.filter(f => f.startsWith(baseName) && f.includes(suffix))
  const groups = new Map()
  for (const f of matched) {
    const net = stripOrientation(f, suffix)
    if (isMarked(net)) {
      const groupKey = net.replace(/_marked_\d+\.png$/, '.png')
      if (!groups.has(groupKey)) groups.set(groupKey, { baseFile: null, markedFiles: [] })
      groups.get(groupKey).markedFiles.push(f)
    } else {
      const groupKey = net
      if (!groups.has(groupKey)) groups.set(groupKey, { baseFile: null, markedFiles: [] })
      groups.get(groupKey).baseFile = f
    }
  }
  const sortedKeys = [...groups.keys()].sort(naturalCompare)
  const result = []
  for (const key of sortedKeys) {
    const g = groups.get(key)
    if (g.baseFile) result.push(join(dirPath, g.baseFile))
    g.markedFiles.sort((a, b) => getMarkedNumber(stripOrientation(a, suffix)) - getMarkedNumber(stripOrientation(b, suffix)))
      .forEach(f => result.push(join(dirPath, f)))
  }
  return result
}

function parseImageBase(scriptPath) {
  const src = readFileSync(scriptPath, 'utf-8')
  const m = src.match(/(?:^|\n)const\s+image\s*=\s*['"]([^'"]+)['"]\s*;?\s*\n/)
  return m ? m[1] : null
}

function parseScriptConfig(scriptPath) {
  const src = readFileSync(scriptPath, 'utf-8')
  const m = src.match(/(?:^|\n)\s*const\s+config\s*=\s*(\[[\s\S]*?\])\s*;?\s*(?:\n|$)/)
  if (!m) return []
  try { return (0, eval)(m[1]) } catch { return [] }
}

// ── Main ──

async function generateHyperVideo(scriptPath) {
  const scriptDir = dirname(scriptPath)
  const scriptName = basename(scriptPath, '.mjs')
  const genDir = join(scriptDir, 'gen')

  console.log(`Script: ${basename(scriptPath)}`)

  mkdirSync(genDir, { recursive: true })

  const noTts = process.argv.slice(2).includes('--no-tts')
  const force = process.argv.slice(2).includes('-f') || process.argv.slice(2).includes('--force')
  const ttsArgIndex = process.argv.slice(2).indexOf('--tts')
  const ttsProvider = ttsArgIndex >= 0 ? process.argv.slice(2)[ttsArgIndex + 1] : DEFAULT_TTS_PROVIDER

  // 1. Generate subtitle + audio
  let segments, imageDurations
  if (noTts) {
    const subtitlePath = join(genDir, `${scriptName}.subtitle`)
    const audioPath = join(genDir, `${scriptName}.mp3`)
    if (!existsSync(subtitlePath) || !existsSync(audioPath)) {
      console.error(`\n--no-tts: subtitle or audio not found in ${genDir}/`)
      process.exit(1)
    }
    const data = JSON.parse(readFileSync(subtitlePath, 'utf-8'))
    const entries = data.segments[0].entries
    const round2 = (v) => Math.round(v * 100) / 100
    const segDurs = entries.map(e => round2(e.e - e.s))
    imageDurations = segDurs.map((d, i) => {
      let dur = d
      if (i === 0) dur += INITIAL_GAP
      if (i < segDurs.length - 1) dur += INTER_LINE_GAP
      return round2(dur)
    })
    segments = entries
    console.log(`Reusing existing subtitle (${entries.length} entries)`)
  } else {
    console.log(`\n=== Pre-generating TTS: ${scriptName} ===`)
    const pregenArgs = ['movies/pregen-tts.mjs', scriptPath]
    if (ttsProvider) pregenArgs.push('--tts', ttsProvider)
    const pregenR = spawnSync('node', pregenArgs, { stdio: 'inherit', timeout: 600000 })
    if (pregenR.status !== 0) process.exit(pregenR.status ?? 1)

    const result = await generateSubtitle(scriptPath, { ttsProvider })
    segments = result.segments
    imageDurations = result.imageDurations

    if (segments.length === 0) {
      const subtitlePath = join(genDir, `${scriptName}.subtitle`)
      const data = JSON.parse(readFileSync(subtitlePath, 'utf-8'))
      const entries = data.segments[0].entries
      const round2 = (v) => Math.round(v * 100) / 100
      const segDurs = entries.map(e => round2(e.e - e.s))
      imageDurations = segDurs.map((d, i) => {
        let dur = d
        if (i === 0) dur += INITIAL_GAP
        if (i < segDurs.length - 1) dur += INTER_LINE_GAP
        return round2(dur)
      })
      segments = entries
    }
  }

  // 2. Resize preset, orientation filter, fps
  const preset = lib.resolveSizePreset()
  const orientationFilter = lib.resolveOrientationFilter()
  const fps = lib.resolve30fps() ? 30 : 25
  const orientations = orientationFilter !== 'both'
    ? preset.orientations.filter(o => o.suffix === `_${orientationFilter}`)
    : preset.orientations

  // 3. Dynamic import to get scene() function
  const mod = await import(pathToFileURL(scriptPath).href)
  const sceneFn = mod.scene
  if (typeof sceneFn !== 'function') {
    console.error('\nERROR: Script must export a `scene()` function')
    process.exit(1)
  }

  const imageBase = parseImageBase(scriptPath)
  const segmentConfig = parseScriptConfig(scriptPath)

  // Parse optional per-segment config
  if (segmentConfig.length > 0 && segmentConfig.length !== segments.length) {
    console.error(`\nERROR: config has ${segmentConfig.length} entries but subtitle has ${segments.length} lines`)
    process.exit(1)
  }

  let anyVideo = false

  for (const { width, height, suffix } of orientations) {
    const outputVideo = join(genDir, `${scriptName}${suffix}.webm`)

    // ── 缓存检查：webm mtime >= 脚本源文件 + tts-timing ──
    if (!force) {
      const timingPath = join(genDir, `${scriptName}.tts-timing.json`)
      const srcMtime = statSync(scriptPath).mtimeMs
      const timingMtime = existsSync(timingPath) ? statSync(timingPath).mtimeMs : 0
      if (existsSync(outputVideo) &&
          statSync(outputVideo).mtimeMs >= srcMtime &&
          statSync(outputVideo).mtimeMs >= timingMtime) {
        console.log(`\n[${suffix}] ✓ Video up-to-date — skipping`)
        anyVideo = true
        continue
      }
    }

    // Scan images if imageBase is set
    let perSegmentImages = []
    if (imageBase) {
      const images = scanOrientationImages(imageBase, suffix)
      if (images.length === 0) {
        console.log(`\n[${suffix}] No images found, skipping`)
        continue
      }
      console.log(`\n[${suffix}] ${images.length} images found`)
      for (const img of images) console.log(`  ${basename(img)}`)

      // Build per-segment image list
      // HyperFrames 允许图片少于段数——不足时自动重复最后一张
      let imgIdx = 0
      for (let i = 0; i < segments.length; i++) {
        if (segmentConfig[i]?.pre_image) {
          if (i === 0) { console.error(`\nERROR: First line cannot have pre_image`); process.exit(1) }
          perSegmentImages.push(perSegmentImages[i - 1])
        } else if (imgIdx < images.length) {
          perSegmentImages.push(images[imgIdx])
          imgIdx++
        } else {
          // 图片不足，重复最后一张
          perSegmentImages.push(images[images.length - 1])
          console.log(`  ⚠ Auto-repeat last image for segment ${i + 1}`)
        }
      }
    } else {
      // No image base — still need per-segment null entries for the timeline
      perSegmentImages = segments.map(() => null)
    }

    const totalDuration = imageDurations.reduce((a, b) => a + b, 0)
    console.log(`\n  Segments: ${segments.length}, total ${totalDuration.toFixed(2)}s → ${width}×${height}`)

    // 4. Create composition dir, copy images alongside
    const hfDir = join(genDir, `.hf_${scriptName}${suffix}`)
    mkdirSync(hfDir, { recursive: true })

    // Copy each bg image into composition dir (file:// same-origin)
    const bgPaths = []
    for (let i = 0; i < segments.length; i++) {
      if (perSegmentImages[i]) {
        const ext = extname(perSegmentImages[i])
        const bgName = `bg_${i}${ext}`
        copyFileSync(perSegmentImages[i], join(hfDir, bgName))
        bgPaths.push(bgName)
      } else {
        bgPaths.push(null)
      }
    }

    // 5. Call scene() for each segment → scene HTML + animation code
    const sceneHtmls = []
    const animChunks = []
    let startTime = 0

    for (let i = 0; i < segments.length; i++) {
      const result = sceneFn({
        imagePath: bgPaths[i],
        width, height,
        duration: imageDurations[i],
        fps, index: i,
        startTime,
        totalDuration,
      })
      if (typeof result === 'string') {
        sceneHtmls.push(result)
      } else {
        sceneHtmls.push(result.html)
        if (result.animation) animChunks.push(result.animation)
      }
      startTime += imageDurations[i]
    }

    // 6. Build full composition HTML
    const totalDur = totalDuration

    let gsapCode = ''
    let cumulativeTime = 0
    for (let i = 0; i < segments.length; i++) {
      const t = cumulativeTime
      if (i > 0) {
        gsapCode += `  tl.set('#s${i-1}', {opacity:0}, ${t.toFixed(3)});\n`
        gsapCode += `  tl.set('#s${i}', {opacity:1}, ${t.toFixed(3)});\n`
      }
      cumulativeTime += imageDurations[i]
    }
    for (const chunk of animChunks) gsapCode += chunk
    gsapCode += `  tl.to({}, {duration: ${totalDur.toFixed(3)}}, ${totalDur.toFixed(3)});\n`

    const scenesHtml = sceneHtmls.map((html, i) =>
      `<div class="scene" id="s${i}"${i === 0 ? ' style="opacity:1"' : ''}>\n${html}\n</div>`
    ).join('\n')

    const compositionHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=${width}, height=${height}">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:${width}px;height:${height}px;overflow:hidden;background:#d8d8d8}
    .scene{position:absolute;top:0;left:0;width:${width}px;height:${height}px;overflow:hidden;opacity:0;background:#d8d8d8}
  </style>
</head>
<body>
<div style="position:relative;width:${width}px;height:${height}px;overflow:hidden">
${scenesHtml}
</div>
<script src="gsap.min.js"></script>
<script>
  const tl = gsap.timeline({paused:false});
${gsapCode}
</script>
</body>
</html>`

    const htmlPath = join(hfDir, 'index.html')
    writeFileSync(htmlPath, compositionHtml)

    // Copy vendor GSAP alongside the composition
    const gsapSrc = join(dirname(fileURLToPath(import.meta.url)), 'templates', 'gsap.min.js')
    if (existsSync(gsapSrc)) {
      copyFileSync(gsapSrc, join(hfDir, 'gsap.min.js'))
    }
    console.log(`  Composition written: ${htmlPath}`)

    // 6. Render with Playwright
    const tempOutput = outputVideo.replace(/\.\w+$/, '.tmp$&')

    console.log(`  Launching Playwright to record ${totalDur.toFixed(2)}s video...`)
    const browser = await chromium.launch({ headless: false, args: ['--force-device-scale-factor=1'] })
    try {
      const context = await browser.newContext({
        recordVideo: { dir: hfDir, size: { width, height } },
        viewport: { width, height },
        deviceScaleFactor: 1,
      })
      const page = await context.newPage()

      // Suppress console noise
      page.on('pageerror', err => console.error('  Page error:', err.message))

      await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle', timeout: 30000 })

      // Wait for GSAP timeline to finish (add 1s buffer for safety)
      const waitMs = Math.round(totalDur * 1000) + 1500
      console.log(`  Waiting ${(waitMs / 1000).toFixed(1)}s for playback...`)
      await page.waitForTimeout(waitMs)

      await context.close()

      // Get recorded video path
      const video = page.video()
      if (video) {
        const recordedPath = await video.path()
        if (existsSync(recordedPath)) {
          renameSync(recordedPath, tempOutput)
          console.log(`  Recorded: ${basename(recordedPath)}`)
        }
      }
    } finally {
      await browser.close()
    }

    // Cleanup temp composition dir
    rmSync(hfDir, { recursive: true, force: true })

    if (!existsSync(tempOutput)) {
      console.error(`  Failed to record video`)
      process.exit(1)
    }

    // Trim exact duration with FFmpeg (remove the buffer at the end)
    const r = spawnSync('ffmpeg', [
      '-y', '-i', tempOutput,
      '-t', totalDur.toFixed(3),
      '-c', 'copy',
      outputVideo,
    ], { stdio: 'pipe', timeout: 60000 })
    rmSync(tempOutput, { force: true })

    if (r.status !== 0) {
      console.error(`  FFmpeg trim failed:`, r.stderr.toString().slice(0, 500))
      process.exit(1)
    }
    const mb = (readFileSync(outputVideo).length / 1024 / 1024).toFixed(2)
    console.log(`  Saved: ${basename(outputVideo)} (${mb} MB)`)
    anyVideo = true
  }

  if (!anyVideo) {
    console.error('\nNo orientations rendered.')
    process.exit(1)
  }

  // 7. Burn subtitles
  const noBurn = process.argv.slice(2).includes('--no-burn')
  if (!noBurn) {
    console.log('\n=== Burning subtitles ===')
    const scriptUrl = pathToFileURL(scriptPath).href
    lib.burnVideo(scriptUrl, genDir)
  } else {
    console.log('\n--no-burn: skipping subtitle burn')
  }

  console.log('\nDone!')
}

// ── CLI ──
const scriptPath = resolve(process.argv[2])
if (!scriptPath) {
  console.error('Usage: node movies/generate-hyper-video.mjs [--tts edge-tts|tencent-tts|indextts|spark-tts] <script.mjs>')
  process.exit(1)
}
if (!existsSync(scriptPath)) {
  console.error('Script not found:', scriptPath)
  process.exit(1)
}

generateHyperVideo(scriptPath).catch(err => {
  console.error(err)
  process.exit(1)
})
